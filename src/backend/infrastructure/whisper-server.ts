import type { LiveAvailability } from '../../shared/live';
import type { PidFile } from './whisper-server-pid';

export interface ServerProcess {
  readonly pid?: number;
  kill(signal: NodeJS.Signals): boolean;
  once(event: 'exit' | 'error', listener: () => void): unknown;
}

export interface WhisperServerDependencies {
  /** Never logs its arguments: they hold the token. */
  spawn(binary: string, args: string[]): ServerProcess;
  freePort(): Promise<number>;
  token(): string;
  healthy(baseUrl: string, signal: AbortSignal): Promise<boolean>;
  pids: Pick<PidFile, 'write' | 'clear'>;
  wait(ms: number): Promise<void>;
  now(): number;
  onAvailability(availability: LiveAvailability): void;
}

// Two restarts per session, then the live is unavailable until the next recording.
export const RESTART_BACKOFF = [500, 2_000] as const;
export const STARTUP_TIMEOUT = 30_000;
export const TERM_GRACE = 1_000;
const HEALTH_POLL = 200;

interface Launch {
  binary: string;
  model: string;
}

interface Running {
  process: ServerProcess;
  exited: Promise<void>;
  gone: boolean;
}

function watch(process: ServerProcess, onExit: (running: Running) => void): Running {
  const running: Running = { process, gone: false, exited: Promise.resolve() };
  running.exited = new Promise((resolve) => {
    const settle = () => {
      if (running.gone) return;
      running.gone = true;
      resolve();
      onExit(running);
    };
    process.once('exit', settle);
    process.once('error', settle);
  });
  return running;
}

function serverArguments({ model }: Launch, port: number, token: string): string[] {
  return [
    ...['-m', model, '--host', '127.0.0.1', '--port', String(port)],
    ...['--request-path', `/${token}`, '-l', 'auto'],
  ];
}

/**
 * One warm `whisper-server` for the recording: loopback only, a free port and a secret request
 * path, restarted after a crash, ended by SIGTERM then SIGKILL.
 */
export class WhisperServer {
  private launchWith: Launch | null = null;
  private running: Running | null = null;
  private base: string | null = null;
  private session = 0;
  private restarts = 0;

  constructor(private readonly dependencies: WhisperServerDependencies) {}

  /** The secret base URL while the server answers, else null. */
  baseUrl(): string | null {
    return this.base;
  }

  start(binary: string, model: string): void {
    if (this.launchWith) return;
    this.launchWith = { binary, model };
    this.session += 1;
    this.restarts = 0;
    void this.launch(this.session);
  }

  async stop(): Promise<void> {
    this.launchWith = null;
    this.session += 1;
    this.base = null;
    this.dependencies.onAvailability({ state: 'off' });
    const running = this.running;
    if (!running) return;
    running.process.kill('SIGTERM');
    const exited = await Promise.race([
      running.exited.then(() => true),
      this.dependencies.wait(TERM_GRACE).then(() => false),
    ]);
    if (!exited) running.process.kill('SIGKILL');
    await running.exited;
  }

  private async launch(session: number): Promise<void> {
    const { dependencies, launchWith } = this;
    if (!launchWith) return;
    dependencies.onAvailability({ state: 'starting' });
    let running: Running;
    let base: string;
    try {
      const port = await dependencies.freePort();
      if (session !== this.session) return;
      const token = dependencies.token();
      const process = dependencies.spawn(
        launchWith.binary,
        serverArguments(launchWith, port, token),
      );
      running = watch(process, (gone) => this.exited(session, gone));
      base = `http://127.0.0.1:${port}/${token}`;
    } catch {
      return this.crashed(session);
    }
    this.running = running;
    if (running.process.pid) dependencies.pids.write(running.process.pid);
    const ready = await this.awaitHealthy(session, running, base);
    if (session !== this.session || running.gone) return;
    // Loaded too slowly or answering foreign: counted as a crash once it is gone.
    if (!ready) {
      running.process.kill('SIGKILL');
      return;
    }
    this.base = base;
    dependencies.onAvailability({ state: 'ready' });
  }

  private async awaitHealthy(session: number, running: Running, base: string): Promise<boolean> {
    const { dependencies } = this;
    const deadline = dependencies.now() + STARTUP_TIMEOUT;
    while (session === this.session && !running.gone && dependencies.now() < deadline) {
      if (await dependencies.healthy(base, AbortSignal.timeout(HEALTH_POLL * 5))) return true;
      await dependencies.wait(HEALTH_POLL);
    }
    return false;
  }

  private exited(session: number, running: Running): void {
    // A server replaced by the one of a newer recording leaves the PID file to it.
    if (this.running !== running) return;
    this.running = null;
    this.base = null;
    this.dependencies.pids.clear();
    if (session === this.session) this.crashed(session);
  }

  private crashed(session: number): void {
    if (session !== this.session) return;
    const delay = RESTART_BACKOFF[this.restarts];
    if (delay === undefined) {
      this.dependencies.onAvailability({ state: 'unavailable', reason: 'engine-failed' });
      return;
    }
    this.restarts += 1;
    this.dependencies.onAvailability({ state: 'starting' });
    void this.dependencies.wait(delay).then(() => {
      if (session === this.session && !this.running) void this.launch(session);
    });
  }
}
