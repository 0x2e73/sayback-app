import { constants } from 'node:fs';
import { access, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, sep } from 'node:path';
import { APP_BUNDLE_ID } from '../../shared/update-channel';
import type { TargetVerdict } from '../application/update-ports';
import { isOwnDirectory, readBundleIdentifier } from './update-bundle';
import { rawLstatOrNull } from './raw-fs';
import { errnoOf } from './safe-files';

const BUNDLE_SUFFIX = '.app';
const PREVIOUS_SUFFIX = '.previous.app';
/** macOS runs a quarantined app from a read-only copy under a folder of this name. */
const TRANSLOCATION_SEGMENT = 'AppTranslocation';

const refuse = (reason: string): TargetVerdict => ({ ok: false, reason });

/** The `.app` of `<x>.app/Contents/MacOS/<executable>`, or `null`. Purely syntactic. */
export function bundleOfExecutable(exePath: string): string | null {
  if (!isAbsolute(exePath)) return null;
  const macos = dirname(exePath);
  const contents = dirname(macos);
  const bundle = dirname(contents);
  if (basename(macos) !== 'MacOS' || basename(contents) !== 'Contents') return null;
  const named = basename(bundle).length > BUNDLE_SUFFIX.length && bundle.endsWith(BUNDLE_SUFFIX);
  return named ? bundle : null;
}

/** Where the replaced version is kept: next to it, a single backup. */
export function previousPathOf(bundlePath: string): string {
  return `${bundlePath.slice(0, -BUNDLE_SUFFIX.length)}${PREVIOUS_SUFFIX}`;
}

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

async function parentProblem(bundlePath: string): Promise<string | null> {
  try {
    await access(dirname(bundlePath), constants.W_OK | constants.X_OK);
    return null;
  } catch (error) {
    if (errnoOf(error) === 'EROFS') {
      return 'SayBack est lancée depuis un volume en lecture seule : copiez l’app dans Applications, puis relancez-la.';
    }
    return 'Le dossier qui contient SayBack n’est pas inscriptible.';
  }
}

async function placementProblem(
  bundlePath: string,
  uid: number,
  updatesDir: string,
): Promise<string | null> {
  if (bundlePath.split(sep).includes(TRANSLOCATION_SEGMENT)) {
    return 'macOS a lancé SayBack depuis une copie temporaire en lecture seule : déplacez l’app dans Applications, puis relancez-la.';
  }
  const channel = await realpath(updatesDir).catch(() => updatesDir);
  if (isInside(channel, bundlePath)) {
    return 'SayBack est lancée depuis le dossier du canal de mise à jour : copiez l’app dans Applications, puis relancez-la.';
  }
  const parent = await parentProblem(bundlePath);
  if (parent !== null) return parent;
  const previousPath = previousPathOf(bundlePath);
  const previous = await rawLstatOrNull(previousPath);
  if (previous === null) return null;
  const isBackup =
    isOwnDirectory(previous, uid) && (await readBundleIdentifier(previousPath)) === APP_BUNDLE_ID;
  return isBackup
    ? null
    : 'À côté de l’app, l’emplacement de la sauvegarde (« .previous.app ») est occupé par autre chose qu’une version de SayBack.';
}

export interface TargetQuery {
  /** `app.getPath('exe')`. */
  exePath: string;
  uid: number;
  /** The channel folder: an app launched from there cannot replace itself. */
  updatesDir: string;
}

/** Can the running app be replaced where it is? Refusals are sentences without paths. */
export async function resolveInstallTarget(query: TargetQuery): Promise<TargetVerdict> {
  const apparent = bundleOfExecutable(query.exePath);
  if (apparent === null) return refuse('SayBack n’est pas lancée depuis un paquet d’application.');
  let bundlePath: string;
  try {
    bundlePath = await realpath(apparent);
  } catch {
    return refuse('Le paquet de l’app en cours est introuvable.');
  }
  const ownBundle = isOwnDirectory(await rawLstatOrNull(bundlePath), query.uid);
  if (!bundlePath.endsWith(BUNDLE_SUFFIX) || !ownBundle) {
    return refuse(
      'Le paquet de l’app en cours n’est pas un dossier d’application qui vous appartient.',
    );
  }
  if ((await readBundleIdentifier(bundlePath)) !== APP_BUNDLE_ID) {
    return refuse('L’app en cours n’est pas un paquet SayBack.');
  }
  const problem = await placementProblem(bundlePath, query.uid, query.updatesDir);
  if (problem !== null) return refuse(problem);
  return { ok: true, target: { bundlePath, previousPath: previousPathOf(bundlePath) } };
}
