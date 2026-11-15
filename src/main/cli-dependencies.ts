import { chmodSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { locateCli } from '../backend/infrastructure/cli-environment';
import type { CliNotesDependencies } from '../backend/infrastructure/cli-notes';
import { spawnCliRunner } from '../backend/infrastructure/cli-runner';

/**
 * Where each CLI run gets its working folder: in the user data, not the system temp folder. A crash
 * or a quit during a run would leave screen frames there; the folder is wiped at startup and on close.
 */
export function prepareCliRuns(root: string): string {
  const runs = join(root, 'cli-runs');
  rmSync(runs, { recursive: true, force: true });
  mkdirSync(runs, { recursive: true, mode: 0o700 });
  chmodSync(runs, 0o700);
  return runs;
}

export function clearCliRuns(runs: string): void {
  rmSync(runs, { recursive: true, force: true });
}

/** The real process runner and the machine's real folders, for the CLI notes providers. */
export function cliDependencies(signal: AbortSignal, tempRoot: string): CliNotesDependencies {
  return {
    runner: spawnCliRunner,
    locate: (binary) => locateCli(binary, { home: homedir(), path: process.env.PATH ?? '' }),
    environment: process.env,
    tempRoot,
    signal,
  };
}
