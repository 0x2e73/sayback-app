// Re-signs the packaged bundle with a local code-signing identity, when one is named. macOS
// privacy permissions (screen recording, microphone) follow the designated requirement: ad hoc it
// is the hash of the build, so every update is a new app; signed, it is the certificate, so a
// permission granted once survives updates. Without an identity, the ad-hoc signature stays.

/** Name of the identity in the keychain, e.g. `SayBack Local Signing`. Unset: ad hoc. */
export const SIGNING_IDENTITY_ENV = 'SAYBACK_SIGNING_IDENTITY';
export const SECURITY_PROGRAM = '/usr/bin/security';
export const CODESIGN_PROGRAM = '/usr/bin/codesign';

/** What `signBundle` asks of the system: replaceable in tests. */
export interface SigningIo {
  /** Runs a command and returns its standard output; throws if it fails. */
  capture(command: string, args: readonly string[]): Promise<string>;
  log(line: string): void;
}

export type SigningResult = { kind: 'adhoc' } | { kind: 'identity'; hash: string };

export class SigningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SigningError';
  }
}

const IDENTITY_LINE = /^\s*\d+\)\s+([0-9A-F]{40})\s+"(.*)"/;

/**
 * SHA-1 of the code-signing identities named exactly `name`, read from `security find-identity`
 * without `-v`: a self-signed certificate is not trusted, yet codesign signs with it.
 */
export function identityHashes(findIdentityOutput: string, name: string): string[] {
  const hashes = new Set<string>();
  for (const line of findIdentityOutput.split('\n')) {
    const match = IDENTITY_LINE.exec(line);
    if (match?.[1] !== undefined && match[2] === name) hashes.add(match[1]);
  }
  return [...hashes];
}

async function resolveIdentity(name: string, io: SigningIo): Promise<string> {
  const listing = await io.capture(SECURITY_PROGRAM, ['find-identity', '-p', 'codesigning']);
  const hashes = identityHashes(listing, name);
  if (hashes.length > 1) {
    throw new SigningError(
      `plusieurs certificats s’appellent « ${name} » dans le trousseau : gardez-en un seul`,
    );
  }
  const [hash] = hashes;
  if (hash === undefined) {
    throw new SigningError(
      `aucune identité de signature « ${name} » dans le trousseau : importez-la, ou retirez ${SIGNING_IDENTITY_ENV} pour une signature ad hoc`,
    );
  }
  return hash;
}

/**
 * Signs `appPath` with the identity named `identityName`, after electron-builder flipped the fuses.
 * By hash, so a homonym cannot be picked. No hardened runtime and no entitlements, as ad hoc today:
 * under the hardened runtime a missing entitlement would silently cut the microphone.
 */
export async function signBundle(
  appPath: string,
  identityName: string | undefined,
  io: SigningIo,
): Promise<SigningResult> {
  const name = identityName?.trim() ?? '';
  if (name === '') {
    io.log(`${SIGNING_IDENTITY_ENV} absente : signature ad hoc conservée`);
    return { kind: 'adhoc' };
  }
  const hash = await resolveIdentity(name, io);
  // `--timestamp=none`: no request to Apple's timestamp server, which a local build does not need.
  const signing = ['--sign', hash, '--force', '--deep', '--timestamp=none', appPath];
  await io.capture(CODESIGN_PROGRAM, signing);
  await io.capture(CODESIGN_PROGRAM, ['--verify', '--deep', '--strict', appPath]);
  io.log(`signé avec « ${name} » (${hash.slice(0, 12)}…)`);
  return { kind: 'identity', hash };
}
