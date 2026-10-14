import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Of } from '../src/backend/infrastructure/test-bundle';
import { fakeIo, ran } from './test-release-io';
import { runRelease, type ReleaseIo } from './update-release';

// Interruption, choice of the built bundle and re-publication of the same commit.

let root: string;
let channelRoot: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-release-guards-')));
  channelRoot = join(root, 'Application Support', 'SayBack');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const context = (io: ReleaseIo, signal?: AbortSignal) => ({
  repoRoot: root,
  channelRoot,
  io,
  ...(signal === undefined ? {} : { signal }),
});

describe('interruption', () => {
  it('interrompue pendant une étape : la suivante ne part pas, la copie est retirée', async () => {
    const { io, calls, signal } = fakeIo({ abortAt: 'check' });
    await expect(runRelease({ allowDirty: false }, context(io, signal))).rejects.toThrow(
      /interrompue/,
    );
    expect(ran(calls)).not.toContain('npx electron-builder --dir');
    expect(ran(calls).slice(-2)).toEqual(['git worktree remove', 'git worktree prune']);
    await expect(stat(join(channelRoot, 'updates'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('interrompue avant de commencer : rien n’est créé', async () => {
    const { io, calls } = fakeIo();
    const controller = new AbortController();
    controller.abort();
    await expect(runRelease({ allowDirty: false }, context(io, controller.signal))).rejects.toThrow(
      /interrompue/,
    );
    expect(ran(calls)).not.toContain('git worktree add');
  });
});

describe('paquet construit', () => {
  it('préfère dist/mac-<architecture de la machine> aux autres sorties', async () => {
    const outputs = { mac: 'autre architecture', [`mac-${process.arch}`]: 'cette machine' };
    const { io } = fakeIo({ outputs });
    const { manifest } = await runRelease({ allowDirty: false }, context(io));
    expect(manifest.sha256).toBe(sha256Of('cette machine'));
  });

  it('se rabat sur une autre sortie mac quand celle de la machine manque', async () => {
    const { io } = fakeIo({ outputs: { mac: 'seule sortie' } });
    const { manifest } = await runRelease({ allowDirty: false }, context(io));
    expect(manifest.sha256).toBe(sha256Of('seule sortie'));
  });
});

describe('commit déjà publié', () => {
  it('le même commit republié est signalé, une première publication ne l’est pas', async () => {
    const first = await runRelease({ allowDirty: false }, context(fakeIo().io));
    expect(first.alreadyPublished).toBe(false);
    const second = await runRelease({ allowDirty: false }, context(fakeIo().io));
    expect(second.alreadyPublished).toBe(true);
  });
});
