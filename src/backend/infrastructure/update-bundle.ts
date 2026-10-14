import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { join } from 'node:path';
import { APP_BUNDLE_ID, APP_EXECUTABLE_NAME } from '../../shared/update-channel';
import { openRawRegularFile, rawLstatOrNull } from './raw-fs';
import { readRegularFileUpTo } from './safe-files';

// Checks of a `.app` bundle: the staged one, and the running one to replace. They rule out a
// damaged, half-copied or foreign bundle, or one placed through a symbolic link. They do NOT
// prove where it comes from: the channel trusts a folder the user can write, and the hash only
// covers app.asar. No reason carries a path: they reach the interface.

/** app.asar weighs a few dozen MB; beyond this cap it is not ours and is not read. */
export const ASAR_MAX_BYTES = 1024 * 1024 * 1024;
const PLIST_MAX_BYTES = 256 * 1024;
const HASH_CHUNK_BYTES = 1024 * 1024;
const WRITABLE_BY_OTHERS = 0o022;

export type Verdict = { ok: true } | { ok: false; reason: string };

const refuse = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** A real folder (not a link to one) owned by `uid`. `info` comes from `lstat`. */
export function isOwnDirectory(info: Stats | null, uid: number): info is Stats {
  return info !== null && info.isDirectory() && !info.isSymbolicLink() && info.uid === uid;
}

/**
 * `CFBundleIdentifier` of an XML Info.plist, or `null`. Deliberately narrow: the key must appear
 * once, at the top level of the root dictionary, followed by a string. Comments and nested
 * dictionaries do not count.
 */
export function parseBundleIdentifier(plistXml: string): string | null {
  const xml = plistXml.replace(/<!--[\s\S]*?-->/g, '');
  const root = /<plist\b[^>]*>\s*<dict>([\s\S]*)<\/dict>\s*<\/plist>/.exec(xml)?.[1];
  if (root === undefined) return null;
  // Nested dictionaries and arrays are removed, deepest first: only the top level remains.
  let top = root;
  for (;;) {
    const flattened = top.replace(
      /<(dict|array)>(?:(?!<(?:dict|array)>)[\s\S])*?<\/\1>/g,
      '<nested/>',
    );
    if (flattened === top) break;
    top = flattened;
  }
  const matches = [
    ...top.matchAll(/<key>CFBundleIdentifier<\/key>\s*(<string>([^<]*)<\/string>)?/g),
  ];
  if (matches.length !== 1) return null;
  const value = matches[0]?.[2];
  return value === undefined || value === '' ? null : value;
}

/** The identifier of the bundle at `bundlePath`, or `null` if its Info.plist cannot be read. */
export async function readBundleIdentifier(bundlePath: string): Promise<string | null> {
  try {
    const bytes = await readRegularFileUpTo(
      join(bundlePath, 'Contents', 'Info.plist'),
      PLIST_MAX_BYTES,
    );
    return bytes === null ? null : parseBundleIdentifier(bytes.toString('utf8'));
  } catch {
    return null;
  }
}

/** SHA-256 of a regular file read in chunks; `null` if absent, not regular, or over `maxBytes`. */
export async function sha256OfRegularFile(path: string, maxBytes: number): Promise<string | null> {
  let opened: Awaited<ReturnType<typeof openRawRegularFile>>;
  try {
    opened = await openRawRegularFile(path);
  } catch {
    return null;
  }
  try {
    if (opened.info.size > maxBytes) return null;
    const hash = createHash('sha256');
    const chunk = Buffer.alloc(HASH_CHUNK_BYTES);
    let position = 0;
    for (;;) {
      const { bytesRead } = await opened.handle.read(chunk, 0, chunk.length, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      // The file grew while being read: its announced size no longer bounds anything.
      if (position > maxBytes) return null;
      hash.update(chunk.subarray(0, bytesRead));
    }
    return hash.digest('hex');
  } catch {
    return null;
  } finally {
    await opened.handle.close().catch(() => undefined);
  }
}

export interface BundleExpectation {
  uid: number;
  /** Expected SHA-256 of app.asar; `null`: structure only. */
  sha256: string | null;
  asarMaxBytes?: number;
}

async function folderProblem(bundlePath: string, uid: number): Promise<string | null> {
  const root = await rawLstatOrNull(bundlePath);
  if (root === null) return 'Le paquet en attente est absent.';
  if (!isOwnDirectory(root, uid)) {
    return 'Le paquet en attente n’est pas un dossier d’application ordinaire qui vous appartient.';
  }
  if ((root.mode & WRITABLE_BY_OTHERS) !== 0) {
    return 'Le paquet en attente est inscriptible par d’autres utilisateurs.';
  }
  const contents = join(bundlePath, 'Contents');
  for (const dir of [contents, join(contents, 'MacOS'), join(contents, 'Resources')]) {
    if (!isOwnDirectory(await rawLstatOrNull(dir), uid)) {
      return 'Le paquet en attente est incomplet ou contient un lien symbolique.';
    }
  }
  return null;
}

function isOwnFile(info: Stats | null, uid: number): info is Stats {
  return info !== null && info.isFile() && info.uid === uid;
}

async function asarProblem(asarPath: string, expect: BundleExpectation): Promise<string | null> {
  if (!isOwnFile(await rawLstatOrNull(asarPath), expect.uid)) {
    return 'Le paquet en attente n’a pas de fichier app.asar ordinaire.';
  }
  if (expect.sha256 === null) return null;
  const actual = await sha256OfRegularFile(asarPath, expect.asarMaxBytes ?? ASAR_MAX_BYTES);
  if (actual === null)
    return 'Le fichier app.asar du paquet en attente est illisible ou trop volumineux.';
  if (actual !== expect.sha256)
    return 'Le paquet en attente n’a pas l’empreinte annoncée par le manifeste.';
  return null;
}

/**
 * Is the bundle at `bundlePath` an ordinary SayBack bundle? From cheapest to most expensive:
 * folders, identifier, executable, app.asar and, if expected, its hash.
 */
export async function inspectBundle(
  bundlePath: string,
  expect: BundleExpectation,
): Promise<Verdict> {
  const folders = await folderProblem(bundlePath, expect.uid);
  if (folders !== null) return refuse(folders);
  if ((await readBundleIdentifier(bundlePath)) !== APP_BUNDLE_ID) {
    return refuse('Le paquet en attente n’est pas une version de SayBack.');
  }
  const executable = await rawLstatOrNull(
    join(bundlePath, 'Contents', 'MacOS', APP_EXECUTABLE_NAME),
  );
  if (!isOwnFile(executable, expect.uid) || (executable.mode & constants.S_IXUSR) === 0) {
    return refuse('Le paquet en attente n’a pas d’exécutable.');
  }
  const asar = await asarProblem(join(bundlePath, 'Contents', 'Resources', 'app.asar'), expect);
  return asar === null ? { ok: true } : refuse(asar);
}
