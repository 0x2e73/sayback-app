import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmod, lstat, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_BUNDLE_ID, APP_BUNDLE_NAME, APP_EXECUTABLE_NAME } from '../../shared/update-channel';
import { fakePlist, sha256Of, writeFakeBundle, type FakeBundleOptions } from './test-bundle';
import {
  inspectBundle,
  isOwnDirectory,
  readBundleIdentifier,
  sha256OfRegularFile,
} from './update-bundle';

const uid = process.getuid?.() ?? 0;
const ASAR = 'contenu du paquet';

let root: string;
let bundle: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-bundle l’été-')));
  bundle = join(root, APP_BUNDLE_NAME);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function write(path = bundle, patch: Partial<FakeBundleOptions> = {}): Promise<string> {
  return writeFakeBundle(path, { asar: ASAR, ...patch });
}

async function identifierOf(plist: string): Promise<string | null> {
  await mkdir(join(bundle, 'Contents'), { recursive: true });
  await writeFile(join(bundle, 'Contents', 'Info.plist'), plist);
  return readBundleIdentifier(bundle);
}

const ID = APP_BUNDLE_ID;

describe('readBundleIdentifier (plutil)', () => {
  it('lit l’identifiant d’un Info.plist', async () => {
    expect(await identifierOf(fakePlist(ID, 'SayBack'))).toBe(ID);
  });

  it.each([
    ['vide', ''],
    ['plist binaire abîmé', 'bplist00Ñ\u0001\u0002'],
    ['clé absente', fakePlist('x', 'SayBack').replace('CFBundleIdentifier', 'CFBundleName')],
    [
      'valeur qui n’est pas une chaîne',
      '<plist><dict><key>CFBundleIdentifier</key><integer>1</integer></dict></plist>',
    ],
    [
      'identifiant écrit dans un commentaire seulement',
      `<plist><dict><!-- <key>CFBundleIdentifier</key><string>${ID}</string> --><key>CFBundleName</key><string>x</string></dict></plist>`,
    ],
    [
      'identifiant dans un dictionnaire imbriqué seulement',
      `<plist><dict><key>Autre</key><dict><key>CFBundleIdentifier</key><string>${ID}</string></dict></dict></plist>`,
    ],
  ])('%s : null', async (_label, plist) => {
    expect(await identifierOf(plist)).toBeNull();
  });

  it('ni un commentaire ni une clé répétée ne font passer un autre paquet pour SayBack', async () => {
    const commented = `<plist><dict><!-- <key>CFBundleIdentifier</key><string>${ID}</string> --><key>CFBundleIdentifier</key><string>com.autre</string></dict></plist>`;
    expect(await identifierOf(commented)).toBe('com.autre');
    const repeated = `<plist><dict><key>CFBundleIdentifier</key><string>${ID}</string><key>CFBundleIdentifier</key><string>autre</string></dict></plist>`;
    expect(await identifierOf(repeated)).not.toBe(ID);
  });

  it('un Info.plist démesuré n’est pas confié à plutil', async () => {
    expect(await identifierOf(fakePlist(ID, 'SayBack') + ' '.repeat(2 * 1024 * 1024))).toBeNull();
  });
});

describe('inspectBundle', () => {
  it('un paquet ordinaire, à nous, à la bonne empreinte : accepté', async () => {
    const sha = await write();
    expect(await inspectBundle(bundle, { uid, sha256: sha })).toEqual({ ok: true });
    expect(sha).toBe(sha256Of(ASAR));
    expect(await inspectBundle(bundle, { uid, sha256: null })).toEqual({ ok: true });
  });

  it('refusé : absent, simple fichier, lien symbolique, autre propriétaire', async () => {
    expect((await inspectBundle(bundle, { uid, sha256: null })).ok).toBe(false);
    await writeFile(bundle, 'pas un dossier');
    expect((await inspectBundle(bundle, { uid, sha256: null })).ok).toBe(false);
    await rm(bundle);
    const real = join(root, 'Vrai.app');
    const sha = await write(real);
    await symlink(real, bundle);
    expect((await inspectBundle(bundle, { uid, sha256: sha })).ok).toBe(false);
    expect(await inspectBundle(real, { uid, sha256: sha })).toEqual({ ok: true });
    expect((await inspectBundle(real, { uid: uid + 1, sha256: sha })).ok).toBe(false);
  });

  it('refusé : un dossier intérieur ou un fichier contrôlé est un lien symbolique', async () => {
    const elsewhere = join(root, 'Ailleurs.app');
    const sha = await write(elsewhere);
    const parts = [
      'Contents',
      'Contents/MacOS',
      'Contents/Resources',
      'Contents/Info.plist',
      `Contents/MacOS/${APP_EXECUTABLE_NAME}`,
      'Contents/Resources/app.asar',
    ];
    for (const part of parts) {
      await rm(bundle, { recursive: true, force: true });
      await write();
      await rm(join(bundle, part), { recursive: true });
      await symlink(join(elsewhere, part), join(bundle, part));
      expect((await inspectBundle(bundle, { uid, sha256: sha })).ok, part).toBe(false);
    }
  });

  it('refusé : identifiant d’une autre app, Info.plist absent ou démesuré', async () => {
    await write(bundle, { identifier: 'com.autre.app' });
    expect((await inspectBundle(bundle, { uid, sha256: null })).ok).toBe(false);
    await rm(join(bundle, 'Contents', 'Info.plist'));
    expect((await inspectBundle(bundle, { uid, sha256: null })).ok).toBe(false);
    const huge = fakePlist(APP_BUNDLE_ID, APP_EXECUTABLE_NAME) + ' '.repeat(2 * 1024 * 1024);
    await writeFile(join(bundle, 'Contents', 'Info.plist'), huge);
    expect((await inspectBundle(bundle, { uid, sha256: null })).ok).toBe(false);
  });

  it('refusé : exécutable absent, non exécutable, ou qui est un dossier', async () => {
    await write(bundle, { withExecutable: false });
    expect((await inspectBundle(bundle, { uid, sha256: null })).ok).toBe(false);
    const executable = join(bundle, 'Contents', 'MacOS', APP_EXECUTABLE_NAME);
    await writeFile(executable, 'x');
    await chmod(executable, 0o644);
    expect((await inspectBundle(bundle, { uid, sha256: null })).ok).toBe(false);
    await rm(executable);
    await mkdir(executable);
    expect((await inspectBundle(bundle, { uid, sha256: null })).ok).toBe(false);
  });

  it('refusé : app.asar absent, d’une autre empreinte, ou au-delà du plafond', async () => {
    const sha = await write();
    expect((await inspectBundle(bundle, { uid, sha256: '0'.repeat(64) })).ok).toBe(false);
    expect((await inspectBundle(bundle, { uid, sha256: sha, asarMaxBytes: 4 })).ok).toBe(false);
    await rm(join(bundle, 'Contents', 'Resources', 'app.asar'));
    expect((await inspectBundle(bundle, { uid, sha256: sha })).ok).toBe(false);
    expect((await inspectBundle(bundle, { uid, sha256: null })).ok).toBe(false);
  });

  it('refusé : le paquet est inscriptible par d’autres que son propriétaire', async () => {
    const sha = await write();
    await chmod(bundle, 0o777);
    expect((await inspectBundle(bundle, { uid, sha256: sha })).ok).toBe(false);
  });

  it('aucune raison ne porte un chemin', async () => {
    await write();
    const verdict = await inspectBundle(bundle, { uid, sha256: '0'.repeat(64) });
    expect(verdict).toMatchObject({ ok: false, reason: expect.stringContaining('empreinte') });
    if (!verdict.ok) expect(verdict.reason).not.toContain('/');
  });
});

describe('isOwnDirectory', () => {
  it('un vrai dossier à l’utilisateur courant, et rien d’autre', async () => {
    await mkdir(join(root, 'dossier'));
    await writeFile(join(root, 'fichier'), 'x');
    await symlink(join(root, 'dossier'), join(root, 'lien'));
    expect(isOwnDirectory(await lstat(join(root, 'dossier')), uid)).toBe(true);
    expect(isOwnDirectory(await lstat(join(root, 'dossier')), uid + 1)).toBe(false);
    expect(isOwnDirectory(await lstat(join(root, 'lien')), uid)).toBe(false);
    expect(isOwnDirectory(await lstat(join(root, 'fichier')), uid)).toBe(false);
    expect(isOwnDirectory(null, uid)).toBe(false);
  });
});

describe('sha256OfRegularFile', () => {
  it('rend l’empreinte d’un fichier lu par blocs', async () => {
    const big = Buffer.alloc(3 * 1024 * 1024 + 17, 7);
    await writeFile(join(root, 'gros'), big);
    expect(await sha256OfRegularFile(join(root, 'gros'), 16 * 1024 * 1024)).toBe(sha256Of(big));
  });

  it('null : absent, dossier, lien symbolique, plus gros que le plafond', async () => {
    await writeFile(join(root, 'fichier'), 'abc');
    await symlink(join(root, 'fichier'), join(root, 'lien'));
    expect(await sha256OfRegularFile(join(root, 'absent'), 10)).toBeNull();
    expect(await sha256OfRegularFile(root, 10)).toBeNull();
    expect(await sha256OfRegularFile(join(root, 'lien'), 10)).toBeNull();
    expect(await sha256OfRegularFile(join(root, 'fichier'), 2)).toBeNull();
    expect(await sha256OfRegularFile(join(root, 'fichier'), 3)).toBe(sha256Of('abc'));
  });
});
