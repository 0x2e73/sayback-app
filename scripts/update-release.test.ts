import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChannelReader } from '../src/backend/infrastructure/update-channel-reader';
import { APP_BUNDLE_NAME, LOCAL_UPDATE_CHANNEL_ENV } from '../src/shared/update-channel';
import { COMMIT, INFO, fakeIo, ran } from './test-release-io';
import {
  RELEASE_STEPS,
  ReleaseError,
  parseReleaseArgs,
  runRelease,
  type ReleaseIo,
} from './update-release';

// `runRelease` with simulated commands: order of the steps, stop at the first red one, dirty tree.

const RUNNING = { commit: 'a'.repeat(40), builtAt: '2026-10-13T10:00:00.000Z' };
const uid = process.getuid?.() ?? 0;

let root: string;
let channelRoot: string;
let updatesDir: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-release-')));
  channelRoot = join(root, 'Application Support', 'SayBack');
  updatesDir = join(channelRoot, 'updates');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('parseReleaseArgs', () => {
  it.each([
    [[], { allowDirty: false }],
    [['--allow-dirty'], { allowDirty: true }],
    [['--notes', 'corrige la fermeture'], { allowDirty: false, notes: 'corrige la fermeture' }],
    [['--notes=avec = dedans'], { allowDirty: false, notes: 'avec = dedans' }],
    [
      ['--allow-dirty', '--notes', 'x', '--channel-root', '/tmp/essai'],
      { allowDirty: true, notes: 'x', channelRoot: '/tmp/essai' },
    ],
    [['--channel-root=/tmp/a b'], { allowDirty: false, channelRoot: '/tmp/a b' }],
  ])('%j', (argv, expected) => {
    expect(parseReleaseArgs(argv)).toEqual(expected);
  });

  it.each([
    [['--notes']],
    [['--notes', '--allow-dirty']],
    [['--notes=']],
    [['--publier']],
    [['notes']],
    [['--allow-dirty=oui']],
    [['--channel-root']],
  ])('refusé : %j', (argv) => {
    expect(() => parseReleaseArgs(argv)).toThrow(ReleaseError);
  });
});

const context = (io: ReleaseIo) => ({ repoRoot: root, channelRoot, io });

describe('runRelease', () => {
  it('arbre propre : copie figée, vérifications dans la copie, publication, ménage', async () => {
    const { io, calls } = fakeIo();
    const result = await runRelease({ allowDirty: false, notes: 'première' }, context(io));
    expect(result.manifest).toMatchObject({ ...INFO, bundle: APP_BUNDLE_NAME, notes: 'première' });
    expect(result.alreadyPublished).toBe(false);
    const tree = calls.find((call) => call.args[1] === 'add')?.args[3] ?? '';
    expect(tree).not.toBe('');
    expect(ran(calls)).toEqual([
      'git status --porcelain',
      'git rev-parse HEAD',
      'git worktree add',
      `cp -cR ${join(root, 'node_modules')}`,
      'npm run check',
      'npx electron-builder --dir',
      'git worktree remove',
      'git worktree prune',
    ]);
    expect(calls[2]?.args).toEqual(['worktree', 'add', '--detach', tree, COMMIT]);
    expect(calls[3]?.args).toEqual(['-cR', join(root, 'node_modules'), join(tree, 'node_modules')]);
    expect(calls.at(-2)?.args).toEqual(['worktree', 'remove', '--force', tree]);
    const reading = await createChannelReader({ updatesDir, uid }).read(RUNNING);
    expect(reading).toEqual({ kind: 'available', manifest: result.manifest });
    await expect(stat(tree)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('la copie est construite avec le canal local ouvert, explicitement', async () => {
    const { io, calls } = fakeIo();
    await runRelease({ allowDirty: false }, context(io));
    const tree = calls.find((call) => call.args[1] === 'add')?.args[3] ?? '';
    const steps = calls.filter((call) => call.cwd === tree);
    expect(steps.map((call) => call.command)).toEqual(['npm', 'npx']);
    for (const step of steps) expect(step.env).toEqual({ [LOCAL_UPDATE_CHANNEL_ENV]: '1' });
  });

  it.each(RELEASE_STEPS.map((step) => step.label))(
    'étape « %s » rouge : arrêt nommé, rien de publié, copie retirée',
    async (label) => {
      const { io, calls } = fakeIo({ failAt: label });
      await expect(runRelease({ allowDirty: false }, context(io))).rejects.toThrow(
        new RegExp(`étape « ${label} » en échec`),
      );
      expect(ran(calls).slice(-2)).toEqual(['git worktree remove', 'git worktree prune']);
      await expect(stat(updatesDir)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('arbre modifié : refus avant toute chose', async () => {
    const { io, calls } = fakeIo({ dirty: ' M src/main/index.ts\n?? brouillon.txt\n' });
    await expect(runRelease({ allowDirty: false }, context(io))).rejects.toThrow(
      /2 modification\(s\) non commitée\(s\).*--allow-dirty/,
    );
    expect(ran(calls)).toEqual(['git status --porcelain']);
    await expect(stat(updatesDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('arbre modifié avec --allow-dirty : le commit courant est publié, la note le dit', async () => {
    const { io } = fakeIo({ dirty: ' M src/main/index.ts\n' });
    const { manifest } = await runRelease({ allowDirty: true, notes: 'essai' }, context(io));
    expect(manifest.commit).toBe(COMMIT);
    expect(manifest.notes).toMatch(/arbre de travail modifié.*essai$/);
  });

  it('le paquet construit ne vient pas du commit publié : refus, rien de publié', async () => {
    const { io } = fakeIo({ builtCommit: 'e'.repeat(40) });
    await expect(runRelease({ allowDirty: false }, context(io))).rejects.toThrow(ReleaseError);
    await expect(stat(updatesDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
