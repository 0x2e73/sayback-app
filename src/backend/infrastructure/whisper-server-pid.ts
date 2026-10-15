import { execFile } from 'node:child_process';
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const COMMAND = 'whisper-server';
// A PID is a few digits: anything bigger is not ours and is not read.
const MAX_PID_FILE_BYTES = 32;
const TERM_GRACE = 1_000;
const POLL = 100;

export interface PidFile {
  write(pid: number): void;
  clear(): void;
  /** The PID left by a previous run, or null. The file is removed. */
  take(): number | null;
}

export function createPidFile(path: string): PidFile {
  return {
    write: (pid) => writeFileSync(path, String(pid), { mode: 0o600 }),
    clear: () => rmSync(path, { force: true }),
    take() {
      try {
        if (statSync(path).size > MAX_PID_FILE_BYTES) return null;
        const pid = Number(readFileSync(path, 'utf8').trim());
        return Number.isSafeInteger(pid) && pid > 1 ? pid : null;
      } catch {
        return null;
      } finally {
        rmSync(path, { force: true });
      }
    },
  };
}

export interface ProcessTable {
  /** The executable of a running process, or null. */
  command(pid: number): Promise<string | null>;
  alive(pid: number): boolean;
  kill(pid: number, signal: NodeJS.Signals): void;
  wait(ms: number): Promise<void>;
}

export const systemProcesses: ProcessTable = {
  async command(pid) {
    try {
      const { stdout } = await execute('ps', ['-p', String(pid), '-o', 'comm='], {
        timeout: 2_000,
        maxBuffer: 4_096,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  },
  alive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
  kill(pid, signal) {
    try {
      process.kill(pid, signal);
    } catch {
      // Gone between the check and the signal.
    }
  },
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

async function exitedWithin(pid: number, table: ProcessTable, ms: number): Promise<boolean> {
  for (let waited = 0; waited < ms; waited += POLL) {
    if (!table.alive(pid)) return true;
    await table.wait(POLL);
  }
  return !table.alive(pid);
}

/**
 * Ends a server left by a run that died without stopping it (a `kill -9`, a crash). The PID is
 * trusted only if it still names a `whisper-server`: a reused PID is left alone.
 */
export async function reapOrphan(
  pids: PidFile,
  table: ProcessTable = systemProcesses,
): Promise<boolean> {
  const pid = pids.take();
  if (pid === null || pid === process.pid) return false;
  const command = await table.command(pid);
  if (!command || basename(command) !== COMMAND) return false;
  table.kill(pid, 'SIGTERM');
  if (!(await exitedWithin(pid, table, TERM_GRACE))) table.kill(pid, 'SIGKILL');
  return true;
}
