import { mkdtemp, readFile, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { APP_BUNDLE_NAME } from '../src/shared/update-channel.ts';
import { RELEASE_TEAM_ID } from './local-signing.ts';
import { entitlementKeys, proveReleaseBundle, type ProofIo } from './release-proof.ts';
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
const STDERR_SHOWN = 500;

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

/**
 * Submits the dmg and waits. Only `Accepted` with a zero exit goes on: the manual does not say
 * which code `Invalid` exits with, so the status decides. Otherwise the log is shown and it stops.
 */
export async function notarize(dmg: string, io: ProofIo): Promise<void> {
  const profile = ['--keychain-profile', NOTARY_PROFILE];
  const submitted = await io.inspect(XCRUN_PROGRAM, [
    'notarytool',
    'submit',
    dmg,
    ...profile,
    '--wait',
    '--timeout',
    NOTARY_WAIT,
    '--output-format',
    'json',
  ]);
  const verdict = notaryVerdict(submitted.stdout);
  if (submitted.code === 0 && verdict?.status === 'Accepted') {
    io.log(`notarisé : ${verdict.id}`);
    return;
  }
  if (verdict === null) {
    const detail = submitted.stderr.trim().slice(-STDERR_SHOWN);
    throw new ReleaseError(
      `notarytool n’a rendu aucun verdict (code ${String(submitted.code)}) : ${detail}`,
    );
  }
  const log = await io.inspect(XCRUN_PROGRAM, ['notarytool', 'log', verdict.id, ...profile]);
  io.log(log.stdout.trim());
  throw new ReleaseError(`notarisation ${verdict.status} (${verdict.id}) : rien n’est publié`);
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
 * Mounts the stapled dmg read-only and proves what a user gets: Gatekeeper accepts the app as
 * notarized, every piece of code is signed for it, and the ticket is stapled to the dmg.
 */
export async function proveDmg(dmg: string, entitlements: string, io: ProofIo): Promise<void> {
  const expected = entitlementKeys(await readFile(entitlements, 'utf8'));
  const mount = await mkdtemp(join(tmpdir(), 'sayback-dmg-'));
  const attach = ['attach', dmg, '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount];
  await io.capture(HDIUTIL_PROGRAM, attach);
  try {
    const app = join(mount, APP_BUNDLE_NAME);
    await gatekeeperAccepts(app, io);
    await proveReleaseBundle(app, RELEASE_TEAM_ID, expected, io);
  } finally {
    await io.inspect(HDIUTIL_PROGRAM, ['detach', mount]);
    // Never recursive: if the detach failed, the dmg is still mounted there.
    await rmdir(mount).catch(() => undefined);
  }
  await io.capture(XCRUN_PROGRAM, ['stapler', 'validate', dmg]);
  io.log('ticket agrafé au dmg');
}
