import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPidFile,
  createServerRecorder,
  reapOrphan,
  type ProcessTable,
  type ServerRecord,
} from './whisper-server-pid';

let folder: string;
let path: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'sayback-pid-'));
  path = join(folder, 'live-engine.pid');
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

const STARTED = 'Thu Oct 15 12:00:00 2026';
const DEAD_APP = 999_991;
const SERVER = 4_242;
const record = (overrides: Partial<ServerRecord> = {}): ServerRecord => ({
  serverPid: SERVER,
  appPid: DEAD_APP,
  startedAt: STARTED,
  ...overrides,
});

interface TableOptions {
  command?: string | null;
  startedAt?: string | null;
  ignoresTerm?: boolean;
  appAlive?: boolean;
}

function table({
  command = '/opt/homebrew/Cellar/whisper.cpp/1.9.4/bin/whisper-server',
  startedAt = STARTED,
  ignoresTerm = false,
  appAlive = false,
}: TableOptions = {}) {
  let serverAlive = true;
  const kill = vi.fn((_pid: number, signal: NodeJS.Signals) => {
    if (signal === 'SIGKILL' || !ignoresTerm) serverAlive = false;
  });
  const processes: ProcessTable = {
    command: async () => command,
    startedAt: async () => startedAt,
    alive: (pid) => (pid === DEAD_APP ? appAlive : serverAlive),
    kill,
    wait: async () => undefined,
  };
  return { processes, kill };
}

describe('whisper server pid file', () => {
  it('keeps the record for the owner only and reads it back', () => {
    const pids = createPidFile(path);

    pids.write(record());

    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path, 'utf8')).toBe(`4242 999991 ${STARTED}\n`);
    expect(pids.read()).toEqual(record());
  });

  it('reads nothing from a missing, garbled or oversized file', () => {
    const pids = createPidFile(path);

    expect(pids.read()).toBeNull();
    writeFileSync(path, 'pas un nombre');
    expect(pids.read()).toBeNull();
    writeFileSync(path, '4242');
    expect(pids.read()).toBeNull();
    writeFileSync(path, `1 999991 ${STARTED}`);
    expect(pids.read()).toBeNull();
    writeFileSync(path, `4242 999991 ${'x'.repeat(200)}`);
    expect(pids.read()).toBeNull();
  });

  it('records a server with its start date, unless it is gone by then', async () => {
    const pids = createPidFile(path);
    const { processes } = table();
    const recorder = createServerRecorder(pids, processes, 777);

    recorder.write(SERVER);
    await Promise.resolve();
    expect(pids.read()).toEqual(record({ appPid: 777 }));

    recorder.write(5_000);
    recorder.clear();
    await Promise.resolve();
    expect(existsSync(path)).toBe(false);
  });
});

describe('orphan reaping', () => {
  it('ends a whisper-server left by a run that is gone', async () => {
    const pids = createPidFile(path);
    pids.write(record());
    const { processes, kill } = table();

    expect(await reapOrphan(pids, processes)).toBe(true);
    expect(kill.mock.calls).toEqual([[SERVER, 'SIGTERM']]);
    expect(existsSync(path)).toBe(false);
  });

  it('escalates to SIGKILL when SIGTERM is ignored', async () => {
    const pids = createPidFile(path);
    pids.write(record());
    const { processes, kill } = table({ ignoresTerm: true });

    await reapOrphan(pids, processes);

    expect(kill.mock.calls).toEqual([
      [SERVER, 'SIGTERM'],
      [SERVER, 'SIGKILL'],
    ]);
  });

  it('leaves the server and its record to an app that is still running', async () => {
    const pids = createPidFile(path);
    pids.write(record());
    const { processes, kill } = table({ appAlive: true });

    expect(await reapOrphan(pids, processes)).toBe(false);
    expect(kill).not.toHaveBeenCalled();
    expect(existsSync(path)).toBe(true);
  });

  it.each<[string, TableOptions]>([
    ['another program', { command: '/Applications/Safari.app/Contents/MacOS/Safari' }],
    ['a whisper-server started at another date', { startedAt: 'Thu Oct 15 13:00:00 2026' }],
    ['a process already gone', { command: null, startedAt: null }],
  ])('leaves alone a PID reused by %s', async (_name, options) => {
    const pids = createPidFile(path);
    pids.write(record());
    const { processes, kill } = table(options);

    expect(await reapOrphan(pids, processes)).toBe(false);
    expect(kill).not.toHaveBeenCalled();
    expect(existsSync(path)).toBe(false);
  });

  it('does nothing without a file', async () => {
    const { processes, kill } = table();

    expect(await reapOrphan(createPidFile(path), processes)).toBe(false);
    expect(kill).not.toHaveBeenCalled();
  });
});
