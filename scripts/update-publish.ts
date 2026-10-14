import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, lstat, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { writeFileAtomic } from '../src/backend/infrastructure/safe-files.ts';
import {
  APP_BUNDLE_NAME,
  UPDATE_MANIFEST_NAME,
  toManifestNotes,
  updateManifestSchema,
  type UpdateManifest,
} from '../src/shared/update-channel.ts';

// Stages a built `.app` in the local update channel. Order, so that a half-copied bundle is never
// offered: the old manifest goes first, the bundle is copied under a provisional name and hashed,
// it takes the place of the old one, and the manifest is written LAST (sibling, fsync, rename).

const run = promisify(execFile);
const DITTO = '/usr/bin/ditto';
const INCOMING_PREFIX = '.incoming-';

export class ReleaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseError';
  }
}

export function sha256File(path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

export interface PublishInput {
  appPath: string;
  /** `appData/SayBack/updates`. */
  updatesDir: string;
  /** Identity of the packaged build (its `build-info.json`). */
  info: { version: string; commit: string; builtAt: string };
  notes?: string | undefined;
}

const isFile = (path: string) =>
  stat(path).then(
    (info) => info.isFile(),
    () => false,
  );

async function prepareChannel(updatesDir: string): Promise<void> {
  await mkdir(updatesDir, { recursive: true, mode: 0o700 });
  const dir = await lstat(updatesDir);
  if (!dir.isDirectory() || dir.isSymbolicLink()) {
    throw new ReleaseError(`le dossier du canal n'est pas un dossier ordinaire : ${updatesDir}`);
  }
  // The app refuses a channel others can write.
  await chmod(updatesDir, 0o700);
  await rm(join(updatesDir, UPDATE_MANIFEST_NAME), { force: true });
  // Leftovers of an interrupted publication.
  for (const name of await readdir(updatesDir)) {
    if (name.startsWith(INCOMING_PREFIX)) {
      await rm(join(updatesDir, name), { recursive: true, force: true });
    }
  }
}

/** Copies the bundle next to the staged one, then swaps them. Returns the hash of its app.asar. */
async function stageBundle(appPath: string, updatesDir: string): Promise<string> {
  const incoming = join(updatesDir, `${INCOMING_PREFIX}${randomBytes(6).toString('hex')}`);
  const staged = join(updatesDir, APP_BUNDLE_NAME);
  try {
    // `ditto` keeps what makes an app bundle: framework links, rights, extended attributes.
    await run(DITTO, [appPath, incoming]);
    await chmod(incoming, 0o755);
    const sha256 = await sha256File(join(incoming, 'Contents', 'Resources', 'app.asar'));
    await rm(staged, { recursive: true, force: true });
    await rename(incoming, staged);
    return sha256;
  } catch (error) {
    await rm(incoming, { recursive: true, force: true });
    throw error;
  }
}

/** Nothing is touched when the source is not a bundle. */
export async function publishToChannel(input: PublishInput): Promise<UpdateManifest> {
  const { appPath, updatesDir } = input;
  if (!(await isFile(join(appPath, 'Contents', 'Resources', 'app.asar')))) {
    throw new ReleaseError(`paquet introuvable ou incomplet : ${appPath}`);
  }
  await prepareChannel(updatesDir);
  const sha256 = await stageBundle(appPath, updatesDir);
  const notes = input.notes === undefined ? undefined : toManifestNotes(input.notes);
  // The schema the app applies: a manifest it would refuse is not written.
  const manifest = updateManifestSchema.parse({
    version: input.info.version,
    commit: input.info.commit,
    builtAt: input.info.builtAt,
    bundle: APP_BUNDLE_NAME,
    sha256,
    ...(notes === undefined ? {} : { notes }),
  });
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFileAtomic(join(updatesDir, UPDATE_MANIFEST_NAME), text, { mode: 0o600 });
  return manifest;
}
