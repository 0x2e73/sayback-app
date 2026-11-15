import { homedir } from 'node:os';
import { locateCli } from '../backend/infrastructure/cli-environment';
import type { CliNotesDependencies } from '../backend/infrastructure/cli-notes';
import { spawnCliRunner } from '../backend/infrastructure/cli-runner';

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
