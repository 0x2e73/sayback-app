import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { Capture } from './local-signing.ts';

// The code inside a bundle, as a notarized release must sign it piece by piece: `codesign --deep`
// leaves some of it ad hoc (ShipIt, libffmpeg.dylib…), which the notary service refuses.

export const FILE_PROGRAM = '/usr/bin/file';

const BUNDLE_EXTENSIONS = ['.app', '.framework'];

/**
 * Entries under `root`, never through a symlink: a framework's `Versions/Current` is not code
 * twice. Walked by hand, as `readdir({ recursive: true })` follows symlinked folders.
 */
async function entriesUnder(root: string): Promise<Dirent[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entriesUnder(join(entry.parentPath, entry.name))),
  );
  return [...entries, ...nested.flat()];
}

/** Paths whose `file -0` description says Mach-O (thin or universal). */
export function machOPaths(fileOutput: string): string[] {
  const paths: string[] = [];
  for (const line of fileOutput.split('\n')) {
    const end = line.indexOf('\0');
    if (end === -1) continue;
    const description = line.slice(end + 1).replace(/^:\s*/, '');
    if (description.startsWith('Mach-O')) paths.push(line.slice(0, end));
  }
  return paths;
}

/** Every Mach-O file of `root`, recognized by `file`, not by its name. */
export async function listMachO(root: string, capture: Capture): Promise<string[]> {
  const files = (await entriesUnder(root))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
  if (files.length === 0) return [];
  return machOPaths(await capture(FILE_PROGRAM, ['-0', '-N', '--', ...files]));
}

/** `.app` and `.framework` folders nested in `root`. */
export async function nestedBundles(root: string): Promise<string[]> {
  return (await entriesUnder(root))
    .filter((entry) => entry.isDirectory())
    .filter((entry) => BUNDLE_EXTENSIONS.some((extension) => entry.name.endsWith(extension)))
    .map((entry) => join(entry.parentPath, entry.name));
}

const depth = (path: string) => path.split(sep).length;

/** Deepest first: a bundle is sealed after the code it contains. */
export function deepestFirst(paths: readonly string[]): string[] {
  return [...paths].sort((a, b) => depth(b) - depth(a) || a.localeCompare(b));
}

/** The bundle itself and its main executable carry the entitlements; nothing else does. */
export function carriesEntitlements(path: string): boolean {
  return path.endsWith('.app') || /\.app\/Contents\/MacOS\/[^/]+$/.test(path);
}
