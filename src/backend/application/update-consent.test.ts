import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  NEXT,
  SCRIPT_PID,
  createUpdateFixture,
  type UpdateFixture,
} from '../infrastructure/test-update-fixture';

// Consent asked by the main process, and what happens between the click and the exit.

let f: UpdateFixture;

beforeEach(async () => {
  f = await createUpdateFixture();
});

afterEach(async () => {
  await f.cleanup();
});

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('consentement', () => {
  it('« Plus tard » : rien n’est lancé, l’app reste ouverte, ce n’est pas une erreur', async () => {
    await f.publish();
    f.confirmAnswer = false;
    const updates = f.create();
    expect(await updates.install()).toBe('postponed');
    expect(f.confirms).toEqual([NEXT]);
    expect(f.launches).toEqual([]);
    await settle();
    expect(f.quits).toBe(0);
    expect((await updates.status()).canInstall).toBe(true);
  });

  it('une autre version est publiée pendant la question : refus, rien n’est lancé', async () => {
    await f.publish();
    f.onConfirm = async () => {
      const later = { commit: 'c'.repeat(40), builtAt: '2026-10-13T15:00:00.000Z' };
      await f.publish('une troisième version', later);
    };
    const updates = f.create();
    await expect(updates.install()).rejects.toThrow(/entre-temps/);
    expect(f.launches).toEqual([]);
  });

  it('un enregistrement démarre pendant la question : refus, rien n’est lancé', async () => {
    await f.publish();
    f.onConfirm = () => {
      f.recording = true;
      return Promise.resolve();
    };
    const updates = f.create();
    await expect(updates.install()).rejects.toThrow(/Arrêtez l’enregistrement/);
    expect(f.launches).toEqual([]);
  });
});

describe('entre le lancement et la sortie', () => {
  it('un enregistrement démarre après le clic : le script est arrêté, l’app reste ouverte', async () => {
    await f.publish();
    // Recording starts once the script is launched, and is over once it is stopped.
    const isRecording = () => f.launches.length > 0 && f.terminated.length === 0;
    const updates = f.create({ ports: { isRecording } });
    await updates.start();
    expect(await updates.install()).toBe('started');
    await vi.waitFor(() => expect(f.terminated).toEqual([SCRIPT_PID]));
    expect(f.quits).toBe(0);
    // The button comes back: the state before the click is published again.
    expect(f.published.at(-1)).toMatchObject({ available: NEXT, canInstall: true });
    expect(await readFile(f.logPath, 'utf8')).toContain('enregistrement');
    // Nothing blocks a later attempt once the recording is over.
    expect(await updates.install()).toBe('started');
    await vi.waitFor(() => expect(f.quits).toBe(1));
  });

  it('la sortie de l’app échoue : journalisée, script arrêté, le bouton revient', async () => {
    await f.publish();
    f.quitError = new Error('quit refusé');
    const updates = f.create();
    await updates.start();
    expect(await updates.install()).toBe('started');
    await vi.waitFor(() => expect(f.quits).toBe(1));
    // The app does not quit: the waiting script would only time out, it is stopped now.
    expect(f.terminated).toEqual([SCRIPT_PID]);
    expect(f.published.at(-1)).toMatchObject({ available: NEXT, canInstall: true });
    await vi.waitFor(async () => {
      expect(await readFile(f.logPath, 'utf8')).toContain('quit refusé');
    });
  });
});
