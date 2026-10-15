// A fake whisper-server and lsof for the supervisor tests; never imported by the app.
import { EventEmitter } from 'node:events';
import { vi } from 'vitest';
import type { LiveAvailability } from '../../shared/live';
import { WhisperServer, type ServerProcess } from './whisper-server';

export type Exit = 'on-term' | 'on-kill' | 'never';

export class FakeProcess extends EventEmitter implements ServerProcess {
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

export interface Options {
  healthy?: boolean;
  exit?: Exit;
  failSpawn?: boolean;
}

export function setup({ healthy = true, exit = 'on-term', failSpawn = false }: Options = {}) {
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

export const states = (availability: LiveAvailability[]) =>
  availability.map((item) => (item.state === 'unavailable' ? item.reason : item.state));
