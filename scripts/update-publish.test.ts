import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChannelReader } from '../src/backend/infrastructure/update-channel-reader';
import { sha256Of, writeFakeBundle } from '../src/backend/infrastructure/test-bundle';
import {
  APP_BUNDLE_NAME,
  APP_EXECUTABLE_NAME,
  UPDATE_MANIFEST_NAME,
  updateManifestSchema,
} from '../src/shared/update-channel';
import { ReleaseError, publishToChannel } from './update-publish';

// `publishToChannel` runs for real (real `ditto`, fake bundle) and what it writes is read back by
// the app's own channel reader: both sides of the channel are checked against each other.

const COMMIT = 'c'.repeat(40);
const RUNNING = { commit: 'a'.repeat(40), builtAt: '2026-10-13T10:00:00.000Z' };
const INFO = { version: '0.1.0', commit: COMMIT, builtAt: '2026-10-13T12:00:00.000Z' };
const uid = process.getuid?.() ?? 0;

let root: string;
let updatesDir: string;
let built: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-publish-')));
  updatesDir = join(root, 'Application Support', 'SayBack', 'updates');
  built = join(root, 'dist', 'mac-arm64', APP_BUNDLE_NAME);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const build = (asar: string, path = built) => writeFakeBundle(path, { asar });
const readManifest = async (): Promise<unknown> =>
  JSON.parse(await readFile(join(updatesDir, UPDATE_MANIFEST_NAME), 'utf8'));
const readChannel = () => createChannelReader({ updatesDir, uid }).read(RUNNING);

describe('publishToChannel', () => {
  it('pose le paquet puis son manifeste ; l’app lit ce canal et propose la version', async () => {
    const sha = await build('version publiée');
    const manifest = await publishToChannel({
      appPath: built,
      updatesDir,
      info: INFO,
      notes: 'corrige\nla fermeture',
    });
    expect(manifest).toEqual({
      ...INFO,
      bundle: APP_BUNDLE_NAME,
      sha256: sha,
      notes: 'corrige la fermeture',
    });
    expect(await readManifest()).toEqual(manifest);
    const staged = join(updatesDir, APP_BUNDLE_NAME);
    expect(await readFile(join(staged, 'Contents', 'Resources', 'app.asar'), 'utf8')).toBe(
      'version publiée',
    );
    expect((await readdir(updatesDir)).sort()).toEqual([APP_BUNDLE_NAME, UPDATE_MANIFEST_NAME]);
    expect((await stat(updatesDir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(updatesDir, UPDATE_MANIFEST_NAME))).mode & 0o777).toBe(0o600);
    const executable = join(staged, 'Contents', 'MacOS', APP_EXECUTABLE_NAME);
    expect((await stat(executable)).mode & 0o111).not.toBe(0);
    expect(await readChannel()).toEqual({ kind: 'available', manifest });
  });

  it('sans note : pas de champ `notes`', async () => {
    await build('x');
    const manifest = await publishToChannel({ appPath: built, updatesDir, info: INFO });
    expect(manifest).not.toHaveProperty('notes');
    expect(updateManifestSchema.safeParse(await readManifest()).success).toBe(true);
  });

  it('une publication remplace la précédente : un seul paquet en attente', async () => {
    await build('première');
    await publishToChannel({ appPath: built, updatesDir, info: INFO });
    await rm(built, { recursive: true });
    const sha = await build('seconde, plus longue');
    const later = { ...INFO, commit: 'd'.repeat(40), builtAt: '2026-10-13T13:00:00.000Z' };
    const manifest = await publishToChannel({ appPath: built, updatesDir, info: later });
    expect(manifest.sha256).toBe(sha);
    expect(sha).toBe(sha256Of('seconde, plus longue'));
    expect((await readdir(updatesDir)).sort()).toEqual([APP_BUNDLE_NAME, UPDATE_MANIFEST_NAME]);
    expect(await readChannel()).toEqual({ kind: 'available', manifest });
  });

  it('paquet source absent ou incomplet : refus, ce qui était publié reste', async () => {
    await build('déjà publiée');
    const before = await publishToChannel({ appPath: built, updatesDir, info: INFO });
    const absent = join(root, 'Absent.app');
    await expect(publishToChannel({ appPath: absent, updatesDir, info: INFO })).rejects.toThrow(
      ReleaseError,
    );
    const broken = join(root, 'Cassé.app');
    await mkdir(join(broken, 'Contents'), { recursive: true });
    await expect(publishToChannel({ appPath: broken, updatesDir, info: INFO })).rejects.toThrow(
      ReleaseError,
    );
    expect(await readManifest()).toEqual(before);
  });

  it('une identité que l’app refuserait n’est pas publiée : paquet sans manifeste', async () => {
    await build('x');
    const info = { ...INFO, commit: 'pas un commit' };
    await expect(publishToChannel({ appPath: built, updatesDir, info })).rejects.toThrow();
    expect(await readdir(updatesDir)).toEqual([APP_BUNDLE_NAME]);
    expect(await readChannel()).toEqual({ kind: 'none' });
  });

  it('le dossier du canal est un lien symbolique : refus', async () => {
    await build('x');
    await mkdir(join(root, 'Application Support', 'SayBack'), { recursive: true });
    await mkdir(join(root, 'ailleurs'));
    await symlink(join(root, 'ailleurs'), updatesDir);
    await expect(publishToChannel({ appPath: built, updatesDir, info: INFO })).rejects.toThrow(
      ReleaseError,
    );
    expect(await readdir(join(root, 'ailleurs'))).toEqual([]);
  });

  it('les restes d’une publication interrompue sont retirés', async () => {
    await build('x');
    await mkdir(join(updatesDir, '.incoming-abandon', 'Contents'), { recursive: true });
    await publishToChannel({ appPath: built, updatesDir, info: INFO });
    expect((await readdir(updatesDir)).sort()).toEqual([APP_BUNDLE_NAME, UPDATE_MANIFEST_NAME]);
  });
});
