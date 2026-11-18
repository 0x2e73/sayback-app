import { deepestFirst, listMachO, nestedBundles } from './mach-o.ts';

// Re-signs the packaged bundle with a local code-signing identity, when one is named. macOS
// privacy permissions (screen recording, microphone) follow the designated requirement: ad hoc it
// is the hash of the build, so every update is a new app; signed, it is the certificate, so a
// permission granted once survives updates. Without an identity, the ad-hoc signature stays.

/** Name of the identity in the keychain, e.g. `SayBack Local Signing`. Unset: ad hoc. */
export const SIGNING_IDENTITY_ENV = 'SAYBACK_SIGNING_IDENTITY';
export const SECURITY_PROGRAM = '/usr/bin/security';
export const CODESIGN_PROGRAM = '/usr/bin/codesign';

/** Runs a command and returns its standard output; throws if it fails. */
export type Capture = (command: string, args: readonly string[]) => Promise<string>;

/** What `signBundle` asks of the system: replaceable in tests. */
export interface SigningIo {
  capture: Capture;
  log(line: string): void;
}

export interface SigningIdentity {
  name: string;
  /** SHA-1 of the certificate, as `security` prints it (upper case). */
  hash: string;
}

interface KeychainEntry {
  hash: string;
  /** `CSSMERR_…` code printed after the name, if any. */
  problem: string | null;
}

export class SigningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SigningError';
  }
}

const IDENTITY_LINE = /^\s*\d+\)\s+([0-9A-F]{40})\s+"(.*)"(?:\s+\((CSSMERR_\w+)\))?\s*$/;
// Codes that make the certificate unusable. NOT_TRUSTED is expected: self-signed, codesign accepts it.
const BLOCKING_PROBLEMS: Readonly<Record<string, string>> = {
  CSSMERR_TP_CERT_EXPIRED: 'a expiré',
  CSSMERR_TP_CERT_REVOKED: 'est révoqué',
};

/** The identity name in the environment, trimmed; `null` when unset or blank (ad hoc). */
export function signingIdentityName(
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  const name = env[SIGNING_IDENTITY_ENV]?.trim() ?? '';
  return name === '' ? null : name;
}

/**
 * Code-signing identities named exactly `name`, read from `security find-identity` without `-v`:
 * a self-signed certificate is not trusted, yet codesign signs with it. One entry per certificate.
 */
export function keychainEntries(findIdentityOutput: string, name: string): KeychainEntry[] {
  const entries = new Map<string, KeychainEntry>();
  for (const line of findIdentityOutput.split('\n')) {
    const match = IDENTITY_LINE.exec(line);
    if (match?.[1] === undefined || match[2] !== name) continue;
    const problem = match[3] ?? entries.get(match[1])?.problem ?? null;
    entries.set(match[1], { hash: match[1], problem });
  }
  return [...entries.values()];
}

async function listIdentities(capture: Capture, validOnly: boolean): Promise<string> {
  const valid = validOnly ? ['-v'] : [];
  try {
    return await capture(SECURITY_PROGRAM, ['find-identity', ...valid, '-p', 'codesigning']);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SigningError(`lecture du trousseau impossible : ${message}`);
  }
}

/**
 * Finds the certificate named `name`: refuses an absent, ambiguous, expired or revoked one.
 * `validOnly` (public releases): only a certificate the system trusts, with `find-identity -v`.
 */
export async function resolveIdentity(
  name: string,
  capture: Capture,
  validOnly = false,
): Promise<SigningIdentity> {
  const entries = keychainEntries(await listIdentities(capture, validOnly), name);
  if (entries.length > 1) {
    throw new SigningError(
      `plusieurs certificats s’appellent « ${name} » dans le trousseau : gardez-en un seul`,
    );
  }
  const [entry] = entries;
  if (entry === undefined) {
    throw new SigningError(
      `aucune identité de signature « ${name} » dans le trousseau : importez-la, ou retirez ${SIGNING_IDENTITY_ENV} pour une signature ad hoc`,
    );
  }
  const blocking = entry.problem === null ? undefined : BLOCKING_PROBLEMS[entry.problem];
  if (blocking !== undefined) {
    throw new SigningError(`le certificat « ${name} » ${blocking} : créez-en un autre`);
  }
  return { name, hash: entry.hash };
}

/** The designated requirement of `appPath`. `-r-` writes it on standard output. */
export async function readDesignatedRequirement(
  appPath: string,
  capture: Capture,
): Promise<string> {
  const output = await capture(CODESIGN_PROGRAM, ['-d', '-r-', appPath]);
  const requirement = /designated => (.+)$/m.exec(output)?.[1];
  if (requirement === undefined) {
    throw new SigningError(`exigence désignée illisible pour ${appPath}`);
  }
  return requirement.trim();
}

/** SHA-1 (lower case) of the `certificate leaf` a requirement names, or `null` (ad hoc…). */
export function certificateLeaf(requirement: string): string | null {
  return /certificate leaf = H"([0-9a-fA-F]{40})"/.exec(requirement)?.[1]?.toLowerCase() ?? null;
}

/** The team of a certificate issued by Apple, from its name: `… (ABCDE12345)`; else `null`. */
function nameTeam(name: string): string | null {
  return /\(([A-Z0-9]{10})\)$/.exec(name)?.[1] ?? null;
}

/**
 * The team a requirement names, when it anchors to Apple: codesign writes this, not the leaf hash,
 * for a Developer ID or Apple Development certificate. It stays the same when the certificate is
 * renewed, so the permissions do too.
 */
function requirementTeam(requirement: string): string | null {
  if (!/\banchor apple generic\b/.test(requirement)) return null;
  return /certificate leaf\[subject\.OU\] = "?([A-Z0-9]{10})"?/.exec(requirement)?.[1] ?? null;
}

/** The requirement names a certificate (self-signed or Apple's), not the hash of one build. */
export function signedByCertificate(requirement: string): boolean {
  return certificateLeaf(requirement) !== null || requirementTeam(requirement) !== null;
}

/** The requirement names `identity`: its leaf hash (self-signed) or its Apple team. */
export function requirementNamesIdentity(requirement: string, identity: SigningIdentity): boolean {
  if (certificateLeaf(requirement) === identity.hash.toLowerCase()) return true;
  const team = requirementTeam(requirement);
  return team !== null && team === nameTeam(identity.name);
}

/** How a build is signed, for the logs: certificate name and leaf hash, or ad hoc. */
export function describeSigning(identity: SigningIdentity | null): string {
  if (identity === null) return 'ad hoc';
  return `certificat « ${identity.name} », certificate leaf = H"${identity.hash.toLowerCase()}"`;
}

/** Proves the goal: the designated requirement names `identity` (or its Apple team). By hash, so a
 * homonym cannot be picked. */
async function proveSignedBy(
  appPath: string,
  identity: SigningIdentity,
  io: SigningIo,
): Promise<void> {
  await io.capture(CODESIGN_PROGRAM, ['--verify', '--deep', '--strict', appPath]);
  const requirement = await readDesignatedRequirement(appPath, io.capture);
  if (!requirementNamesIdentity(requirement, identity)) {
    throw new SigningError(
      `signé, mais l’exigence désignée ne nomme pas le certificat : ${requirement}`,
    );
  }
  io.log(`signé : ${describeSigning(identity)}`);
}

/**
 * Signs `appPath` with `identity`, after electron-builder flipped the fuses. No hardened runtime
 * and no entitlements, as ad hoc: a missing entitlement would cut the microphone.
 */
export async function signBundle(
  appPath: string,
  identity: SigningIdentity,
  io: SigningIo,
): Promise<void> {
  // `--timestamp=none`: no request to Apple's timestamp server, which a local build does not need.
  const signing = ['--sign', identity.hash, '--force', '--deep', '--timestamp=none', appPath];
  await io.capture(CODESIGN_PROGRAM, signing);
  await proveSignedBy(appPath, identity, io);
}

/** Team of the Developer ID that signs public releases. */
export const RELEASE_TEAM_ID = 'AQ6TKNAF9V';

/** Only the project's Developer ID: the certificate Apple notarizes and Gatekeeper trusts. */
export function assertReleaseIdentity(name: string): void {
  if (name.startsWith('Developer ID Application: ') && nameTeam(name) === RELEASE_TEAM_ID) return;
  throw new SigningError(
    `« ${name} » ne signe pas une version publique : il faut « Developer ID Application: … (${RELEASE_TEAM_ID}) »`,
  );
}

/**
 * Signs a public release for notarization: every Mach-O and nested bundle on its own, deepest
 * first, with hardened runtime and a secure timestamp. `entitlements` goes on the `.app` bundles
 * only (the app and its helpers), never on a library or framework.
 */
export async function signBundleForRelease(
  appPath: string,
  identity: SigningIdentity,
  entitlements: string,
  io: SigningIo,
): Promise<void> {
  assertReleaseIdentity(identity.name);
  const nested = [...(await listMachO(appPath, io.capture)), ...(await nestedBundles(appPath))];
  for (const target of [...deepestFirst(nested), appPath]) {
    const options = ['--sign', identity.hash, '--force', '--options', 'runtime', '--timestamp'];
    const granted = target.endsWith('.app') ? ['--entitlements', entitlements] : [];
    await io.capture(CODESIGN_PROGRAM, [...options, ...granted, target]);
  }
  await proveSignedBy(appPath, identity, io);
}
