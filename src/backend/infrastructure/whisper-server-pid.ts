import { execFile } from 'node:child_process';
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const COMMAND = 'whisper-server';
// Two PIDs and a start date: anything bigger is not ours and is not read.
const MAX_PID_FILE_BYTES = 128;
const TERM_GRACE = 1_000;
const POLL = 100;

/** The server, the app that started it, and when the server started (`ps -o lstart`). */
export interface ServerRecord {
  serverPid: number;
  appPid: number;
  startedAt: string;
}

export interface PidFile {
  write(record: ServerRecord): void;
  clear(): void;
  read(): ServerRecord | null;
}

function parseRecord(text: string): ServerRecord | null {
  const match = /^(\d+) (\d+) (\S.*)$/.exec(text.trim());
  if (!match) return null;
  const serverPid = Number(match[1]);
  const appPid = Number(match[2]);
  if (!Number.isSafeInteger(serverPid) || !Number.isSafeInteger(appPid)) return null;
  if (serverPid <= 1 || appPid <= 1) return null;
  return { serverPid, appPid, startedAt: match[3]! };
}

export function createPidFile(path: string): PidFile {
  return {
    write: ({ serverPid, appPid, startedAt }) =>
      writeFileSync(path, `${serverPid} ${appPid} ${startedAt}\n`, { mode: 0o600 }),
    clear: () => rmSync(path, { force: true }),
    read() {
      try {
        if (statSync(path).size > MAX_PID_FILE_BYTES) return null;
        return parseRecord(readFileSync(path, 'utf8'));
      } catch {
        return null;
      }
    },
  };
}

export interface ProcessTable {
  /** The executable of a running process, or null. */
  command(pid: number): Promise<string | null>;
  /** The start date of a running process, or null. */
  startedAt(pid: number): Promise<string | null>;
  alive(pid: number): boolean;
  kill(pid: number, signal: NodeJS.Signals): void;
  wait(ms: number): Promise<void>;
}

async function psField(pid: number, field: 'comm' | 'lstart'): Promise<string | null> {
  try {
    const { stdout } = await execute('/bin/ps', ['-p', String(pid), '-o', `${field}=`], {
      timeout: 2_000,
      maxBuffer: 4_096,
      // A fixed locale keeps the start date comparable from one launch to the next.
      env: { LC_ALL: 'C' },
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export const systemProcesses: ProcessTable = {
  command: (pid) => psField(pid, 'comm'),
  startedAt: (pid) => psField(pid, 'lstart'),
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

/**
 * Records each server of this app. The start date is read asynchronously, so a server that has
 * already exited, or been replaced, by then is not written.
 */
export interface ServerRecorder {
  write(serverPid: number): void;
  clear(): void;
}

export function createServerRecorder(
  file: PidFile,
  table: ProcessTable = systemProcesses,
  appPid: number = process.pid,
): ServerRecorder {
  let current: number | null = null;
  return {
    write(serverPid) {
      current = serverPid;
      void table.startedAt(serverPid).then((startedAt) => {
        if (startedAt && current === serverPid) file.write({ serverPid, appPid, startedAt });
      });
    },
    clear() {
      current = null;
      file.clear();
    },
  };
}

async function exitedWithin(pid: number, table: ProcessTable, ms: number): Promise<boolean> {
  for (let waited = 0; waited < ms; waited += POLL) {
    if (!table.alive(pid)) return true;
    await table.wait(POLL);
  }
  return !table.alive(pid);
}

/**
 * Ends a server left by a run that died without stopping it (a `kill -9`, a crash). Only when
 * that run is gone, and the PID still names a `whisper-server` started at the recorded date: a
 * reused PID is left alone.
 */
export async function reapOrphan(
  file: PidFile,
  table: ProcessTable = systemProcesses,
): Promise<boolean> {
  const record = file.read();
  if (!record) return false;
  if (record.appPid !== process.pid && table.alive(record.appPid)) return false;
  file.clear();
  const { serverPid } = record;
  if (serverPid === process.pid) return false;
  const [command, startedAt] = await Promise.all([
    table.command(serverPid),
    table.startedAt(serverPid),
  ]);
  if (!command || basename(command) !== COMMAND || startedAt !== record.startedAt) return false;
  table.kill(serverPid, 'SIGTERM');
  if (!(await exitedWithin(serverPid, table, TERM_GRACE))) table.kill(serverPid, 'SIGKILL');
  return true;
}
