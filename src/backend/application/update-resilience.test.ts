import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  CURRENT_INFO,
  NEXT,
  createUpdateFixture,
  type UpdateFixture,
} from '../infrastructure/test-update-fixture';
import { createChannelReader } from '../infrastructure/update-channel-reader';
import type { ChannelReader } from './update-ports';

// Runtime closure of a downloaded app, recovery after a failed read, concurrent checks.

const uid = process.getuid?.() ?? 0;
let f: UpdateFixture;

beforeEach(async () => {
  f = await createUpdateFixture();
});

afterEach(async () => {
  await f.cleanup();
});

describe('app téléchargée', () => {
  it('paquet en quarantaine : canal fermé, rien n’est lu ni proposé', async () => {
    await f.publish();
    execFileSync('/usr/bin/xattr', [
      '-w',
      'com.apple.quarantine',
      '0081;00000000;Safari;',
      f.runningPath,
    ]);
    const updates = f.create();
    await updates.start();
    expect(await updates.status()).toEqual({
      current: CURRENT_INFO,
      available: null,
      canInstall: false,
      reason: expect.stringContaining('téléchargée'),
    });
    expect(updates.readCount()).toBe(0);
    await expect(updates.install()).rejects.toThrow(/téléchargée/);
    expect(f.launches).toEqual([]);
  });

  it('paquet construit sur place, sans quarantaine : canal ouvert', async () => {
    await f.publish();
    const updates = f.create();
    expect((await updates.status()).available).toEqual(NEXT);
  });
});

describe('lecture en échec', () => {
  it('le premier échec n’est pas mémorisé : la lecture suivante reprend', async () => {
    await f.publish();
    let failing = true;
    const real = createChannelReader({ updatesDir: f.updatesDir, uid });
    const channel: ChannelReader = {
      read: (current, options) =>
        failing ? Promise.reject(new Error('EIO /chemin/interne')) : real.read(current, options),
    };
    const updates = f.create({ ports: { channel } });
    const failure = await updates.status().catch((error: unknown) => String(error));
    expect(failure).toContain('n’a pas pu être lu');
    expect(failure).not.toContain('/chemin');
    failing = false;
    expect((await updates.status()).available).toEqual(NEXT);
  });

  it('des vérifications simultanées ne lancent qu’une lecture', async () => {
    await f.publish();
    const updates = f.create();
    await updates.start();
    await updates.status();
    const before = updates.readCount();
    const results = await Promise.all([updates.check(), updates.check(), updates.check()]);
    expect(updates.readCount() - before).toBe(1);
    for (const status of results) expect(status.available).toEqual(NEXT);
  });
});
