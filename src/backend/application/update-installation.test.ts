import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { chmod, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_BUNDLE_NAME } from '../../shared/update-channel';
import {
  APP_PID,
  NEXT,
  NEW_ASAR,
  OLD_ASAR,
  createUpdateFixture,
  type UpdateFixture,
} from '../infrastructure/test-update-fixture';
import { launchDetached } from '../infrastructure/update-install';
import { INSTALL_SCRIPT, INSTALL_SCRIPT_LABEL } from '../infrastructure/update-install-script';
import { UpdateRefusal } from './update-status';

let f: UpdateFixture;

beforeEach(async () => {
  f = await createUpdateFixture();
});

afterEach(async () => {
  await f.cleanup();
});

const asarOf = (path: string) => readFile(join(path, 'Contents', 'Resources', 'app.asar'), 'utf8');
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('install refusé', () => {
  it('rien à installer : refus, rien n’est lancé', async () => {
    const updates = f.create();
    await updates.start();
    await expect(updates.install()).rejects.toThrow('Aucune mise à jour à installer.');
    expect(f.launches).toEqual([]);
    expect(f.quits).toBe(0);
  });

  it('app non empaquetée ou canal fermé : refus avec la raison', async () => {
    await f.publish();
    const dev = f.create({ ports: { isPackaged: false } });
    await expect(dev.install()).rejects.toThrow(/empaquet/);
    const closed = f.create({ ports: { loadBuildInfo: () => Promise.resolve(null) } });
    await expect(closed.install()).rejects.toBeInstanceOf(UpdateRefusal);
    expect(f.launches).toEqual([]);
  });

  it('l’app ne peut pas se remplacer là où elle est : refus avec la raison', async () => {
    await f.publish();
    await chmod(f.appsDir, 0o555);
    const updates = f.create();
    await expect(updates.install()).rejects.toThrow(/inscriptible/);
    expect(f.launches).toEqual([]);
  });

  it('pendant un enregistrement : refus clair, rien n’est écrit ni lancé, la capture continue', async () => {
    await f.publish();
    f.recording = true;
    const updates = f.create();
    await updates.start();
    await expect(updates.install()).rejects.toThrow(/Arrêtez l’enregistrement/);
    expect(f.launches).toEqual([]);
    expect(f.quits).toBe(0);
    expect(await exists(f.logPath)).toBe(false);
    expect(await asarOf(f.runningPath)).toBe(OLD_ASAR);
    expect(f.confirms).toEqual([]);
    f.recording = false;
    expect(await updates.install()).toBe('started');
    expect(f.launches).toHaveLength(1);
  });

  it('un enregistrement démarre pendant le contrôle : refus, rien n’est lancé', async () => {
    await f.publish();
    let asked = 0;
    const updates = f.create({
      ports: {
        isRecording: () => {
          asked += 1;
          return asked > 1;
        },
      },
    });
    await expect(updates.install()).rejects.toThrow(/Arrêtez l’enregistrement/);
    expect(f.launches).toEqual([]);
    expect(f.quits).toBe(0);
  });

  it('le paquet change entre la détection et le clic : recontrôlé, refusé, l’état est annoncé', async () => {
    await f.publish('AAAA');
    const updates = f.create();
    await updates.start();
    expect((await updates.status()).available).toEqual(NEXT);
    await writeFile(join(f.stagedPath, 'Contents', 'Resources', 'app.asar'), 'BBBB');
    await expect(updates.install()).rejects.toThrow(/empreinte/);
    expect(f.launches).toEqual([]);
    expect(f.published.at(-1)).toMatchObject({ available: null, canInstall: false });
  });

  it('le script ne peut pas être lancé : message sans détail interne, l’app reste ouverte', async () => {
    await f.publish();
    f.failNextLaunch = true;
    const updates = f.create();
    const failure = await updates.install().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(UpdateRefusal);
    expect(String(failure)).not.toContain('EAGAIN');
    await settle();
    expect(f.quits).toBe(0);
    expect(await updates.install()).toBe('started');
    expect(f.launches).toHaveLength(1);
  });

  it('deux demandes en même temps : une seule installation, puis plus rien ne repart', async () => {
    await f.publish();
    const updates = f.create();
    await updates.start();
    const results = await Promise.allSettled([updates.install(), updates.install()]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    await expect(updates.install()).rejects.toThrow(/déjà en cours/);
    expect(f.launches).toHaveLength(1);
  });
});

describe('install réussi', () => {
  it('consentement, script fixe lancé détaché sans fichier, état « en cours », puis sortie', async () => {
    const manifest = await f.publish();
    const updates = f.create();
    await updates.start();
    expect(await updates.install()).toBe('started');
    // The app quits AFTER answering the interface.
    expect(f.quits).toBe(0);
    expect(f.confirms).toEqual([NEXT]);
    expect(f.launches).toEqual([
      {
        program: '/bin/sh',
        args: [
          '-c',
          INSTALL_SCRIPT,
          INSTALL_SCRIPT_LABEL,
          String(APP_PID),
          f.stagedPath,
          f.runningPath,
          manifest.sha256,
          f.logPath,
          '60',
          '/usr/bin/open',
          '/usr/bin/ditto',
        ],
      },
    ]);
    // Nothing written in the channel: the script travels in the arguments.
    expect((await readdir(f.updatesDir)).sort()).toEqual([APP_BUNDLE_NAME, 'latest.json'].sort());
    expect(f.published.at(-1)).toMatchObject({
      canInstall: false,
      reason: expect.stringMatching(/en cours/),
    });
    expect((await updates.status()).canInstall).toBe(false);
    await vi.waitFor(() => expect(f.quits).toBe(1));
    const log = await readFile(f.logPath, 'utf8');
    expect(log).toContain(NEXT.commit);
    expect(log).toContain("d'\\''été");
    expect((await stat(f.logPath)).mode & 0o777).toBe(0o600);
  });

  it('de bout en bout avec le vrai script : le paquet qui tourne est remplacé et relancé', async () => {
    await f.publish();
    const witness = join(f.root, "témoin d'ouverture.sh");
    await writeFile(
      witness,
      '#!/bin/sh\nfor arg in "$@"; do printf \'%s\\n\' "$arg" >>"$0.ouvert"; done\n',
    );
    await chmod(witness, 0o700);
    const app = spawn('/bin/sleep', ['0.4'], { stdio: 'ignore' });
    const updates = f.create({
      local: { pid: app.pid ?? 0, launch: launchDetached, openProgram: witness },
    });
    await updates.install();
    const opened = () => readFile(`${witness}.ouvert`, 'utf8').catch(() => '');
    await expect.poll(opened, { timeout: 4_000 }).toBe(`${f.runningPath}\n`);
    expect(await asarOf(f.runningPath)).toBe(NEW_ASAR);
    expect(await asarOf(join(f.appsDir, 'SayBack.previous.app'))).toBe(OLD_ASAR);
    expect((await readdir(f.appsDir)).sort()).toEqual([APP_BUNDLE_NAME, 'SayBack.previous.app']);
    expect(await readFile(f.logPath, 'utf8')).toContain('installée');
  });
});
