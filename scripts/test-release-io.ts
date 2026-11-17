import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFakeBundle } from '../src/backend/infrastructure/test-bundle';
import {
  APP_BUNDLE_NAME,
  BUILD_INFO_FILE_NAME,
  UPDATES_DIR_NAME,
} from '../src/shared/update-channel';
import { CODESIGN_PROGRAM, SECURITY_PROGRAM } from './local-signing';
import { RELEASE_STEPS, type ReleaseIo } from './update-release';

// Test support: simulated commands for `runRelease`. `git` answers as told, `package` "builds"
// a fake bundle in the copy, and any step can fail or interrupt the run.

export const COMMIT = 'c'.repeat(40);
export const INFO = { version: '0.1.0', commit: COMMIT, builtAt: '2026-10-13T12:00:00.000Z' };
export const IDENTITY = {
  name: 'SayBack Local Signing',
  hash: '0123456789ABCDEF0123456789ABCDEF01234567',
};
export const SIGNED_REQUIREMENT = `identifier "ch.sayback.desktop" and certificate leaf = H"${IDENTITY.hash.toLowerCase()}"`;
export const ADHOC_REQUIREMENT = `cdhash H"${'d'.repeat(40)}"`;

export interface Call {
  command: string;
  args: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string>>;
}

export interface FakeOptions {
  dirty?: string;
  failAt?: string;
  /** Interrupts the run (like ⌃C) while this step runs; the step itself succeeds. */
  abortAt?: string;
  builtCommit?: string;
  /** Output folders `package` fills, `dist/<name>/SayBack.app`, each with its own app.asar. */
  outputs?: Record<string, string>;
  /** `security find-identity` output; by default IDENTITY, untrusted. */
  keychain?: string;
  /** Designated requirement of the built bundle; by default signed by IDENTITY. */
  builtRequirement?: string;
  /** Of the bundle the channel already offers; by default the built one's. */
  publishedRequirement?: string;
  /** Steps `failAt`, `abortAt` and `afterStep` name; by default those of `update:publish`. */
  steps?: readonly { label: string; command: string; args: readonly string[] }[];
  /** Answers a `capture` before the defaults; `undefined` lets them answer. */
  answer?: (command: string, args: readonly string[]) => string | undefined;
  /** Runs after a step succeeded, in its folder (to write what it would produce). */
  afterStep?: (label: string, cwd: string) => Promise<void>;
}

const KEYCHAIN = `  1) ${IDENTITY.hash} "${IDENTITY.name}" (CSSMERR_TP_NOT_TRUSTED)\n     1 identities found\n`;

/** `codesign -d -r-`: the staged bundle of the channel, or the one built in the copy. */
function requirementOf(path: string, options: FakeOptions): string {
  const built = options.builtRequirement ?? SIGNED_REQUIREMENT;
  const published = path.endsWith(join(UPDATES_DIR_NAME, APP_BUNDLE_NAME));
  const requirement = published ? (options.publishedRequirement ?? built) : built;
  return `designated => ${requirement}\n`;
}

export function fakeIo(options: FakeOptions = {}) {
  const calls: Call[] = [];
  const controller = new AbortController();
  const outputs = options.outputs ?? { [`mac-${process.arch}`]: 'copie' };
  const io: ReleaseIo = {
    capture: (command, args, cwd) => {
      calls.push({ command, args, cwd });
      const answered = options.answer?.(command, args);
      if (answered !== undefined) return Promise.resolve(answered);
      if (args[0] === 'status') return Promise.resolve(options.dirty ?? '');
      if (args[0] === 'rev-parse') return Promise.resolve(`${COMMIT}\n`);
      if (command === SECURITY_PROGRAM) return Promise.resolve(options.keychain ?? KEYCHAIN);
      if (command === CODESIGN_PROGRAM && args[0] === '-d') {
        return Promise.resolve(requirementOf(args.at(-1) ?? '', options));
      }
      return Promise.reject(new Error(`commande inattendue : ${command}`));
    },
    run: async (command, args, cwd, env) => {
      calls.push({ command, args, cwd, ...(env === undefined ? {} : { env }) });
      const step = (options.steps ?? RELEASE_STEPS).find(
        (candidate) => candidate.command === command && candidate.args.join(' ') === args.join(' '),
      );
      if (step && step.label === options.abortAt) controller.abort();
      if (step && step.label === options.failAt) return 2;
      if (step?.label === 'package') await build(cwd, outputs, options.builtCommit ?? COMMIT);
      if (step) await options.afterStep?.(step.label, cwd);
      return 0;
    },
    log: () => undefined,
  };
  return { io, calls, signal: controller.signal };
}

async function build(tree: string, outputs: Record<string, string>, commit: string) {
  for (const [folder, asar] of Object.entries(outputs)) {
    await writeFakeBundle(join(tree, 'dist', folder, APP_BUNDLE_NAME), { asar });
  }
  await mkdir(join(tree, 'out'), { recursive: true });
  const info = { ...INFO, commit, localUpdateChannel: true };
  await writeFile(join(tree, 'out', BUILD_INFO_FILE_NAME), JSON.stringify(info));
}

export const ran = (calls: Call[]) =>
  calls.map((call) => [call.command, ...call.args.slice(0, 2)].join(' '));
