import { BUILD_COMMIT_UNKNOWN } from '../../shared/update-channel';
import type { UpdateInfo } from '../domain/update';
import type { UpdatePorts } from './update-ports';
import {
  UPDATE_MESSAGES,
  channelSnapshot,
  closedSnapshot,
  type Placement,
  type Snapshot,
} from './update-status';

interface Identity {
  current: UpdateInfo;
  /** Why the channel is closed, or `null` when it is open. */
  closed: string | null;
}

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * What the app knows of the channel. Reads follow each other, never two at once; a read nobody
 * waits for is skipped while one is pending; concurrent checks share one read. A failed read is
 * never remembered: the next call reads again.
 */
export class UpdateState {
  private identity: Promise<Identity> | null = null;
  private latest: Snapshot | null = null;
  private first: Promise<Snapshot> | null = null;
  private checking: Promise<Snapshot> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private backgroundPending = false;
  private reads = 0;

  constructor(
    private readonly ports: UpdatePorts,
    /** Called when the state changed after a read (not after the first one). */
    private readonly changed: (snapshot: Snapshot) => void,
  ) {}

  get snapshot(): Snapshot | null {
    return this.latest;
  }

  readCount(): number {
    return this.reads;
  }

  /** Whether the channel is closed in this build, and why. */
  async closedReason(): Promise<string | null> {
    return (await this.loadIdentity()).closed;
  }

  /** The first read, done once it succeeds. */
  ready(): Promise<Snapshot> {
    if (this.first === null) {
      const first = this.refresh(false);
      this.first = first;
      first.catch(() => {
        if (this.first === first) this.first = null;
      });
    }
    return this.first;
  }

  /** A read now; callers arriving while it runs share it. */
  check(): Promise<Snapshot> {
    if (this.checking === null) {
      const run = this.refresh(false).finally(() => {
        if (this.checking === run) this.checking = null;
      });
      this.checking = run;
    }
    return this.checking;
  }

  /** A read nobody waits for (focus, timer): one pending at most, errors only logged. */
  refreshInBackground(): void {
    if (this.backgroundPending) return;
    this.backgroundPending = true;
    this.refresh(false)
      .catch((error: unknown) => this.ports.log(`relecture du canal : ${errorText(error)}`))
      .finally(() => {
        this.backgroundPending = false;
      });
  }

  /** One read, in turn; the kept state is replaced and announced if it changed. */
  refresh(fresh: boolean): Promise<Snapshot> {
    const run = this.chain.then(async () => {
      const next = await this.compute(fresh);
      const previous = this.latest;
      this.latest = next;
      const differs = JSON.stringify(previous?.status) !== JSON.stringify(next.status);
      if (previous !== null && differs) this.changed(next);
      return next;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Waits for the read in progress, if any. */
  async settled(): Promise<void> {
    await this.chain;
  }

  private loadIdentity(): Promise<Identity> {
    this.identity ??= this.readIdentity();
    return this.identity;
  }

  private async readIdentity(): Promise<Identity> {
    const info = await this.ports.loadBuildInfo();
    if (info === null) {
      const current = {
        version: this.ports.appVersion,
        commit: BUILD_COMMIT_UNKNOWN,
        builtAt: new Date(0).toISOString(),
      };
      return { current, closed: UPDATE_MESSAGES.noIdentity };
    }
    const current = { version: info.version, commit: info.commit, builtAt: info.builtAt };
    if (!info.localUpdateChannel) return { current, closed: UPDATE_MESSAGES.disabled };
    // A downloaded copy never trusts a folder anyone running as the user can write.
    if (this.ports.isPackaged && (await this.ports.isQuarantined())) {
      return { current, closed: UPDATE_MESSAGES.quarantined };
    }
    return { current, closed: null };
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
}
