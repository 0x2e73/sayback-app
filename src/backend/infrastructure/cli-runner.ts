import { spawn } from 'node:child_process';

/** One run of an external program: an argument array, never a shell line. */
export interface CliRun {
  command: string;
  args: readonly string[];
  /** Written to stdin, then closed: the prompt never travels in the arguments. */
  input: string;
  cwd: string;
  /** The whole environment of the process: nothing is inherited. */
  env: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxOutputBytes: number;
  signal?: AbortSignal;
}

export interface CliOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** The port: tests inject a fake, so no test ever starts a real CLI or makes a paid call. */
export type CliRunner = (run: CliRun) => Promise<CliOutput>;

export class CliUnavailableError extends Error {}
export class CliTimeoutError extends Error {}
export class CliTooMuchOutputError extends Error {}
export class CliCancelledError extends Error {}

// Only the tail of stderr is useful, and it can be as long as the process wants.
const stderrLimit = 16_384;

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    // The child leads its own process group: the signal reaches anything it started.
    process.kill(-pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}

export function spawnCliRunner(run: CliRun): Promise<CliOutput> {
  return new Promise((resolve, reject) => {
    if (run.signal?.aborted) {
      reject(new CliCancelledError());
      return;
    }
    const child = spawn(run.command, [...run.args], {
      cwd: run.cwd,
      env: { ...run.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
      shell: false,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let settled = false;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      run.signal?.removeEventListener('abort', onAbort);
      action();
    };
    const stop = (error: Error) => {
      killTree(child.pid);
      finish(() => reject(error));
    };
    const onAbort = () => stop(new CliCancelledError());
    const timer = setTimeout(() => stop(new CliTimeoutError()), run.timeoutMs);
    run.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      outBytes += chunk.length;
      if (outBytes > run.maxOutputBytes) return stop(new CliTooMuchOutputError());
      out.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err.push(chunk);
      errBytes += chunk.length;
      while (errBytes > stderrLimit && err.length > 1) errBytes -= err.shift()?.length ?? 0;
    });
    child.stdin.on('error', () => undefined);
    child.on('error', () => stop(new CliUnavailableError()));
    child.on('close', (code) =>
      finish(() =>
        resolve({
          exitCode: code ?? 1,
          stdout: Buffer.concat(out).toString('utf8'),
          stderr: Buffer.concat(err).toString('utf8'),
        }),
      ),
    );
    child.stdin.end(run.input);
  });
}
