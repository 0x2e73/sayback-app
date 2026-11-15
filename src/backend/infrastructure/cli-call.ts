import { dirname } from 'node:path';
import { cliEnvironment } from './cli-environment';
import type { CliNotesDependencies } from './cli-notes';
import type { CliRun } from './cli-runner';

// Far above the notes of a meeting and the status of an account; a runaway stream is cut there.
export const cliMaxOutputBytes = 2_000_000;

interface CliCall {
  args: readonly string[];
  input: string;
  cwd: string;
  timeoutMs: number;
  /** Added to the minimal environment (switches of the client). */
  environment?: Readonly<Record<string, string>>;
}

/**
 * The one place that builds what a CLI is started with: a minimal environment, the abort signal and
 * the output cap. A CLI installed by npm or bun is a `#!/usr/bin/env node` script, which needs
 * `node` on the PATH: the folder of the `node` we can find joins the PATH, and no other folder.
 */
export function cliCall(
  dependencies: CliNotesDependencies,
  command: string,
  call: CliCall,
): CliRun {
  const node = dependencies.locate('node');
  const environment = cliEnvironment(
    dependencies.environment,
    dirname(command),
    node ? [dirname(node)] : [],
  );
  return {
    command,
    args: call.args,
    input: call.input,
    cwd: call.cwd,
    env: { ...environment, ...call.environment },
    timeoutMs: call.timeoutMs,
    maxOutputBytes: cliMaxOutputBytes,
    signal: dependencies.signal,
  };
}
