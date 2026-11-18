import { mkdtemp, readFile, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { APP_BUNDLE_NAME } from '../src/shared/update-channel.ts';
import { RELEASE_TEAM_ID } from './local-signing.ts';
import {
  entitlementKeys,
  proveReleaseBundle,
  type CommandResult,
  type ProofIo,
} from './release-proof.ts';
import { ReleaseError } from './update-publish.ts';

// Notarization of the dmg, then the proofs on what a user downloads: the mounted dmg, not the
// build folder.

/** Credentials saved once by `xcrun notarytool store-credentials sayback-notary …`. */
export const NOTARY_PROFILE = 'sayback-notary';
export const XCRUN_PROGRAM = '/usr/bin/xcrun';
export const HDIUTIL_PROGRAM = '/usr/bin/hdiutil';
export const SPCTL_PROGRAM = '/usr/sbin/spctl';
/** Past it, notarytool stops waiting; Apple goes on, `notarytool info <id>` tells the outcome. */
const NOTARY_WAIT = '1h';
/** The process itself: well past `NOTARY_WAIT`, so notarytool always ends on its own. */
export const NOTARY_PROCESS_TIMEOUT_MS = 75 * 60 * 1000;
const OUTPUT_SHOWN = 500;
const SUBMISSION_ID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

const verdictSchema = z.object({ id: z.string().min(1), status: z.string().min(1) });

/** The `--output-format json` verdict of notarytool; `null` when it printed none. */
export function notaryVerdict(stdout: string): z.infer<typeof verdictSchema> | null {
  try {
    const parsed = verdictSchema.safeParse(JSON.parse(stdout));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The submission id, as soon as notarytool printed one (JSON or text, either stream). */
export function submissionId(result: CommandResult): string | null {
  const fromJson = notaryVerdict(result.stdout)?.id;
  if (fromJson !== undefined) return fromJson;
  return SUBMISSION_ID.exec(`${result.stdout}\n${result.stderr}`)?.[0] ?? null;
}

/** How to follow a submission that is still known to Apple. */
export function followUp(id: string | null): string {
  if (id === null) return 'aucun identifiant de soumission reçu';
  return `soumission ${id} — suivre : ${XCRUN_PROGRAM} notarytool info ${id} --keychain-profile ${NOTARY_PROFILE}`;
}

/**
 * Submits the dmg and waits. Only `Accepted` with a zero exit goes on: the manual does not say
 * which code `Invalid` exits with, so the status decides. Otherwise the log is shown and it stops,
 * naming the submission whenever its id is known.
 */
export async function notarize(dmg: string, io: ProofIo): Promise<void> {
  const profile = ['--keychain-profile', NOTARY_PROFILE];
  const submit = ['notarytool', 'submit', dmg, ...profile, '--wait', '--timeout', NOTARY_WAIT];
  const submitted = await io.inspect(XCRUN_PROGRAM, [...submit, '--output-format', 'json'], {
    timeoutMs: NOTARY_PROCESS_TIMEOUT_MS,
  });
  const verdict = notaryVerdict(submitted.stdout);
  if (submitted.code === 0 && verdict?.status === 'Accepted') {
    io.log(`notarisé : ${verdict.id}`);
    return;
  }
  const id = submissionId(submitted);
  if (verdict !== null) {
    const log = await io.inspect(XCRUN_PROGRAM, ['notarytool', 'log', verdict.id, ...profile]);
    io.log(log.stdout.trim());
    throw new ReleaseError(`notarisation ${verdict.status} : ${followUp(id)} ; rien n’est publié`);
  }
  const detail = `${submitted.stdout}\n${submitted.stderr}`.trim().slice(-OUTPUT_SHOWN);
  throw new ReleaseError(
    `notarytool n’a rendu aucun verdict (code ${String(submitted.code)}), ${followUp(id)} : ${detail}`,
  );
}

async function gatekeeperAccepts(app: string, io: ProofIo): Promise<void> {
  const gate = await io.inspect(SPCTL_PROGRAM, ['-a', '-vv', '-t', 'exec', app]);
  const verdict = gate.stderr.trim();
  if (gate.code !== 0 || !/^source=Notarized Developer ID$/m.test(verdict)) {
    throw new ReleaseError(`Gatekeeper refuse l’app du dmg : ${verdict}`);
  }
  io.log(verdict);
}

/**
 * Detaches `mount`, by force if needed. A mount left behind is logged, not thrown: it would hide
 * the error that may be on its way out of the proofs.
 */
async function detach(mount: string, io: ProofIo): Promise<boolean> {
  if ((await io.inspect(HDIUTIL_PROGRAM, ['detach', mount])).code === 0) return true;
  const forced = await io.inspect(HDIUTIL_PROGRAM, ['detach', mount, '-force']);
  if (forced.code === 0) return true;
  io.log(`ATTENTION — dmg toujours monté sur ${mount} : ${forced.stderr.trim()}`);
  return false;
}

/**
 * Mounts the stapled dmg read-only and proves what a user gets: Gatekeeper accepts the app as
 * notarized, every piece of code is signed for it, and the ticket is stapled to the dmg.
 */
export async function proveDmg(dmg: string, entitlements: string, io: ProofIo): Promise<void> {
  const expected = entitlementKeys(await readFile(entitlements, 'utf8'));
  let mount: string | null = null;
  let attached = false;
  try {
    mount = await mkdtemp(join(tmpdir(), 'sayback-dmg-'));
    const attach = ['attach', dmg, '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount];
    await io.capture(HDIUTIL_PROGRAM, attach);
    attached = true;
    const app = join(mount, APP_BUNDLE_NAME);
    await gatekeeperAccepts(app, io);
    await proveReleaseBundle(app, RELEASE_TEAM_ID, expected, io);
  } finally {
    await releaseMount(mount, attached, io);
  }
  await io.capture(XCRUN_PROGRAM, ['stapler', 'validate', dmg]);
  io.log('ticket agrafé au dmg');
}

async function releaseMount(mount: string | null, attached: boolean, io: ProofIo): Promise<void> {
  if (mount === null) return;
  if (attached && !(await detach(mount, io))) return;
  // Never recursive: only an empty folder goes, never the content of a mounted dmg.
  await rmdir(mount).catch(() => undefined);
}
