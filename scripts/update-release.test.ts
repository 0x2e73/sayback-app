import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChannelReader } from '../src/backend/infrastructure/update-channel-reader';
import { writeFakeBundle } from '../src/backend/infrastructure/test-bundle';
import { APP_BUNDLE_NAME, BUILD_INFO_FILE_NAME } from '../src/shared/update-channel';
import {
  RELEASE_STEPS,
  ReleaseError,
  parseReleaseArgs,
  runRelease,
  type ReleaseIo,
} from './update-release';

// `runRelease` with simulated commands: order of the steps, stop at the first red one, dirty tree.

const COMMIT = 'c'.repeat(40);
const RUNNING = { commit: 'a'.repeat(40), builtAt: '2026-10-13T10:00:00.000Z' };
const INFO = { version: '0.1.0', commit: COMMIT, builtAt: '2026-10-13T12:00:00.000Z' };
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

interface Call {
  command: string;
  args: readonly string[];
  cwd: string;
}

interface FakeOptions {
  dirty?: string;
  failAt?: string;
  builtCommit?: string;
}

/** Simulated commands: `git` answers as told, `package` "builds" a fake bundle in the copy. */
function fakeIo(options: FakeOptions = {}): { io: ReleaseIo; calls: Call[] } {
  const calls: Call[] = [];
  const io: ReleaseIo = {
    capture: (command, args, cwd) => {
      calls.push({ command, args, cwd });
      if (args[0] === 'status') return Promise.resolve(options.dirty ?? '');
      if (args[0] === 'rev-parse') return Promise.resolve(`${COMMIT}\n`);
      return Promise.reject(new Error(`commande inattendue : ${command}`));
    },
    run: async (command, args, cwd) => {
      calls.push({ command, args, cwd });
      const step = RELEASE_STEPS.find(
        (candidate) => candidate.command === command && candidate.args.join(' ') === args.join(' '),
      );
      if (step && step.label === options.failAt) return 2;
      if (step?.label === 'package') {
        await writeFakeBundle(join(cwd, 'dist', 'mac-arm64', APP_BUNDLE_NAME), { asar: 'copie' });
        await mkdir(join(cwd, 'out'), { recursive: true });
        const info = { ...INFO, commit: options.builtCommit ?? COMMIT, localUpdateChannel: true };
        await writeFile(join(cwd, 'out', BUILD_INFO_FILE_NAME), JSON.stringify(info));
      }
      return 0;
    },
    log: () => undefined,
  };
  return { io, calls };
}

const ran = (calls: Call[]) =>
  calls.map((call) => [call.command, ...call.args.slice(0, 2)].join(' '));
const context = (io: ReleaseIo) => ({ repoRoot: root, channelRoot, io });

describe('runRelease', () => {
  it('arbre propre : copie figée, vérifications dans la copie, publication, ménage', async () => {
    const { io, calls } = fakeIo();
    const manifest = await runRelease({ allowDirty: false, notes: 'première' }, context(io));
    expect(manifest).toMatchObject({ ...INFO, bundle: APP_BUNDLE_NAME, notes: 'première' });
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
    ]);
    expect(calls[2]?.args).toEqual(['worktree', 'add', '--detach', tree, COMMIT]);
    expect(calls[3]?.args).toEqual(['-cR', join(root, 'node_modules'), join(tree, 'node_modules')]);
    for (const call of calls.slice(4, 6)) expect(call.cwd).toBe(tree);
    expect(calls.at(-1)?.args).toEqual(['worktree', 'remove', '--force', tree]);
    const reading = await createChannelReader({ updatesDir, uid }).read(RUNNING);
    expect(reading).toEqual({ kind: 'available', manifest });
    await expect(stat(tree)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(RELEASE_STEPS.map((step) => step.label))(
    'étape « %s » rouge : arrêt nommé, rien de publié, copie retirée',
    async (label) => {
      const { io, calls } = fakeIo({ failAt: label });
      await expect(runRelease({ allowDirty: false }, context(io))).rejects.toThrow(
        new RegExp(`étape « ${label} » en échec`),
      );
      expect(calls.at(-1)?.args.slice(0, 2)).toEqual(['worktree', 'remove']);
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
    const manifest = await runRelease({ allowDirty: true, notes: 'essai' }, context(io));
    expect(manifest.commit).toBe(COMMIT);
    expect(manifest.notes).toMatch(/arbre de travail modifié.*essai$/);
  });

  it('le paquet construit ne vient pas du commit publié : refus, rien de publié', async () => {
    const { io } = fakeIo({ builtCommit: 'e'.repeat(40) });
    await expect(runRelease({ allowDirty: false }, context(io))).rejects.toThrow(ReleaseError);
    await expect(stat(updatesDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
