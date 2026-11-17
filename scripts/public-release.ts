import { readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { LOCAL_UPDATE_CHANNEL_ENV, buildInfoSchema } from '../src/shared/update-channel.ts';
import { findBuiltApp } from './built-app.ts';
import {
  CODESIGN_PROGRAM,
  SIGNING_IDENTITY_ENV,
  assertReleaseIdentity,
  resolveIdentity,
  signBundleForRelease,
  type SigningIdentity,
} from './local-signing.ts';
import { notarize, proveDmg, XCRUN_PROGRAM } from './release-notary.ts';
import type { Inspect, ProofIo } from './release-proof.ts';
import { ReleaseError, sha256File } from './update-publish.ts';
import type { ReleaseIo } from './update-release.ts';

// `npm run release`: builds the current commit, signs it with the Developer ID, notarizes and
// staples the dmg, proves the result, then stops. Tagging and publishing stay manual.

export interface PublicReleaseStep {
  label: string;
  command: string;
  args: readonly string[];
}

/** In order, in the repository; the first that fails stops everything. */
const BUILD_STEPS: readonly PublicReleaseStep[] = [
  { label: 'check', command: 'npm', args: ['run', 'check'] },
  // `npm run build`, not bare electron-vite: it also writes the build-info.json the app reads.
  { label: 'build', command: 'npm', args: ['run', 'build'] },
  { label: 'package', command: 'npx', args: ['electron-builder', '--dir', '--publish', 'never'] },
];
/** The dmg made from the bundle already signed; electron-builder never signs (`identity: null`). */
const DMG_STEP: PublicReleaseStep = {
  label: 'dmg',
  command: 'node',
  args: ['scripts/dist-cli.ts'],
};
export const PUBLIC_RELEASE_STEPS: readonly PublicReleaseStep[] = [...BUILD_STEPS, DMG_STEP];

/** A public build never carries the local update channel, whatever the shell exports. */
const STEP_ENV = { [LOCAL_UPDATE_CHANNEL_ENV]: '0' };
export const CHECKSUMS_NAME = 'SHA256SUMS';

export type PublicReleaseIo = ReleaseIo & { inspect: Inspect };

export interface PublicReleaseContext {
  repoRoot: string;
  io: PublicReleaseIo;
  /** `SAYBACK_SIGNING_IDENTITY`, `null` when unset. */
  identityName: string | null;
  /** The parsed `build-info.json` packaged in this app.asar. */
  readBuildInfo(asarPath: string): Promise<unknown>;
}

export interface PublicReleaseResult {
  version: string;
  commit: string;
  dmg: string;
  checksums: string;
}

function proofIo(context: PublicReleaseContext): ProofIo {
  const { io, repoRoot } = context;
  return {
    capture: (command, args) => io.capture(command, args, repoRoot),
    inspect: (command, args) => io.inspect(command, args),
    log: (line) => {
      io.log(line);
    },
  };
}

/** Before any build: a Developer ID of the project's team, and a clean tree. */
async function prepare(context: PublicReleaseContext) {
  const { io, repoRoot, identityName } = context;
  if (identityName === null) {
    throw new ReleaseError(`${SIGNING_IDENTITY_ENV} absente : exportez le Developer ID`);
  }
  assertReleaseIdentity(identityName);
  const identity = await resolveIdentity(identityName, proofIo(context).capture);
  const status = await io.capture('git', ['status', '--porcelain'], repoRoot);
  if (status.trim() !== '') {
    throw new ReleaseError(
      'l’arbre de travail a des modifications non commitées : committez d’abord',
    );
  }
  const commit = (await io.capture('git', ['rev-parse', 'HEAD'], repoRoot)).trim();
  return { identity, commit };
}

async function runStep(step: PublicReleaseStep, context: PublicReleaseContext): Promise<void> {
  context.io.log(`étape « ${step.label} » : ${[step.command, ...step.args].join(' ')}`);
  const code = await context.io.run(step.command, step.args, context.repoRoot, STEP_ENV);
  if (code !== 0) {
    throw new ReleaseError(`étape « ${step.label} » en échec (code ${String(code)})`);
  }
}

/** The packaged identity: this commit, local update channel closed. */
async function checkPackaged(appPath: string, commit: string, context: PublicReleaseContext) {
  const asar = join(appPath, 'Contents', 'Resources', 'app.asar');
  const info = buildInfoSchema.parse(await context.readBuildInfo(asar));
  if (info.localUpdateChannel) {
    throw new ReleaseError('le paquet porte le canal de mise à jour local : rien n’est publié');
  }
  if (info.commit !== commit) {
    throw new ReleaseError(`le paquet dit venir de ${info.commit}, pas de ${commit}`);
  }
  return info;
}

async function dmgsIn(distDir: string): Promise<string[]> {
  const names = await readdir(distDir).catch((): string[] => []);
  return names.filter((name) => name.endsWith('.dmg')).map((name) => join(distDir, name));
}

/** Makes the dmg from the signed app, signs it. Older dmgs go first so the new one is unambiguous. */
async function makeDmg(identity: SigningIdentity, context: PublicReleaseContext): Promise<string> {
  const distDir = join(context.repoRoot, 'dist');
  for (const stale of await dmgsIn(distDir)) await rm(stale, { force: true });
  await runStep(DMG_STEP, context);
  const [dmg, ...others] = await dmgsIn(distDir);
  if (dmg === undefined || others.length > 0) {
    throw new ReleaseError(`un seul dmg attendu dans ${distDir}`);
  }
  const { capture } = proofIo(context);
  await capture(CODESIGN_PROGRAM, ['--sign', identity.hash, '--force', '--timestamp', dmg]);
  await capture(CODESIGN_PROGRAM, ['--verify', '--strict', dmg]);
  return dmg;
}

async function writeChecksums(dmg: string): Promise<string> {
  const path = join(dmg, '..', CHECKSUMS_NAME);
  await writeFile(path, `${await sha256File(dmg)}  ${basename(dmg)}\n`);
  return path;
}

/** Everything up to a stapled, proven dmg and its checksum. Publishes nothing. */
export async function runPublicRelease(
  context: PublicReleaseContext,
): Promise<PublicReleaseResult> {
  const { identity, commit } = await prepare(context);
  for (const step of BUILD_STEPS) await runStep(step, context);
  const appPath = await findBuiltApp(context.repoRoot);
  const info = await checkPackaged(appPath, commit, context);
  const entitlements = join(context.repoRoot, 'build', 'entitlements.mac.plist');
  await signBundleForRelease(appPath, identity, entitlements, proofIo(context));
  const dmg = await makeDmg(identity, context);
  await notarize(dmg, proofIo(context));
  await proofIo(context).capture(XCRUN_PROGRAM, ['stapler', 'staple', dmg]);
  await proveDmg(dmg, entitlements, proofIo(context));
  const checksums = await writeChecksums(dmg);
  return { version: info.version, commit, dmg, checksums };
}

/** What Salim runs once the test account opened the dmg without a warning. */
export function publicationCommands(result: PublicReleaseResult): string[] {
  const tag = `v${result.version}`;
  return [
    `git tag ${tag} ${result.commit}`,
    `git push origin ${tag}`,
    `gh release create ${tag} --verify-tag --draft "${result.dmg}" "${result.checksums}"`,
  ];
}
