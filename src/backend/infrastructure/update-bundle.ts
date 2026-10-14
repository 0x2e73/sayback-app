import { execFile } from 'node:child_process';
import { constants, type Stats } from 'node:fs';
import { join } from 'node:path';
import { APP_BUNDLE_ID, APP_EXECUTABLE_NAME, ASAR_MAX_BYTES } from '../../shared/update-channel';
import { openRawRegularFile, rawLstatOrNull } from './raw-fs';
import { readRegularFileUpTo, sha256OfOpenFile, WRITABLE_BY_OTHERS } from './safe-files';

// Checks of a `.app` bundle: the staged one, and the running one to replace. They rule out a
// damaged, half-copied or foreign bundle, or one placed through a symbolic link. They do NOT
// prove where it comes from: the channel trusts a folder the user can write. Accepted limits:
// the hash only covers app.asar (not the executable nor the frameworks), and the bundle may still
// change between this check and the copy (the script re-hashes app.asar after copying). No reason
// carries a path: they reach the interface.

const PLIST_MAX_BYTES = 256 * 1024;
const PLUTIL = '/usr/bin/plutil';
const PLUTIL_TIMEOUT_MS = 5_000;
const IDENTIFIER_MAX_BYTES = 1024;

export type Verdict = { ok: true } | { ok: false; reason: string };

const refuse = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** A real folder (not a link to one) owned by `uid`. `info` comes from `lstat`. */
export function isOwnDirectory(info: Stats | null, uid: number): info is Stats {
  return info !== null && info.isDirectory() && !info.isSymbolicLink() && info.uid === uid;
}

/** Top-level `CFBundleIdentifier` of a property list (XML, binary or JSON), if it is a string. */
function extractIdentifier(plist: Buffer): Promise<string | null> {
  const args = ['-extract', 'CFBundleIdentifier', 'raw', '-expect', 'string', '-o', '-', '-'];
  return new Promise((resolve) => {
    const child = execFile(
      PLUTIL,
      args,
      { timeout: PLUTIL_TIMEOUT_MS, maxBuffer: IDENTIFIER_MAX_BYTES, encoding: 'utf8' },
      (error, stdout) => resolve(error ? null : stdout.replace(/\n$/, '') || null),
    );
    child.stdin?.on('error', () => resolve(null));
    child.stdin?.end(plist);
  });
}

/**
 * The identifier of the bundle at `bundlePath`, or `null` if its Info.plist cannot be read. The
 * bytes are read here (never through a link, 256 KB at most) and handed to plutil on its input.
 */
export async function readBundleIdentifier(bundlePath: string): Promise<string | null> {
  try {
    const plistPath = join(bundlePath, 'Contents', 'Info.plist');
    const bytes = await readRegularFileUpTo(plistPath, PLIST_MAX_BYTES);
    return bytes === null ? null : await extractIdentifier(bytes);
  } catch {
    return null;
  }
}

/** SHA-256 of a regular file through the raw `fs`; `null` if absent, not regular, or too big. */
export async function sha256OfRegularFile(path: string, maxBytes: number): Promise<string | null> {
  let opened: Awaited<ReturnType<typeof openRawRegularFile>>;
  try {
    opened = await openRawRegularFile(path);
  } catch {
    return null;
  }
  try {
    if (opened.info.size > maxBytes) return null;
    return await sha256OfOpenFile(opened.handle, maxBytes);
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
