import type { LiveAvailability } from '../../shared/live';
import type { ServerRecorder } from './whisper-server-pid';

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
  /** PIDs listening on the TCP port, or null when they cannot be read. */
  listeners(port: number): Promise<number[] | null>;
  pids: ServerRecorder;
  wait(ms: number): Promise<void>;
  now(): number;
  onAvailability(availability: LiveAvailability): void;
}

// Two restarts, counted again after three quiet minutes, then the live is unavailable.
export const RESTART_BACKOFF = [500, 2_000] as const;
export const RESTARTS_FORGIVEN_AFTER = 180_000;
// The large models take long to load on a busy machine.
export const STARTUP_TIMEOUT = 90_000;
export const TERM_GRACE = 1_000;
export const PORT_CHECK_EVERY = 2_000;
const HEALTH_POLL = 200;

interface Launch {
  binary: string;
  model: string;
}

interface Running {
  process: ServerProcess;
  port: number;
  exited: Promise<void>;
  gone: boolean;
  /** Given up for a shared port: the checks still running must not give it up again. */
  abandoned: boolean;
}

function watch(process: ServerProcess, port: number, onExit: (running: Running) => void): Running {
  const running: Running = {
    process,
    port,
    gone: false,
    abandoned: false,
    exited: Promise.resolve(),
  };
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

// `--convert` is never passed: it would make the server write the audio to disk with ffmpeg.
function serverArguments({ model }: Launch, port: number, token: string): string[] {
  return [
    ...['-m', model, '--host', '127.0.0.1', '--port', String(port)],
    ...['--request-path', `/${token}`, '-l', 'auto', '-nlp'],
  ];
}

/**
 * One warm `whisper-server` for the recording: loopback only, a free port and a secret request
 * path, restarted after a crash, ended by SIGTERM then SIGKILL. The token does not stop another
 * process of the user from listening on the same port, so the port must be held by our child
 * alone: checked before `ready`, every two seconds and before every request.
 */
export class WhisperServer {
  private launchWith: Launch | null = null;
  private running: Running | null = null;
  private base: string | null = null;
  private session = 0;
  private restarts = 0;

  constructor(private readonly dependencies: WhisperServerDependencies) {}

  /** The secret base URL once the port is confirmed ours again, else null. */
  async verifiedBaseUrl(): Promise<string | null> {
    const base = this.base;
    const running = this.running;
    if (!base || !running) return null;
    const ours = await this.holdsPort(running);
    return ours && this.base === base ? base : null;
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
    if (await this.exitsWithin(running)) return;
    running.process.kill('SIGKILL');
    // A process that survives SIGKILL is out of reach: the quit goes on regardless.
    await this.exitsWithin(running);
  }

  /** At process exit, when nothing asynchronous can run any more. */
  killNow(): void {
    this.running?.process.kill('SIGKILL');
  }

  private exitsWithin(running: Running): Promise<boolean> {
    return Promise.race([
      running.exited.then(() => true),
      this.dependencies.wait(TERM_GRACE).then(() => false),
    ]);
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
      running = watch(process, port, (gone) => this.exited(session, gone));
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
    if (!(await this.holdsPort(running)) || session !== this.session) return;
    this.base = base;
    dependencies.onAvailability({ state: 'ready' });
    void this.monitor(session, running);
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

  private async monitor(session: number, running: Running): Promise<void> {
    const readyAt = this.dependencies.now();
    const current = () => session === this.session && this.running === running && !running.gone;
    while (current()) {
      await this.dependencies.wait(PORT_CHECK_EVERY);
      if (!current() || !(await this.holdsPort(running))) return;
      if (this.dependencies.now() - readyAt >= RESTARTS_FORGIVEN_AFTER) this.restarts = 0;
    }
  }

  /** True when our child alone listens on its port; otherwise the server is given up. */
  private async holdsPort(running: Running): Promise<boolean> {
    const listeners = await this.dependencies.listeners(running.port);
    if (running.gone || running.abandoned || this.running !== running) return false;
    // Nothing listening: the server is dying, and its exit is handled as a crash.
    if (listeners?.length === 0) return false;
    if (listeners?.length === 1 && listeners[0] === running.process.pid) return true;
    this.abandon(running);
    return false;
  }

  // Someone else may receive the audio and the token: no restart on any port for this recording.
  private abandon(running: Running): void {
    running.abandoned = true;
    this.session += 1;
    this.base = null;
    running.process.kill('SIGKILL');
    this.dependencies.onAvailability({ state: 'unavailable', reason: 'port-conflict' });
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
