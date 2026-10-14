import type { Stats } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  UPDATE_MANIFEST_MAX_BYTES,
  UPDATE_MANIFEST_NAME,
  updateManifestSchema,
  type UpdateManifest,
} from '../../shared/update-channel';
import { isNewer, type BuildIdentity } from '../domain/update';
import type {
  ChannelReadOptions,
  ChannelReader,
  ChannelReading,
} from '../application/update-ports';
import { inspectBundle } from './update-bundle';
import { rawLstatOrNull } from './raw-fs';
import { WRITABLE_BY_OTHERS, errnoOf, readRegularFileUpTo } from './safe-files';

// Reads `updates/latest.json`, then the bundle it names. An update is available only if ALL
// holds: strictly valid manifest, newer build, compliant staged bundle. The manifest is written
// last by the publish script: a bundle without manifest is a copy in progress, never offered.

const MESSAGES = {
  manifestInvalid: 'Le manifeste du canal de mise à jour est invalide.',
  manifestTooLarge: 'Le manifeste du canal de mise à jour est trop volumineux.',
  manifestNotAFile: 'Le manifeste du canal de mise à jour n’est pas un fichier ordinaire.',
  channelNotADirectory:
    'Le dossier du canal de mise à jour n’est pas un dossier ordinaire qui vous appartient.',
  channelWritableByOthers:
    'Le dossier du canal de mise à jour est inscriptible par d’autres utilisateurs.',
} as const;

type ManifestReading =
  | { kind: 'absent' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'ok'; manifest: UpdateManifest };

/** Never through a symbolic link, never beyond its cap, never waiting. */
async function readManifest(updatesDir: string): Promise<ManifestReading> {
  let bytes: Buffer | null;
  try {
    bytes = await readRegularFileUpTo(
      join(updatesDir, UPDATE_MANIFEST_NAME),
      UPDATE_MANIFEST_MAX_BYTES,
    );
  } catch (error) {
    if (errnoOf(error) === 'ENOENT') return { kind: 'absent' };
    return { kind: 'invalid', reason: MESSAGES.manifestNotAFile };
  }
  if (bytes === null) return { kind: 'invalid', reason: MESSAGES.manifestTooLarge };
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { kind: 'invalid', reason: MESSAGES.manifestInvalid };
  }
  const parsed = updateManifestSchema.safeParse(raw);
  if (!parsed.success) return { kind: 'invalid', reason: MESSAGES.manifestInvalid };
  return { kind: 'ok', manifest: parsed.data };
}

async function channelProblem(updatesDir: string, uid: number): Promise<ChannelReading | null> {
  let dir: Stats;
  try {
    dir = await lstat(updatesDir);
  } catch (error) {
    if (errnoOf(error) === 'ENOENT') return { kind: 'none' };
    return { kind: 'invalid', reason: MESSAGES.channelNotADirectory };
  }
  if (!dir.isDirectory() || dir.isSymbolicLink() || dir.uid !== uid) {
    return { kind: 'invalid', reason: MESSAGES.channelNotADirectory };
  }
  if ((dir.mode & WRITABLE_BY_OTHERS) !== 0) {
    return { kind: 'invalid', reason: MESSAGES.channelWritableByOthers };
  }
  return null;
}

/** What identifies the verified app.asar: if it changes, the hash must be recomputed. */
function fingerprint(sha256: string, asar: Stats): string {
  return [sha256, asar.ino, asar.size, asar.mtimeMs, asar.ctimeMs].join(':');
}

export interface ChannelReaderOptions {
  updatesDir: string;
  /** The current user: the channel folder and the bundle must belong to them. */
  uid: number;
}

export function createChannelReader(
  options: ChannelReaderOptions,
): ChannelReader & { hashCount(): number } {
  const { updatesDir, uid } = options;
  let verified: string | null = null;
  let hashes = 0;

  async function read(
    current: BuildIdentity,
    readOptions: ChannelReadOptions = {},
  ): Promise<ChannelReading> {
    const problem = await channelProblem(updatesDir, uid);
    if (problem !== null) return problem;
    const reading = await readManifest(updatesDir);
    if (reading.kind === 'absent') return { kind: 'none' };
    if (reading.kind === 'invalid') return reading;
    const { manifest } = reading;
    // Nothing newer: the bundle is not even opened.
    if (!isNewer(manifest, current)) return { kind: 'none' };
    // `manifest.bundle` is a single name (schema): it cannot leave the channel folder.
    const bundlePath = join(updatesDir, manifest.bundle);
    const asar = await rawLstatOrNull(join(bundlePath, 'Contents', 'Resources', 'app.asar'));
    const key = asar === null ? null : fingerprint(manifest.sha256, asar);
    const skipHash = readOptions.fresh !== true && key !== null && key === verified;
    if (!skipHash) hashes += 1;
    const verdict = await inspectBundle(bundlePath, {
      uid,
      sha256: skipHash ? null : manifest.sha256,
    });
    if (!verdict.ok) {
      verified = null;
      return { kind: 'invalid', reason: verdict.reason };
    }
    verified = key;
    return { kind: 'available', manifest };
  }

  return { read, hashCount: () => hashes };
}
