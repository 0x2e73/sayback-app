import { BUILD_COMMIT_UNKNOWN, type UpdateManifest } from '../../shared/update-channel';
import type { UpdateInfo, UpdateStatus } from '../domain/update';
import type { InstallTarget, UpdatePorts } from './update-ports';
import {
  UPDATE_MESSAGES,
  UpdateRefusal,
  channelSnapshot,
  closedSnapshot,
  installable,
  type Placement,
  type Snapshot,
} from './update-status';

/** Periodic re-read of the channel; it is also re-read at startup and when a window gets focus. */
export const UPDATE_POLL_MS = 5 * 60_000;

interface Identity {
  current: UpdateInfo;
  /** Why the channel is closed, or `null` when it is open. */
  closed: string | null;
}

interface UpdateServiceOptions {
  pollMs?: number;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Updates from the local channel. Reads follow each other, never two at once; every change of
 * state is published. Installing never interrupts a recording: it is refused instead.
 */
export class UpdateService {
  private identity: Promise<Identity> | null = null;
  private snapshot: Snapshot | null = null;
  private first: Promise<Snapshot> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private backgroundPending = false;
  private reads = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private installing = false;
  /** True once the script is launched: the app is quitting, nothing starts again. */
  private launched = false;

  constructor(
    private readonly ports: UpdatePorts,
    private readonly options: UpdateServiceOptions = {},
  ) {}

  async start(): Promise<void> {
    const { closed } = await this.loadIdentity();
    this.ready().catch((error: unknown) =>
      this.ports.log(`lecture initiale : ${errorText(error)}`),
    );
    if (closed !== null || this.stopped) return;
    this.timer = setInterval(
      () => this.refreshInBackground(),
      this.options.pollMs ?? UPDATE_POLL_MS,
    );
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.chain.catch(() => undefined);
  }

  /** The last known state; the first call waits for the startup read. */
  async status(): Promise<UpdateStatus> {
    return this.guarded(async () => {
      const snapshot = this.snapshot ?? (await this.ready());
      return structuredClone(snapshot.status);
    });
  }

  /** Re-reads the channel now and returns the resulting state. */
  async check(): Promise<UpdateStatus> {
    return this.guarded(async () => {
      await this.ready();
      return structuredClone((await this.refresh(false)).status);
    });
  }

  /** A window got focus: the channel is re-read without waiting. Never throws. */
  windowFocused(): void {
    this.refreshInBackground();
  }

  readCount(): number {
    return this.reads;
  }

  /** Replaces the app with the staged version and relaunches it; the app quits right after. */
  async install(): Promise<void> {
    if (this.installing || this.launched)
      throw new UpdateRefusal(UPDATE_MESSAGES.alreadyInstalling);
    this.installing = true;
    try {
      this.refuseWhileRecording();
      await this.guarded(() => this.ready());
      // Full check, hash recomputed: the bundle may have changed since it was offered.
      const { manifest, target } = installable(await this.guarded(() => this.refresh(true)));
      // A recording may have started during the check.
      this.refuseWhileRecording();
      await this.launch(manifest, target);
      this.launched = true;
      // After answering the interface: the app quits through its ordinary path.
      setImmediate(() => this.ports.quit());
    } finally {
      this.installing = false;
    }
  }

  private refuseWhileRecording(): void {
    if (this.ports.isRecording()) throw new UpdateRefusal(UPDATE_MESSAGES.recording);
  }

  private async launch(manifest: UpdateManifest, target: InstallTarget): Promise<void> {
    try {
      await this.ports.launchInstall(manifest, target);
    } catch (error) {
      this.ports.log(`installation non lancée : ${errorText(error)}`);
      throw new UpdateRefusal(UPDATE_MESSAGES.launchFailed);
    }
  }

  /** Only refusals reach the interface; anything else is logged and replaced by a plain sentence. */
  private async guarded<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof UpdateRefusal) throw error;
      this.ports.log(`lecture du canal : ${errorText(error)}`);
      throw new UpdateRefusal(UPDATE_MESSAGES.readFailed);
    }
  }

  private ready(): Promise<Snapshot> {
    this.first ??= this.refresh(false);
    return this.first;
  }

  private loadIdentity(): Promise<Identity> {
    this.identity ??= this.ports.loadBuildInfo().then((info): Identity => {
      if (info === null) {
        const current = {
          version: this.ports.appVersion,
          commit: BUILD_COMMIT_UNKNOWN,
          builtAt: new Date(0).toISOString(),
        };
        return { current, closed: UPDATE_MESSAGES.noIdentity };
      }
      const current = { version: info.version, commit: info.commit, builtAt: info.builtAt };
      return { current, closed: info.localUpdateChannel ? null : UPDATE_MESSAGES.disabled };
    });
    return this.identity;
  }

  /** Reads the channel and the app location. Nothing is read when the channel is closed. */
  private async compute(fresh: boolean): Promise<Snapshot> {
    const { current, closed } = await this.loadIdentity();
    if (closed !== null) return closedSnapshot(current, closed);
    this.reads += 1;
    const reading = await this.ports.channel.read(current, { fresh });
    const placement: Placement = this.ports.isPackaged
      ? { packaged: true, verdict: await this.ports.locateTarget() }
      : { packaged: false };
    return channelSnapshot(current, reading, placement);
  }

  /** One read, in turn; the kept state is replaced, and published if it changed. */
  private refresh(fresh: boolean): Promise<Snapshot> {
    const run = this.chain.then(async () => {
      const next = await this.compute(fresh);
      const previous = this.snapshot;
      this.snapshot = next;
      const changed =
        previous !== null && JSON.stringify(previous.status) !== JSON.stringify(next.status);
      if (changed && !this.stopped) this.ports.publish(structuredClone(next.status));
      return next;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** A read nobody waits for (focus, timer): one pending at most, errors only logged. */
  private refreshInBackground(): void {
    if (this.stopped || this.launched || this.backgroundPending) return;
    this.backgroundPending = true;
    this.refresh(false)
      .catch((error: unknown) => this.ports.log(`relecture du canal : ${errorText(error)}`))
      .finally(() => {
        this.backgroundPending = false;
      });
  }
}
