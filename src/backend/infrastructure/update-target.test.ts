import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_BUNDLE_ID, APP_BUNDLE_NAME, APP_EXECUTABLE_NAME } from '../../shared/update-channel';
import { writeFakeBundle, type FakeBundleOptions } from './test-bundle';
import { readBundleIdentifier } from './update-bundle';
import { bundleOfExecutable, previousPathOf, resolveInstallTarget } from './update-target';

const uid = process.getuid?.() ?? 0;

let root: string;
let bundle: string;
let updatesDir: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-target l’été-')));
  bundle = join(root, APP_BUNDLE_NAME);
  updatesDir = join(root, 'canal', 'updates');
});

afterEach(async () => {
  // One test makes a folder read-only: it must be removable.
  await chmod(join(root, 'figé'), 0o700).catch(() => undefined);
  await rm(root, { recursive: true, force: true });
});

function write(path = bundle, patch: Partial<FakeBundleOptions> = {}): Promise<string> {
  return writeFakeBundle(path, { asar: 'contenu', ...patch });
}

const exeOf = (path: string): string => join(path, 'Contents', 'MacOS', APP_EXECUTABLE_NAME);
const resolve = (exePath: string) => resolveInstallTarget({ exePath, uid, updatesDir });

describe('chemins du paquet qui tourne', () => {
  it('bundleOfExecutable : le .app de <x>.app/Contents/MacOS/<exécutable>, sinon null', () => {
    expect(bundleOfExecutable('/Applications/SayBack.app/Contents/MacOS/SayBack')).toBe(
      '/Applications/SayBack.app',
    );
    expect(bundleOfExecutable('/Users/alex/Mes apps/L’été.app/Contents/MacOS/SayBack')).toBe(
      '/Users/alex/Mes apps/L’été.app',
    );
    expect(
      bundleOfExecutable('/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    ).toBe('/repo/node_modules/electron/dist/Electron.app');
    expect(bundleOfExecutable('/usr/local/bin/sayback')).toBeNull();
    expect(
      bundleOfExecutable(
        '/Applications/SayBack.app/Contents/Frameworks/H.app/Contents/Resources/x',
      ),
    ).toBeNull();
    expect(bundleOfExecutable('SayBack.app/Contents/MacOS/SayBack')).toBeNull();
    expect(bundleOfExecutable('/SayBack/Contents/MacOS/SayBack')).toBeNull();
  });

  it('previousPathOf : la sauvegarde est à côté, « <Nom>.previous.app »', () => {
    expect(previousPathOf('/Applications/SayBack.app')).toBe('/Applications/SayBack.previous.app');
  });

  it('readBundleIdentifier lit celui du paquet, null s’il est illisible', async () => {
    await write();
    expect(await readBundleIdentifier(bundle)).toBe(APP_BUNDLE_ID);
    expect(await readBundleIdentifier(join(root, 'Absent.app'))).toBeNull();
  });
});

describe('resolveInstallTarget', () => {
  it('cible acceptée : le chemin RÉEL du paquet (liens suivis) et celui de sa sauvegarde', async () => {
    await write();
    const link = join(root, 'raccourci');
    await symlink(root, link);
    expect(await resolve(exeOf(join(link, APP_BUNDLE_NAME)))).toEqual({
      ok: true,
      target: { bundlePath: bundle, previousPath: join(root, 'SayBack.previous.app') },
    });
  });

  it('refusé sans chemin dans la raison : pas un .app, identifiant d’une autre app', async () => {
    const notBundle = await resolve('/usr/local/bin/sayback');
    const electron = join(root, 'Electron.app');
    await write(electron, { identifier: 'com.github.Electron', executable: 'Electron' });
    const other = await resolve(join(electron, 'Contents', 'MacOS', 'Electron'));
    for (const verdict of [notBundle, other]) {
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.reason).not.toContain('/');
    }
  });

  it('refusé : dossier parent non inscriptible', async () => {
    const frozen = join(root, 'figé');
    await mkdir(frozen);
    await write(join(frozen, APP_BUNDLE_NAME));
    await chmod(frozen, 0o555);
    expect(await resolve(exeOf(join(frozen, APP_BUNDLE_NAME)))).toMatchObject({
      ok: false,
      reason: expect.stringContaining('inscriptible'),
    });
  });

  it('refusé : lancée depuis un emplacement de translocation de macOS', async () => {
    const translocated = join(root, 'AppTranslocation', 'ABCD', 'd', APP_BUNDLE_NAME);
    await write(translocated);
    expect(await resolve(exeOf(translocated))).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Applications'),
    });
  });

  it('refusé : lancée depuis le dossier du canal lui-même', async () => {
    const staged = join(updatesDir, APP_BUNDLE_NAME);
    await write(staged);
    expect(await resolve(exeOf(staged))).toMatchObject({
      ok: false,
      reason: expect.stringContaining('canal de mise à jour'),
    });
  });

  it('refusé : la place de la sauvegarde est prise par autre chose qu’une version de SayBack', async () => {
    await write();
    const previous = join(root, 'SayBack.previous.app');
    await mkdir(previous);
    await writeFile(join(previous, 'mes documents.txt'), 'à ne pas effacer');
    expect((await resolve(exeOf(bundle))).ok).toBe(false);
    await rm(previous, { recursive: true });
    await write(previous, { asar: 'ancienne version' });
    expect((await resolve(exeOf(bundle))).ok).toBe(true);
    await rm(previous, { recursive: true });
    await symlink(root, previous);
    expect((await resolve(exeOf(bundle))).ok).toBe(false);
  });
});
