import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPidFile, reapOrphan, type ProcessTable } from './whisper-server-pid';

let folder: string;
let path: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'sayback-pid-'));
  path = join(folder, 'live-engine.pid');
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

/** One process that ignores SIGTERM when told to. */
function table(command: string | null, ignoresTerm = false) {
  let alive = true;
  const kill = vi.fn((_pid: number, signal: NodeJS.Signals) => {
    if (signal === 'SIGKILL' || !ignoresTerm) alive = false;
  });
  const processes: ProcessTable = {
    command: async () => command,
    alive: () => alive,
    kill,
    wait: async () => undefined,
  };
  return { processes, kill };
}

describe('whisper server pid file', () => {
  it('keeps the PID for the owner only and gives it back once', () => {
    const pids = createPidFile(path);

    pids.write(4242);

    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(pids.take()).toBe(4242);
    expect(existsSync(path)).toBe(false);
    expect(pids.take()).toBeNull();
  });

  it('reads nothing from a missing, garbled or oversized file', () => {
    const pids = createPidFile(path);

    expect(pids.take()).toBeNull();
    writeFileSync(path, 'pas un nombre');
    expect(pids.take()).toBeNull();
    writeFileSync(path, '1');
    expect(pids.take()).toBeNull();
    writeFileSync(path, '4'.repeat(64));
    expect(pids.take()).toBeNull();
  });

  it('is cleared after a normal stop', () => {
    const pids = createPidFile(path);
    pids.write(4242);

    pids.clear();

    expect(existsSync(path)).toBe(false);
  });
});

describe('orphan reaping', () => {
  it('ends a whisper-server left by a previous run', async () => {
    const pids = createPidFile(path);
    pids.write(4242);
    const { processes, kill } = table('/opt/homebrew/Cellar/whisper.cpp/1.9.4/bin/whisper-server');

    expect(await reapOrphan(pids, processes)).toBe(true);
    expect(kill.mock.calls).toEqual([[4242, 'SIGTERM']]);
  });

  it('escalates to SIGKILL when SIGTERM is ignored', async () => {
    const pids = createPidFile(path);
    pids.write(4242);
    const { processes, kill } = table('/opt/homebrew/bin/whisper-server', true);

    await reapOrphan(pids, processes);

    expect(kill.mock.calls).toEqual([
      [4242, 'SIGTERM'],
      [4242, 'SIGKILL'],
    ]);
  });

  it('leaves alone a PID reused by another program, or a process already gone', async () => {
    const reused = createPidFile(path);
    reused.write(4242);
    const other = table('/Applications/Safari.app/Contents/MacOS/Safari');
    const gone = table(null);

    expect(await reapOrphan(reused, other.processes)).toBe(false);
    reused.write(4243);
    expect(await reapOrphan(reused, gone.processes)).toBe(false);
    expect(other.kill).not.toHaveBeenCalled();
    expect(gone.kill).not.toHaveBeenCalled();
    expect(existsSync(path)).toBe(false);
  });

  it('does nothing without a file', async () => {
    const { processes, kill } = table('/opt/homebrew/bin/whisper-server');

    expect(await reapOrphan(createPidFile(path), processes)).toBe(false);
    expect(kill).not.toHaveBeenCalled();
  });
});
