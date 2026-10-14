import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  APP_BUNDLE_NAME,
  UPDATE_MANIFEST_NAME,
  type UpdateManifest,
} from '../../shared/update-channel';
import { writeFakeBundle } from './test-bundle';
import { createChannelReader } from './update-channel-reader';

const CURRENT = { commit: 'a'.repeat(40), builtAt: '2026-10-13T10:00:00.000Z' };
const uid = process.getuid?.() ?? 0;

let root: string;
let updatesDir: string;
let asarPath: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-update guards-')));
  updatesDir = join(root, 'updates');
  asarPath = join(updatesDir, APP_BUNDLE_NAME, 'Contents', 'Resources', 'app.asar');
  await mkdir(updatesDir, { recursive: true, mode: 0o700 });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function stage(asar = 'contenu'): Promise<string> {
  return writeFakeBundle(join(updatesDir, APP_BUNDLE_NAME), { asar });
}

function manifest(sha256: string, patch: Partial<UpdateManifest> = {}): UpdateManifest {
  return {
    version: '0.1.1',
    commit: 'b'.repeat(40),
    builtAt: '2026-10-13T12:00:00.000Z',
    bundle: APP_BUNDLE_NAME,
    sha256,
    ...patch,
  };
}

async function writeManifest(content: string | object): Promise<void> {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  await writeFile(join(updatesDir, UPDATE_MANIFEST_NAME), text);
}

const read = () => createChannelReader({ updatesDir, uid }).read(CURRENT);

describe('autour du manifeste', () => {
  it('manifeste absent, dossier absent : rien, sans erreur', async () => {
    expect(await read()).toEqual({ kind: 'none' });
    await rm(updatesDir, { recursive: true, force: true });
    expect(await read()).toEqual({ kind: 'none' });
  });

  it('un paquet posé sans manifeste (copie en cours) n’est jamais proposé', async () => {
    await stage();
    expect(await read()).toEqual({ kind: 'none' });
  });

  it('strict : champ inconnu, type inattendu, note sur deux lignes, tableau, null', async () => {
    const sha = await stage();
    const bad: unknown[] = [
      { ...manifest(sha), extra: true },
      { ...manifest(sha), sha256: sha.toUpperCase() },
      { ...manifest(sha), commit: 'pas-un-commit' },
      { ...manifest(sha), builtAt: 'hier' },
      { ...manifest(sha), builtAt: 1_760_000_000_000 },
      { ...manifest(sha), notes: 'une ligne\nune autre' },
      { ...manifest(sha), notes: 'x'.repeat(201) },
      [manifest(sha)],
    ];
    for (const candidate of bad) {
      await writeManifest(JSON.stringify(candidate));
      expect((await read()).kind, JSON.stringify(candidate).slice(0, 80)).toBe('invalid');
    }
    await writeManifest('null');
    expect((await read()).kind).toBe('invalid');
  });

  it('le manifeste est un dossier, ou un tube nommé sans écrivain : refusé sans attendre', async () => {
    const path = join(updatesDir, UPDATE_MANIFEST_NAME);
    await mkdir(path);
    expect((await read()).kind).toBe('invalid');
    await rm(path, { recursive: true });
    execFileSync('/usr/bin/mkfifo', [path]);
    expect((await read()).kind).toBe('invalid');
  });

  it('un manifeste qui ne propose rien de plus récent n’ouvre même pas le paquet', async () => {
    await writeManifest(manifest('0'.repeat(64), { commit: CURRENT.commit }));
    expect(await read()).toEqual({ kind: 'none' });
  });

  it('le dossier du canal appartient à un autre, ou d’autres peuvent y écrire : refusé', async () => {
    const sha = await stage();
    await writeManifest(manifest(sha));
    const foreign = createChannelReader({ updatesDir, uid: uid + 1 });
    expect((await foreign.read(CURRENT)).kind).toBe('invalid');
    await chmod(updatesDir, 0o777);
    expect(await read()).toMatchObject({
      kind: 'invalid',
      reason: expect.stringContaining('autres'),
    });
  });
});

describe('empreinte gardée d’une lecture à l’autre', () => {
  it('un paquet vérifié n’est pas haché de nouveau tant que rien n’a bougé ; `fresh` le relit', async () => {
    await writeManifest(manifest(await stage('version vérifiée')));
    const reader = createChannelReader({ updatesDir, uid });
    expect((await reader.read(CURRENT)).kind).toBe('available');
    expect(reader.hashCount()).toBe(1);
    expect((await reader.read(CURRENT)).kind).toBe('available');
    expect(reader.hashCount()).toBe(1);
    expect((await reader.read(CURRENT, { fresh: true })).kind).toBe('available');
    expect(reader.hashCount()).toBe(2);
  });

  it('le paquet change après avoir été vérifié : la lecture suivante le voit', async () => {
    await writeManifest(manifest(await stage('version vérifiée')));
    const reader = createChannelReader({ updatesDir, uid });
    expect((await reader.read(CURRENT)).kind).toBe('available');
    await writeFile(`${asarPath}.new`, 'autre contenu, autre taille');
    await rename(`${asarPath}.new`, asarPath);
    expect((await reader.read(CURRENT)).kind).toBe('invalid');
  });

  it('même taille, même date, autre contenu : `fresh` ne s’y fie pas', async () => {
    await writeManifest(manifest(await stage('AAAA')));
    const reader = createChannelReader({ updatesDir, uid });
    expect((await reader.read(CURRENT)).kind).toBe('available');
    expect(await readFile(asarPath, 'utf8')).toBe('AAAA');
    await writeFile(asarPath, 'BBBB');
    expect((await reader.read(CURRENT, { fresh: true })).kind).toBe('invalid');
  });
});
