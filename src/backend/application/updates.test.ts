import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmod, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_EXECUTABLE_NAME, UPDATE_MANIFEST_NAME } from '../../shared/update-channel';
import {
  CURRENT,
  CURRENT_INFO,
  NEXT,
  NEW_ASAR,
  createUpdateFixture,
  type UpdateFixture,
} from '../infrastructure/test-update-fixture';

// Detection: status at startup, on focus and on a timer; every change is published once.

let f: UpdateFixture;

beforeEach(async () => {
  f = await createUpdateFixture();
});

afterEach(async () => {
  await f.cleanup();
});

describe('status', () => {
  it('canal vide : la version en cours, rien en attente, installation possible', async () => {
    const updates = f.create();
    await updates.start();
    expect(await updates.status()).toEqual({
      current: CURRENT_INFO,
      available: null,
      canInstall: true,
    });
  });

  it('une version publiée avant le démarrage est vue au démarrage, avec sa note', async () => {
    await f.publish(NEW_ASAR, { notes: 'corrige la fermeture' });
    const updates = f.create();
    await updates.start();
    expect(await updates.status()).toEqual({
      current: CURRENT_INFO,
      available: { ...NEXT, notes: 'corrige la fermeture' },
      canInstall: true,
    });
  });

  it('le premier `status` attend la lecture du démarrage', async () => {
    await f.publish();
    const updates = f.create();
    void updates.start();
    expect((await updates.status()).available).toEqual(NEXT);
  });

  it('app non empaquetée : la version est vue, mais ne peut pas s’installer', async () => {
    await f.publish();
    const updates = f.create({ ports: { isPackaged: false } });
    await updates.start();
    const status = await updates.status();
    expect(status.available).toEqual(NEXT);
    expect(status.canInstall).toBe(false);
    expect(status.reason).toMatch(/empaquet/);
  });

  it('canal fermé dans ce build : rien n’est lu, rien n’est proposé', async () => {
    await writeFile(f.buildInfoPath, JSON.stringify({ ...CURRENT, localUpdateChannel: false }));
    await f.publish();
    const updates = f.create();
    await updates.start();
    const status = await updates.status();
    expect(status).toEqual({
      current: CURRENT_INFO,
      available: null,
      canInstall: false,
      reason: expect.stringContaining('désactivé'),
    });
    expect(await updates.check()).toEqual(status);
    expect(updates.readCount()).toBe(0);
    expect(f.published).toEqual([]);
  });

  it('identité du build illisible : canal fermé, version de l’app en repli', async () => {
    await f.publish();
    const contents = [
      null,
      '{',
      JSON.stringify({ ...CURRENT, extra: 1 }),
      JSON.stringify({ ...CURRENT, commit: '../x' }),
      'x'.repeat(100_000),
    ];
    for (const content of contents) {
      if (content === null) await rm(f.buildInfoPath);
      else await writeFile(f.buildInfoPath, content);
      const updates = f.create();
      await updates.start();
      const status = await updates.status();
      expect(status.current).toEqual({
        version: '9.9.9-test',
        commit: 'inconnu',
        builtAt: new Date(0).toISOString(),
      });
      expect(status.available).toBeNull();
      expect(status.canInstall).toBe(false);
      expect(status.reason).toBeTruthy();
    }
  });

  it('paquet en attente invalide : pas proposé, et la raison le dit', async () => {
    const manifest = await f.publish();
    const corrupted = JSON.stringify({ ...manifest, sha256: '0'.repeat(64) });
    await writeFile(join(f.updatesDir, UPDATE_MANIFEST_NAME), corrupted);
    const updates = f.create();
    await updates.start();
    const status = await updates.status();
    expect(status.available).toBeNull();
    expect(status.canInstall).toBe(false);
    expect(status.reason).toMatch(/empreinte/);
  });

  it('dossier de l’app non inscriptible : vue, pas installable, sans chemin dans la raison', async () => {
    await f.publish();
    await chmod(f.appsDir, 0o555);
    const updates = f.create();
    await updates.start();
    const status = await updates.status();
    expect(status.available).toEqual(NEXT);
    expect(status.canInstall).toBe(false);
    expect(status.reason).toMatch(/inscriptible/);
    expect(status.reason).not.toContain(f.root);
  });

  it('app lancée depuis le dossier du canal : elle ne peut pas se remplacer', async () => {
    await f.publish();
    const exePath = join(f.stagedPath, 'Contents', 'MacOS', APP_EXECUTABLE_NAME);
    const updates = f.create({ local: { exePath } });
    await updates.start();
    const status = await updates.status();
    expect(status.canInstall).toBe(false);
    expect(status.reason).toMatch(/canal de mise à jour/);
    await expect(updates.install()).rejects.toThrow(/canal de mise à jour/);
    expect(f.launches).toEqual([]);
  });
});

describe('détection et annonces', () => {
  it('`status` ne relit pas le canal ; `check` le relit et l’annonce', async () => {
    const updates = f.create();
    await updates.start();
    await f.publish();
    expect((await updates.status()).available).toBeNull();
    expect(f.published).toEqual([]);
    const checked = await updates.check();
    expect(checked).toEqual({ current: CURRENT_INFO, available: NEXT, canInstall: true });
    expect(f.published).toEqual([checked]);
    expect(await updates.status()).toEqual(checked);
  });

  it('rien n’a changé : rien n’est annoncé', async () => {
    await f.publish();
    const updates = f.create();
    await updates.start();
    await updates.check();
    await updates.check();
    expect(f.published).toEqual([]);
  });

  it('la version disparaît, puis une autre arrive : chaque changement annoncé une fois', async () => {
    await f.publish();
    const updates = f.create();
    await updates.start();
    await rm(join(f.updatesDir, UPDATE_MANIFEST_NAME));
    await updates.check();
    const later = { ...NEXT, commit: 'c'.repeat(40), builtAt: '2026-10-13T14:00:00.000Z' };
    await f.publish('encore après', later);
    await updates.check();
    expect(f.published.map((status) => status.available)).toEqual([null, later]);
  });

  it('retour au premier plan : le canal est relu', async () => {
    const updates = f.create();
    await updates.start();
    await f.publish();
    updates.windowFocused();
    await vi.waitFor(() => expect(f.published).toHaveLength(1));
    expect(f.published[0]?.available).toEqual(NEXT);
  });

  it('des retours au premier plan en rafale ne lancent pas une lecture chacun', async () => {
    await f.publish();
    const updates = f.create();
    await updates.start();
    const before = updates.readCount();
    for (let i = 0; i < 50; i += 1) updates.windowFocused();
    await updates.check();
    expect(updates.readCount() - before).toBeLessThanOrEqual(3);
  });

  it('sans rien demander : le canal est relu à intervalle régulier', async () => {
    // The interval is frozen while publishing: a real tick could read a half-written manifest
    // and announce it before the update.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const updates = f.create({ pollMs: 20 });
      await updates.start();
      await updates.status();
      await f.publish();
      const before = updates.readCount();
      expect(f.published).toEqual([]);
      vi.advanceTimersByTime(20);
      await vi.waitFor(() => expect(f.published).toHaveLength(1));
      expect(updates.readCount()).toBeGreaterThan(before);
      expect(f.published[0]?.available).toEqual(NEXT);
    } finally {
      vi.useRealTimers();
    }
  });

  it('après `stop`, plus rien n’est lu ni annoncé', async () => {
    const updates = f.create({ pollMs: 20 });
    await updates.start();
    await updates.stop();
    await f.publish();
    updates.windowFocused();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(f.published).toEqual([]);
  });
});
