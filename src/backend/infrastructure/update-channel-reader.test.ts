import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  APP_BUNDLE_NAME,
  UPDATE_MANIFEST_NAME,
  type UpdateManifest,
} from '../../shared/update-channel';
import type { ChannelReading } from '../application/update-ports';
import { writeFakeBundle } from './test-bundle';
import { createChannelReader } from './update-channel-reader';

// The ten manifests of the reference implementation: valid, missing fields, same commit, older
// build, path in `bundle`, truncated JSON, 5 MB, wrong hash, missing bundle, symbolic links.

const CURRENT = { commit: 'a'.repeat(40), builtAt: '2026-10-13T10:00:00.000Z' };
const uid = process.getuid?.() ?? 0;

let root: string;
let updatesDir: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-update detect-')));
  updatesDir = join(root, 'updates');
  await mkdir(updatesDir, { recursive: true, mode: 0o700 });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function stage(asar = 'contenu de la nouvelle version'): Promise<string> {
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

function read(): Promise<ChannelReading> {
  return createChannelReader({ updatesDir, uid }).read(CURRENT);
}

describe('les dix manifestes', () => {
  it('1. valide : la mise à jour est disponible, avec ce que dit le manifeste', async () => {
    const sha = await stage();
    await writeManifest(manifest(sha, { notes: 'corrige la fermeture' }));
    expect(await read()).toEqual({
      kind: 'available',
      manifest: manifest(sha, { notes: 'corrige la fermeture' }),
    });
  });

  it('2. champs manquants : refusé', async () => {
    const sha = await stage();
    for (const missing of ['version', 'commit', 'builtAt', 'bundle', 'sha256'] as const) {
      const partial: Partial<UpdateManifest> = manifest(sha);
      delete partial[missing];
      await writeManifest(partial);
      expect((await read()).kind, missing).toBe('invalid');
    }
  });

  it('3. version identique (même commit) : rien à proposer, même construite plus tard', async () => {
    const sha = await stage();
    await writeManifest(manifest(sha, { commit: CURRENT.commit }));
    expect(await read()).toEqual({ kind: 'none' });
  });

  it('4. construite avant (ou en même temps) : rien à proposer', async () => {
    const sha = await stage();
    await writeManifest(manifest(sha, { builtAt: '2026-10-13T08:00:00.000Z' }));
    expect(await read()).toEqual({ kind: 'none' });
    await writeManifest(manifest(sha, { builtAt: CURRENT.builtAt }));
    expect(await read()).toEqual({ kind: 'none' });
  });

  it('5. un chemin dans `bundle` : refusé, rien n’est lu ailleurs', async () => {
    const outside = join(root, 'Ailleurs.app');
    const sha = await writeFakeBundle(outside, { asar: 'ailleurs' });
    const bundles = [
      '../Ailleurs.app',
      'sous/SayBack.app',
      outside,
      '..',
      '.SayBack.app',
      'SayBack.app/',
      'SayBack',
      '',
    ];
    for (const bundle of bundles) {
      await writeManifest({ ...manifest(sha), bundle });
      expect((await read()).kind, JSON.stringify(bundle)).toBe('invalid');
    }
  });

  it('6. manifeste corrompu (JSON tronqué ou vide) : refusé', async () => {
    const sha = await stage();
    const full = JSON.stringify(manifest(sha));
    await writeManifest(full.slice(0, full.length - 9));
    expect((await read()).kind).toBe('invalid');
    await writeManifest('');
    expect((await read()).kind).toBe('invalid');
  });

  it('7. manifeste de 5 Mo : refusé sans être accepté pour son début', async () => {
    const sha = await stage();
    await writeManifest(JSON.stringify(manifest(sha)) + ' '.repeat(5 * 1024 * 1024));
    expect(await read()).toMatchObject({
      kind: 'invalid',
      reason: expect.stringContaining('volumineux'),
    });
  });

  it('8. empreinte fausse : le paquet en attente n’est pas proposé', async () => {
    await stage();
    await writeManifest(manifest('0'.repeat(64)));
    const reading = await read();
    expect(reading).toMatchObject({
      kind: 'invalid',
      reason: expect.stringContaining('empreinte'),
    });
    if (reading.kind === 'invalid') expect(reading.reason).not.toContain('/');
  });

  it('9. paquet absent ou incomplet : refusé', async () => {
    await writeManifest(manifest('0'.repeat(64)));
    expect((await read()).kind).toBe('invalid');
    const sha = await stage();
    await rm(join(updatesDir, APP_BUNDLE_NAME, 'Contents', 'MacOS'), { recursive: true });
    await writeManifest(manifest(sha));
    expect((await read()).kind).toBe('invalid');
  });

  it('10. lien symbolique : le paquet, le dossier du canal ou le manifeste', async () => {
    const real = join(root, 'Vrai.app');
    const sha = await writeFakeBundle(real, { asar: 'vrai' });
    await symlink(real, join(updatesDir, APP_BUNDLE_NAME));
    await writeManifest(manifest(sha));
    expect((await read()).kind).toBe('invalid');

    await rm(updatesDir, { recursive: true, force: true });
    const elsewhere = join(root, 'ailleurs');
    const shaElsewhere = await writeFakeBundle(join(elsewhere, APP_BUNDLE_NAME), { asar: 'x' });
    await writeFile(join(elsewhere, UPDATE_MANIFEST_NAME), JSON.stringify(manifest(shaElsewhere)));
    await symlink(elsewhere, updatesDir);
    expect((await read()).kind).toBe('invalid');

    await rm(updatesDir, { force: true });
    await mkdir(updatesDir);
    const staged = await stage('y');
    await writeFile(join(root, 'manifeste.json'), JSON.stringify(manifest(staged)));
    await symlink(join(root, 'manifeste.json'), join(updatesDir, UPDATE_MANIFEST_NAME));
    expect((await read()).kind).toBe('invalid');
  });
});
