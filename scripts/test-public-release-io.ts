import { cpSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_BUNDLE_NAME } from '../src/shared/update-channel';
import { CODESIGN_PROGRAM, RELEASE_TEAM_ID } from './local-signing';
import { FILE_PROGRAM } from './mach-o';
import { PUBLIC_RELEASE_STEPS, type PublicReleaseContext } from './public-release';
import { HDIUTIL_PROGRAM, SPCTL_PROGRAM, XCRUN_PROGRAM } from './release-notary';
import type { CommandResult, InspectOptions } from './release-proof';
import { COMMIT, INFO, fakeIo, ran, type Call } from './test-release-io';

// Test support for `runPublicRelease`: every OS boundary simulated (git, keychain, file,
// codesign, notarytool, hdiutil, spctl, stapler) on top of `fakeIo`, in a real temporary folder.

const ENTITLEMENTS = join(import.meta.dirname, '..', 'build', 'entitlements.mac.plist');

/** A temporary repository root holding the real entitlements file. */
export async function makeRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-public-release-')));
  await mkdir(join(root, 'build'));
  await copyFile(ENTITLEMENTS, join(root, 'build', 'entitlements.mac.plist'));
  return root;
}

const DEVELOPER_ID = `Developer ID Application: Jane Doe (${RELEASE_TEAM_ID})`;
const HASH = 'B'.repeat(40);
const KEYCHAIN = `  1) ${HASH} "${DEVELOPER_ID}"\n     1 identities found\n`;
const TEAM_REQUIREMENT = `identifier "ch.sayback.desktop" and anchor apple generic and certificate leaf[subject.OU] = ${RELEASE_TEAM_ID}`;
export const DMG_NAME = 'SayBack-0.1.0-arm64.dmg';
const SIGNED_DETAILS = [
  'CodeDirectory v=20500 size=1 flags=0x10000(runtime) hashes=1+0 location=embedded',
  `Authority=${DEVELOPER_ID}`,
  'Authority=Developer ID Certification Authority',
  'Authority=Apple Root CA',
  'Timestamp=17 Nov 2026 at 10:00:00',
].join('\n');

export interface Scenario {
  dirty?: string;
  keychain?: string;
  failAt?: string;
  notary?: CommandResult;
  localUpdateChannel?: boolean;
  dmgs?: readonly string[];
  /** `git status` once the build ran (the second look at the tree). */
  dirtyAfterBuild?: string;
  /** Exit codes of the successive `hdiutil detach`; 0 by default. */
  detach?: number[];
  attachFails?: boolean;
}

export const RELEASE_DIR = join('dist', 'release', COMMIT.slice(0, 12));

const ACCEPTED = { code: 0, stdout: '{"id":"abc-123","status":"Accepted"}', stderr: '' };

/** `hdiutil attach` mounts a copy of the built app, as the dmg holds it. */
function mount(root: string, args: readonly string[]): string {
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

function answer(
  root: string,
  command: string,
  args: readonly string[],
  scenario: Scenario,
  statuses: { count: number },
): string | undefined {
  if (args[0] === 'status') {
    statuses.count += 1;
    if (statuses.count === 1) return scenario.dirty ?? '';
    return scenario.dirtyAfterBuild ?? '';
  }
  if (command === HDIUTIL_PROGRAM && scenario.attachFails === true) {
    throw new Error('hdiutil: attach failed');
  }
  if (command === FILE_PROGRAM) {
    const files = args.slice(args.indexOf('--') + 1);
    const kind = (path: string) =>
      path.includes('/MacOS/') ? 'Mach-O 64-bit executable arm64' : 'data';
    return files.map((path) => `${path}\0: ${kind(path)}\n`).join('');
  }
  if (command === HDIUTIL_PROGRAM) return mount(root, args);
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
  if (command === HDIUTIL_PROGRAM) {
    return { ...ok, code: scenario.detach?.shift() ?? 0, stderr: 'hdiutil: couldn’t eject' };
  }
  if (command === SPCTL_PROGRAM) {
    return { ...ok, stderr: 'SayBack.app: accepted\nsource=Notarized Developer ID\n' };
  }
  if (command === CODESIGN_PROGRAM) return codesignAnswer(args);
  return ok;
}

/** `codesign -dvvv`: signed for notarization; `--entitlements`: on the app and its executables. */
function codesignAnswer(args: readonly string[]): CommandResult {
  if (args[0] === '-dvvv') return { code: 0, stdout: '', stderr: SIGNED_DETAILS };
  const path = args.at(-1) ?? '';
  const granted = path.endsWith('.app') || path.includes('/MacOS/');
  const plist =
    '<key>com.apple.security.cs.allow-jit</key><key>com.apple.security.device.audio-input</key>';
  return { code: 0, stdout: granted ? plist : '', stderr: '' };
}

export function setup(root: string, scenario: Scenario = {}) {
  const statuses = { count: 0 };
  const fake = fakeIo({
    keychain: scenario.keychain ?? KEYCHAIN,
    builtRequirement: TEAM_REQUIREMENT,
    steps: PUBLIC_RELEASE_STEPS,
    answer: (command, args) => answer(root, command, args, scenario, statuses),
    afterStep: async (label, cwd) => {
      if (label !== 'dmg') return;
      for (const name of scenario.dmgs ?? [DMG_NAME])
        await writeFile(join(cwd, 'dist', name), 'dmg');
    },
    ...(scenario.failAt === undefined ? {} : { failAt: scenario.failAt }),
  });
  const timeouts: (number | undefined)[] = [];
  const logs: string[] = [];
  const inspect = (command: string, args: readonly string[], options?: InspectOptions) => {
    fake.calls.push({ command, args, cwd: root });
    if (args[1] === 'submit') timeouts.push(options?.timeoutMs);
    return Promise.resolve(inspectAnswer(command, args, scenario));
  };
  const log = (line: string) => {
    logs.push(line);
  };
  const context: PublicReleaseContext = {
    repoRoot: root,
    host: { platform: 'darwin', arch: 'arm64' },
    io: { ...fake.io, inspect, log },
    identityName: DEVELOPER_ID,
    readBuildInfo: () =>
      Promise.resolve({ ...INFO, localUpdateChannel: scenario.localUpdateChannel ?? false }),
  };
  return { context, calls: fake.calls, timeouts, logs };
}

export const mountpoints = (calls: Call[]) =>
  calls
    .filter((call) => call.command === HDIUTIL_PROGRAM && call.args[0] === 'attach')
    .map((call) => call.args.at(-1) ?? '');

export const position = (calls: Call[], prefix: string) =>
  ran(calls).findIndex((line) => line.startsWith(prefix));
