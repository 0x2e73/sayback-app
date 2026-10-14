import { constants, type Stats } from 'node:fs';
import type * as NodeFs from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { NotRegularFileError, OPEN_READ_FLAGS } from './safe-files';

// Node's `fs` WITHOUT Electron's asar layer. In Electron, any path through a `.asar` file is read
// as an archive: `lstat('…/app.asar')` reports a folder and `open` fails. That is right for the
// running app and wrong for the app.asar of ANOTHER bundle (the staged update), which must be
// hashed byte by byte. `original-fs` is Electron's raw module; under Node it does not exist and
// `node:fs` is already raw.
const nodeRequire = createRequire(import.meta.url);
const rawFs: typeof NodeFs = nodeRequire(
  process.versions.electron === undefined ? 'node:fs' : 'original-fs',
);

export async function rawLstatOrNull(path: string): Promise<Stats | null> {
  try {
    return await rawFs.promises.lstat(path);
  } catch {
    return null;
  }
}

/** Same guarantees as `openRegularFile`, through the raw `fs`. The caller closes `handle`. */
export async function openRawRegularFile(
  path: string,
): Promise<{ handle: FileHandle; info: Stats }> {
  const handle = await rawFs.promises.open(path, OPEN_READ_FLAGS | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new NotRegularFileError(path);
    return { handle, info };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}
