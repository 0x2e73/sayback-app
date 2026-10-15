import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveAvailability } from '../../shared/live';
import { WhisperServer, type ServerProcess } from './whisper-server';

class FakeProcess extends EventEmitter implements ServerProcess {
  readonly signals: NodeJS.Signals[] = [];

  constructor(
    readonly pid: number,
    private readonly ignoresTerm = false,
  ) {
    super();
  }

  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);
    if (signal === 'SIGKILL' || !this.ignoresTerm) setTimeout(() => this.emit('exit'), 10);
    return true;
  }
}

interface Options {
  healthy?: boolean;
  ignoresTerm?: boolean;
  failSpawn?: boolean;
}

function setup({ healthy = true, ignoresTerm = false, failSpawn = false }: Options = {}) {
  const processes: FakeProcess[] = [];
  const launches: string[][] = [];
  const availability: LiveAvailability[] = [];
  const pids = { write: vi.fn(), clear: vi.fn() };
  let port = 50_000;
  let token = 0;
  const server = new WhisperServer({
    spawn(_binary, args) {
      launches.push(args);
      const process = new FakeProcess(1_000 + processes.length, ignoresTerm);
      processes.push(process);
      if (failSpawn) setTimeout(() => process.emit('error', new Error('ENOENT')), 0);
      return process;
    },
    freePort: async () => (port += 1),
    token: () => `token${(token += 1)}`,
    healthy: async () => healthy,
    pids,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    onAvailability: (next) => availability.push(next),
  });
  return { server, processes, launches, availability, pids };
}

const states = (availability: LiveAvailability[]) =>
  availability.map((item) => (item.state === 'unavailable' ? item.reason : item.state));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('whisper server supervisor', () => {
  it('starts one server on the loopback with a free port, a secret path and auto language', async () => {
    const { server, launches, availability, pids } = setup();

    server.start('/opt/homebrew/bin/whisper-server', '/models/ggml-base.bin');
    server.start('/opt/homebrew/bin/whisper-server', '/models/ggml-base.bin');
    await vi.advanceTimersByTimeAsync(0);

    expect(launches).toEqual([
      [
        ...['-m', '/models/ggml-base.bin', '--host', '127.0.0.1', '--port', '50001'],
        ...['--request-path', '/token1', '-l', 'auto'],
      ],
    ]);
    expect(server.baseUrl()).toBe('http://127.0.0.1:50001/token1');
    expect(states(availability)).toEqual(['starting', 'ready']);
    expect(JSON.stringify(availability)).not.toContain('token1');
    expect(pids.write).toHaveBeenCalledWith(1_000);
  });

  it('ends the server with SIGTERM on stop and forgets its PID', async () => {
    const { server, processes, availability, pids } = setup();
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);

    const stopped = server.stop();
    await vi.advanceTimersByTimeAsync(10);
    await stopped;

    expect(processes[0]!.signals).toEqual(['SIGTERM']);
    expect(server.baseUrl()).toBeNull();
    expect(pids.clear).toHaveBeenCalled();
    expect(states(availability).at(-1)).toBe('off');
  });

  it('sends SIGKILL one second after an ignored SIGTERM', async () => {
    const { server, processes } = setup({ ignoresTerm: true });
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);

    const stopped = server.stop();
    await vi.advanceTimersByTimeAsync(999);
    expect(processes[0]!.signals).toEqual(['SIGTERM']);
    await vi.advanceTimersByTimeAsync(20);
    await stopped;

    expect(processes[0]!.signals).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('restarts twice after crashes, with a new port and token, then gives up', async () => {
    const { server, processes, launches, availability } = setup();
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);

    processes[0]!.emit('exit');
    await vi.advanceTimersByTimeAsync(499);
    expect(launches).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    processes[1]!.emit('exit');
    await vi.advanceTimersByTimeAsync(2_000);
    processes[2]!.emit('exit');
    await vi.advanceTimersByTimeAsync(10_000);

    expect(launches).toHaveLength(3);
    expect(launches[1]).toContain('/token2');
    expect(launches[1]).toContain('50002');
    expect(server.baseUrl()).toBeNull();
    expect(states(availability)).toEqual([
      ...['starting', 'ready', 'starting', 'starting', 'ready', 'starting', 'starting', 'ready'],
      'engine-failed',
    ]);
  });

  it('kills a server that never answers on its path and counts it as a crash', async () => {
    const { server, processes, launches } = setup({ healthy: false });
    server.start('whisper-server', 'model.bin');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(processes[0]!.signals).toEqual(['SIGKILL']);
    await vi.advanceTimersByTimeAsync(10 + 500);

    expect(launches).toHaveLength(2);
    expect(server.baseUrl()).toBeNull();
  });

  it('reports the engine failed when the binary cannot be run', async () => {
    const { server, availability } = setup({ failSpawn: true });
    server.start('/missing/whisper-server', 'model.bin');

    await vi.advanceTimersByTimeAsync(10_000);

    expect(states(availability).at(-1)).toBe('engine-failed');
  });

  it('does not restart once stopped during the backoff', async () => {
    const { server, processes, launches } = setup();
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);
    processes[0]!.emit('exit');

    await server.stop();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(launches).toHaveLength(1);
  });

  it('starts nothing when stopped before the port is known', async () => {
    const { server, launches } = setup();

    server.start('whisper-server', 'model.bin');
    await server.stop();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(launches).toEqual([]);
  });

  it('starts a new server during the stop of the previous one without losing its PID', async () => {
    const { server, processes, launches, pids } = setup({ ignoresTerm: true });
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);

    const stopped = server.stop();
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(1_020);
    await stopped;

    expect(launches).toHaveLength(2);
    expect(processes[0]!.signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(pids.clear).not.toHaveBeenCalled();
    expect(server.baseUrl()).toBe('http://127.0.0.1:50002/token2');
  });
});
