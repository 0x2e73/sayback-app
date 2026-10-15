import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setup, states } from './whisper-server-fake';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('whisper server port check', () => {
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

  it('gives the server up once when two checks find the port shared at the same time', async () => {
    const { server, processes, availability, port } = setup({ exit: 'never' });
    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);

    port.foreign = [666];
    await Promise.all([server.verifiedBaseUrl(), server.verifiedBaseUrl()]);

    expect(processes[0]!.signals).toEqual(['SIGKILL']);
    expect(states(availability).filter((state) => state === 'port-conflict')).toHaveLength(1);
  });

  it('gives the server up when the listeners cannot be read', async () => {
    const { server, availability, port } = setup();
    port.unreadable = true;

    server.start('whisper-server', 'model.bin');
    await vi.advanceTimersByTimeAsync(0);

    expect(states(availability)).toEqual(['starting', 'port-conflict']);
  });
});
