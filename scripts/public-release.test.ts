import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Of } from '../src/backend/infrastructure/test-bundle';
import { APP_BUNDLE_NAME, LOCAL_UPDATE_CHANNEL_ENV } from '../src/shared/update-channel';
import { CODESIGN_PROGRAM, RELEASE_TEAM_ID } from './local-signing';
import { FILE_PROGRAM } from './mach-o';
import {
  PUBLIC_RELEASE_STEPS,
  publicationCommands,
  runPublicRelease,
  type PublicReleaseContext,
} from './public-release';
import { HDIUTIL_PROGRAM, SPCTL_PROGRAM, XCRUN_PROGRAM, notaryVerdict } from './release-notary';
import type { CommandResult } from './release-proof';
import { COMMIT, INFO, fakeIo, ran, type Call } from './test-release-io';

// The whole release with every OS boundary simulated (git, keychain, file, codesign, notarytool,
// hdiutil, spctl, stapler): guards and order of the steps, not the exact command lines.

const DEVELOPER_ID = `Developer ID Application: Jane Doe (${RELEASE_TEAM_ID})`;
const HASH = 'B'.repeat(40);
const KEYCHAIN = `  1) ${HASH} "${DEVELOPER_ID}"\n     1 identities found\n`;
const TEAM_REQUIREMENT = `identifier "ch.sayback.desktop" and anchor apple generic and certificate leaf[subject.OU] = ${RELEASE_TEAM_ID}`;
const DMG_NAME = 'SayBack-0.1.0-arm64.dmg';
const ENTITLEMENTS = join(import.meta.dirname, '..', 'build', 'entitlements.mac.plist');
const SIGNED_DETAILS = [
  'CodeDirectory v=20500 size=1 flags=0x10000(runtime) hashes=1+0 location=embedded',
  `Authority=${DEVELOPER_ID}`,
  'Timestamp=17 Nov 2026 at 10:00:00',
].join('\n');

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-public-release-')));
  await mkdir(join(root, 'build'));
  await copyFile(ENTITLEMENTS, join(root, 'build', 'entitlements.mac.plist'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

interface Scenario {
  dirty?: string;
  keychain?: string;
  failAt?: string;
  notary?: CommandResult;
  localUpdateChannel?: boolean;
  dmgs?: readonly string[];
}

const ACCEPTED = { code: 0, stdout: '{"id":"abc-123","status":"Accepted"}', stderr: '' };

/** `hdiutil attach` mounts a copy of the built app, as the dmg holds it. */
function mount(args: readonly string[]): string {
  const mountpoint = args[args.indexOf('-mountpoint') + 1] ?? '';
  cpSync(
    join(root, 'dist', `mac-${process.arch}`, APP_BUNDLE_NAME),
    join(mountpoint, APP_BUNDLE_NAME),
    {
      recursive: true,
    },
  );
  return '';
}

function answer(command: string, args: readonly string[]): string | undefined {
  if (command === FILE_PROGRAM) {
    const files = args.slice(args.indexOf('--') + 1);
    const kind = (path: string) =>
      path.includes('/MacOS/') ? 'Mach-O 64-bit executable arm64' : 'data';
    return files.map((path) => `${path}\0: ${kind(path)}\n`).join('');
  }
  if (command === HDIUTIL_PROGRAM) return mount(args);
  if (command === CODESIGN_PROGRAM && args[0] !== '-d') return '';
  if (command === XCRUN_PROGRAM) return '';
  return undefined;
}

function inspectAnswer(
  command: string,
  args: readonly string[],
  scenario: Scenario,
): CommandResult {
  const ok = { code: 0, stdout: '', stderr: '' };
  if (command === XCRUN_PROGRAM && args[1] === 'submit') return scenario.notary ?? ACCEPTED;
  if (command === SPCTL_PROGRAM) {
    return { ...ok, stderr: 'SayBack.app: accepted\nsource=Notarized Developer ID\n' };
  }
  if (command === CODESIGN_PROGRAM && args[0] === '-dvvv') return { ...ok, stderr: SIGNED_DETAILS };
  if (command === CODESIGN_PROGRAM) {
    const path = args.at(-1) ?? '';
    const granted = path.endsWith('.app') || path.includes('/MacOS/');
    const plist =
      '<key>com.apple.security.cs.allow-jit</key><key>com.apple.security.device.audio-input</key>';
    return { ...ok, stdout: granted ? plist : '' };
  }
  return ok;
}

function setup(scenario: Scenario = {}) {
  const fake = fakeIo({
    keychain: scenario.keychain ?? KEYCHAIN,
    builtRequirement: TEAM_REQUIREMENT,
    steps: PUBLIC_RELEASE_STEPS,
    answer,
    afterStep: async (label, cwd) => {
      if (label !== 'dmg') return;
      for (const name of scenario.dmgs ?? [DMG_NAME])
        await writeFile(join(cwd, 'dist', name), 'dmg');
    },
    ...(scenario.dirty === undefined ? {} : { dirty: scenario.dirty }),
    ...(scenario.failAt === undefined ? {} : { failAt: scenario.failAt }),
  });
  const inspect = (command: string, args: readonly string[]) => {
    fake.calls.push({ command, args, cwd: root });
    return Promise.resolve(inspectAnswer(command, args, scenario));
  };
  const context: PublicReleaseContext = {
    repoRoot: root,
    io: { ...fake.io, inspect },
    identityName: DEVELOPER_ID,
    readBuildInfo: () =>
      Promise.resolve({ ...INFO, localUpdateChannel: scenario.localUpdateChannel ?? false }),
  };
  return { context, calls: fake.calls };
}

const position = (calls: Call[], prefix: string) =>
  ran(calls).findIndex((line) => line.startsWith(prefix));

describe('runPublicRelease : garde-fous', () => {
  it('arbre de travail modifié : rien n’est construit', async () => {
    const { context, calls } = setup({ dirty: ' M src/main/index.ts\n' });
    await expect(runPublicRelease(context)).rejects.toThrow(/non commitées/);
    expect(position(calls, 'npm run')).toBe(-1);
  });

  it('identité absente : refusée avant tout', async () => {
    const { context, calls } = setup();
    await expect(runPublicRelease({ ...context, identityName: null })).rejects.toThrow(/absente/);
    expect(calls).toEqual([]);
  });

  it('identité qui n’est pas le Developer ID de l’équipe : refusée avant tout', async () => {
    const { context, calls } = setup();
    const local = { ...context, identityName: 'SayBack Local Signing' };
    await expect(runPublicRelease(local)).rejects.toThrow(/version publique/);
    expect(calls).toEqual([]);
  });

  it('Developer ID absent du trousseau : refusé avant la construction', async () => {
    const { context, calls } = setup({ keychain: '     0 identities found\n' });
    await expect(runPublicRelease(context)).rejects.toThrow(/aucune identité/);
    expect(position(calls, 'npm run')).toBe(-1);
  });

  it('paquet qui porte le canal local : arrêt avant la signature', async () => {
    const { context, calls } = setup({ localUpdateChannel: true });
    await expect(runPublicRelease(context)).rejects.toThrow(/canal de mise à jour local/);
    expect(position(calls, `${CODESIGN_PROGRAM} --sign`)).toBe(-1);
  });

  it('étape en échec : la suivante ne part pas', async () => {
    const { context, calls } = setup({ failAt: 'check' });
    await expect(runPublicRelease(context)).rejects.toThrow(/« check » en échec/);
    expect(position(calls, 'npm run build')).toBe(-1);
  });

  it.each([
    [
      'Invalid, code non nul',
      { code: 1, stdout: '{"id":"abc-123","status":"Invalid"}', stderr: '' },
    ],
    ['Invalid, code nul', { code: 0, stdout: '{"id":"abc-123","status":"Invalid"}', stderr: '' }],
    [
      'Accepted mais code non nul',
      { code: 2, stdout: '{"id":"abc-123","status":"Accepted"}', stderr: '' },
    ],
  ])('notarisation %s : journal affiché, rien n’est agrafé', async (_, notary) => {
    const { context, calls } = setup({ notary });
    await expect(runPublicRelease(context)).rejects.toThrow(/notarisation .* \(abc-123\)/);
    expect(ran(calls)).toContain(`${XCRUN_PROGRAM} notarytool log`);
    expect(position(calls, `${XCRUN_PROGRAM} stapler`)).toBe(-1);
  });

  it('notarytool sans verdict (profil absent…) : arrêt, erreur montrée', async () => {
    const notary = { code: 69, stdout: '', stderr: 'No Keychain password item found for profile' };
    const { context } = setup({ notary });
    await expect(runPublicRelease(context)).rejects.toThrow(/aucun verdict \(code 69\).*profile/);
  });

  it('aucun dmg produit : arrêt', async () => {
    const { context } = setup({ dmgs: [] });
    await expect(runPublicRelease(context)).rejects.toThrow(/un seul dmg/);
  });
});

describe('runPublicRelease : ordre', () => {
  it('construit, signe, fait le dmg, notarise, agrafe, prouve, puis la somme', async () => {
    const { context, calls } = setup();
    const result = await runPublicRelease(context);
    const order = [
      'npm run check',
      'npm run build',
      'npx electron-builder --dir',
      `${CODESIGN_PROGRAM} --sign`,
      'node scripts/dist-cli.ts',
      `${XCRUN_PROGRAM} notarytool submit`,
      `${XCRUN_PROGRAM} stapler staple`,
      `${HDIUTIL_PROGRAM} attach`,
      `${SPCTL_PROGRAM} -a`,
      `${HDIUTIL_PROGRAM} detach`,
      `${XCRUN_PROGRAM} stapler validate`,
    ].map((prefix) => position(calls, prefix));
    expect(order).not.toContain(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const dmg = join(root, 'dist', DMG_NAME);
    expect(result).toEqual({
      version: INFO.version,
      commit: COMMIT,
      dmg,
      checksums: join(root, 'dist', 'SHA256SUMS'),
    });
    expect(await readFile(result.checksums, 'utf8')).toBe(`${sha256Of('dmg')}  ${DMG_NAME}\n`);
  });

  it('chaque étape de construction ferme le canal local', async () => {
    const { context, calls } = setup();
    await runPublicRelease(context);
    const steps = calls.filter((call) => call.env !== undefined);
    expect(steps).toHaveLength(PUBLIC_RELEASE_STEPS.length);
    for (const step of steps) expect(step.env).toEqual({ [LOCAL_UPDATE_CHANNEL_ENV]: '0' });
  });

  it('un vieux dmg est retiré avant d’en faire un nouveau', async () => {
    const { context } = setup();
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(join(root, 'dist', 'SayBack-0.0.9-arm64.dmg'), 'ancien');
    const result = await runPublicRelease(context);
    expect(result.dmg).toBe(join(root, 'dist', DMG_NAME));
  });
});

describe('notaryVerdict', () => {
  it.each(['', 'pas du json', '{"status":"Accepted"}', '[]'])('%j : aucun verdict', (stdout) => {
    expect(notaryVerdict(stdout)).toBeNull();
  });
});

describe('publicationCommands', () => {
  it('tag, push, brouillon : rien de plus', () => {
    const result = {
      version: '0.1.0',
      commit: COMMIT,
      dmg: '/r/dist/S.dmg',
      checksums: '/r/dist/SHA256SUMS',
    };
    expect(publicationCommands(result)).toEqual([
      `git tag v0.1.0 ${COMMIT}`,
      'git push origin v0.1.0',
      'gh release create v0.1.0 --verify-tag --draft "/r/dist/S.dmg" "/r/dist/SHA256SUMS"',
    ]);
  });
});
