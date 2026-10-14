import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFakeBundle } from '../src/backend/infrastructure/test-bundle';
import { APP_BUNDLE_NAME, BUILD_INFO_FILE_NAME } from '../src/shared/update-channel';
import { RELEASE_STEPS, type ReleaseIo } from './update-release';

// Test support: simulated commands for `runRelease`. `git` answers as told, `package` "builds"
// a fake bundle in the copy, and any step can fail or interrupt the run.

export const COMMIT = 'c'.repeat(40);
export const INFO = { version: '0.1.0', commit: COMMIT, builtAt: '2026-10-13T12:00:00.000Z' };

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
}

export function fakeIo(options: FakeOptions = {}) {
  const calls: Call[] = [];
  const controller = new AbortController();
  const outputs = options.outputs ?? { [`mac-${process.arch}`]: 'copie' };
  const io: ReleaseIo = {
    capture: (command, args, cwd) => {
      calls.push({ command, args, cwd });
      if (args[0] === 'status') return Promise.resolve(options.dirty ?? '');
      if (args[0] === 'rev-parse') return Promise.resolve(`${COMMIT}\n`);
      return Promise.reject(new Error(`commande inattendue : ${command}`));
    },
    run: async (command, args, cwd, env) => {
      calls.push({ command, args, cwd, ...(env === undefined ? {} : { env }) });
      const step = RELEASE_STEPS.find(
        (candidate) => candidate.command === command && candidate.args.join(' ') === args.join(' '),
      );
      if (step && step.label === options.abortAt) controller.abort();
      if (step && step.label === options.failAt) return 2;
      if (step?.label === 'package') await build(cwd, outputs, options.builtCommit ?? COMMIT);
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
