import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveAvailability } from '../../shared/live';
import { WhisperServer, type ServerProcess } from './whisper-server';

type Exit = 'on-term' | 'on-kill' | 'never';

class FakeProcess extends EventEmitter implements ServerProcess {
  readonly signals: NodeJS.Signals[] = [];
  alive = true;

  constructor(
    readonly pid: number,
    readonly port: number,
    private readonly exit: Exit,
  ) {
    super();
  }

  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);
    const exits = this.exit === 'on-term' || (this.exit === 'on-kill' && signal === 'SIGKILL');
    if (exits) setTimeout(() => this.crash(), 10);
    return true;
  }

  crash(): void {
    this.alive = false;
    this.emit('exit');
  }
}

interface Options {
  healthy?: boolean;
  exit?: Exit;
  failSpawn?: boolean;
}

function setup({ healthy = true, exit = 'on-term', failSpawn = false }: Options = {}) {
  const processes: FakeProcess[] = [];
  const launches: string[][] = [];
  const availability: LiveAvailability[] = [];
  const pids = { write: vi.fn(), clear: vi.fn() };
  // What lsof sees on the port besides our child: other PIDs, or a failure to read.
  const port = { foreign: [] as number[], unreadable: false };
  let nextPort = 50_000;
  let token = 0;
  const server = new WhisperServer({
    spawn(_binary, args) {
      launches.push(args);
      const listening = Number(args[args.indexOf('--port') + 1]);
      const process = new FakeProcess(1_000 + processes.length, listening, exit);
      processes.push(process);
      if (failSpawn) setTimeout(() => process.emit('error', new Error('ENOENT')), 0);
      return process;
    },
    freePort: async () => (nextPort += 1),
    token: () => `token${(token += 1)}`,
    healthy: async () => healthy,
    listeners: async (listening) => {
      if (port.unreadable) return null;
      const ours = processes
        .filter((process) => process.alive && process.port === listening)
        .map((process) => process.pid);
      return [...ours, ...port.foreign];
    },
    pids,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    onAvailability: (next) => availability.push(next),
  });
  return { server, processes, launches, availability, pids, port };
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
        ...['--request-path', '/token1', '-l', 'auto', '-nlp'],
      ],
    ]);
    expect(launches[0]).not.toContain('--convert');
    expect(await server.verifiedBaseUrl()).toBe('http://127.0.0.1:50001/token1');
    expect(states(availability)).toEqual(['starting', 'ready']);
    expect(JSON.stringify(availability)).not.toContain('token1');
    expect(pids.write).toHaveBeenCalledWith(1_000);
  });

  it('gives the server up, with no restart, when another process listens before it is ready', async () => {
    const { server, processes, launches, availability, port } = setup();
    port.foreign = [666];

    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(10_000);

    expect(processes[0]!.signals).toEqual(['SIGKILL']);
    expect(launches).toHaveLength(1);
    expect(await server.verifiedBaseUrl()).toBeNull();
    expect(states(availability)).toEqual(['starting', 'port-conflict']);
  });

  it('notices within two seconds a listener that appears later', async () => {
    const { server, processes, availability, port } = setup();
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);

    port.foreign = [666];
    await vi.advanceTimersByTimeAsync(2_000);

    expect(processes[0]!.signals).toEqual(['SIGKILL']);
    expect(states(availability).at(-1)).toBe('port-conflict');
  });

  it('refuses the URL to a request once the port is shared', async () => {
    const { server, port } = setup();
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);

    port.foreign = [666];

    expect(await server.verifiedBaseUrl()).toBeNull();
  });

  it('gives the server up when the listeners cannot be read', async () => {
    const { server, availability, port } = setup();
    port.unreadable = true;

    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);

    expect(states(availability)).toEqual(['starting', 'port-conflict']);
  });

  it('ends the server with SIGTERM on stop and forgets its PID', async () => {
    const { server, processes, availability, pids } = setup();
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);

    const stopped = server.stop();
    await vi.advanceTimersByTimeAsync(10);
    await stopped;

    expect(processes[0]!.signals).toEqual(['SIGTERM']);
    expect(await server.verifiedBaseUrl()).toBeNull();
    expect(pids.clear).toHaveBeenCalled();
    expect(states(availability).at(-1)).toBe('off');
  });

  it('sends SIGKILL one second after an ignored SIGTERM', async () => {
    const { server, processes } = setup({ exit: 'on-kill' });
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);

    const stopped = server.stop();
    await vi.advanceTimersByTimeAsync(999);
    expect(processes[0]!.signals).toEqual(['SIGTERM']);
    await vi.advanceTimersByTimeAsync(20);
    await stopped;

    expect(processes[0]!.signals).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('never waits forever for a process that survives SIGKILL', async () => {
    const { server } = setup({ exit: 'never' });
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);
    let stopped = false;

    void server.stop().then(() => (stopped = true));
    await vi.advanceTimersByTimeAsync(2_000);

    expect(stopped).toBe(true);
  });

  it('kills the child at once on process exit', async () => {
    const { server, processes } = setup();
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);

    server.killNow();

    expect(processes[0]!.signals).toEqual(['SIGKILL']);
  });

  it('restarts twice after crashes, with a new port and token, then gives up', async () => {
    const { server, processes, launches, availability } = setup();
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);

    processes[0]!.crash();
    await vi.advanceTimersByTimeAsync(499);
    expect(launches).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    processes[1]!.crash();
    await vi.advanceTimersByTimeAsync(2_000);
    processes[2]!.crash();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(launches).toHaveLength(3);
    expect(launches[1]).toContain('/token2');
    expect(launches[1]).toContain('50002');
    expect(await server.verifiedBaseUrl()).toBeNull();
    expect(states(availability)).toEqual([
      ...['starting', 'ready', 'starting', 'starting', 'ready', 'starting', 'starting', 'ready'],
      'engine-failed',
    ]);
  });

  it('forgives the restarts after three minutes in ready', async () => {
    const { server, processes, launches } = setup();
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);
    processes[0]!.crash();
    await vi.advanceTimersByTimeAsync(500);
    processes[1]!.crash();
    await vi.advanceTimersByTimeAsync(2_000);

    await vi.advanceTimersByTimeAsync(182_000);
    processes[2]!.crash();
    await vi.advanceTimersByTimeAsync(500);

    expect(launches).toHaveLength(4);
  });

  it('kills a server that never answers on its path and counts it as a crash', async () => {
    const { server, processes, launches } = setup({ healthy: false });
    server.start('whisper-server', 'model.bin');

    await vi.advanceTimersByTimeAsync(89_000);
    expect(processes[0]!.signals).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(processes[0]!.signals).toEqual(['SIGKILL']);
    await vi.advanceTimersByTimeAsync(10 + 500);

    expect(launches).toHaveLength(2);
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
    processes[0]!.crash();

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
    const { server, processes, launches, pids } = setup({ exit: 'on-kill' });
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);

    const stopped = server.stop();
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(1_020);
    await stopped;

    expect(launches).toHaveLength(2);
    expect(processes[0]!.signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(pids.clear).not.toHaveBeenCalled();
    expect(await server.verifiedBaseUrl()).toBe('http://127.0.0.1:50002/token2');
  });
});
