import { randomBytes } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { mkdir, open, rename, stat, unlink, type FileHandle } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

// File access for paths SayBack did not write itself (update channel). Imports nothing from the
// repository: Node loads it as is from `scripts/`.

export function errnoOf(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

/**
 * A read-only open that never waits: a named pipe without writer or a device would otherwise
 * block a libuv thread forever. To be completed by a check on the opened descriptor.
 */
export const OPEN_READ_FLAGS = constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOCTTY;

export class NotRegularFileError extends Error {
  readonly code = 'ENOTREG';

  constructor(path: string) {
    super(`pas un fichier ordinaire : ${path}`);
    this.name = 'NotRegularFileError';
  }
}

/**
 * Opens a regular file for reading, never through a final symbolic link (`ELOOP`). The type is
 * read on the opened descriptor, not on the path. The caller closes `handle`.
 */
export async function openRegularFile(path: string): Promise<{ handle: FileHandle; info: Stats }> {
  const handle = await open(path, OPEN_READ_FLAGS | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new NotRegularFileError(path);
    return { handle, info };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

export interface PositionalReader {
  read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number }>;
}

/** Reads `maxBytes` at most from the start; `exceeded` when the file holds more. */
export async function readUpTo(
  reader: PositionalReader,
  maxBytes: number,
): Promise<{ bytes: Buffer; exceeded: boolean }> {
  const buffer = Buffer.alloc(maxBytes + 1);
  let total = 0;
  while (total < buffer.length) {
    const { bytesRead } = await reader.read(buffer, total, buffer.length - total, total);
    if (bytesRead === 0) break;
    total += bytesRead;
  }
  if (total > maxBytes) return { bytes: buffer.subarray(0, maxBytes), exceeded: true };
  return { bytes: buffer.subarray(0, total), exceeded: false };
}

/** Reads a whole regular file of at most `maxBytes`; `null` when it is larger. */
export async function readRegularFileUpTo(path: string, maxBytes: number): Promise<Buffer | null> {
  const { handle, info } = await openRegularFile(path);
  try {
    if (info.size > maxBytes) return null;
    const read = await readUpTo(handle, maxBytes);
    return read.exceeded ? null : read.bytes;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

interface AtomicWriteOptions {
  mode: number;
  /** Creates the parent folder with these rights when missing. */
  ensureDirMode?: number;
}

/**
 * Writes without ever exposing partial content: exclusive sibling file, `fsync`, rename. On
 * failure the sibling is removed and `target` is unchanged.
 */
export async function writeFileAtomic(
  target: string,
  data: string,
  options: AtomicWriteOptions,
): Promise<void> {
  const dir = dirname(target);
  if (options.ensureDirMode !== undefined) {
    await mkdir(dir, { recursive: true, mode: options.ensureDirMode });
  }
  const temp = join(dir, `.${basename(target)}.${randomBytes(6).toString('hex')}.tmp`);
  let handle: FileHandle | null = null;
  try {
    handle = await open(
      temp,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      options.mode,
    );
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temp, target);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

/**
 * Appends a line to a log (folder 700, file 600), never through a symbolic link. When the line
 * would exceed `maxBytes`, the file becomes `<name>.1` (one old copy kept).
 */
export async function appendLogLine(path: string, line: string, maxBytes: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const size = await stat(path).then(
    (info) => info.size,
    (error: unknown) => {
      if (errnoOf(error) === 'ENOENT') return 0;
      throw error;
    },
  );
  if (size > 0 && size + Buffer.byteLength(line) > maxBytes) await rename(path, `${path}.1`);
  const flags = constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW;
  const handle = await open(path, flags, 0o600);
  try {
    await handle.write(line);
  } finally {
    await handle.close();
  }
}
