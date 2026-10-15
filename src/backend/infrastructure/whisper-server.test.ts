import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setup, states } from './whisper-server-fake';

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
