import type { UpdateManifest } from '../../shared/update-channel';
import type { UpdateInstallOutcome, UpdateStatus } from '../domain/update';
import type { InstallTarget, UpdatePorts } from './update-ports';
import { UpdateState, errorText } from './update-state';
import {
  UPDATE_MESSAGES,
  UpdateRefusal,
  infoOf,
  installable,
  type Snapshot,
} from './update-status';

/** Periodic re-read of the channel; it is also re-read at startup and when a window gets focus. */
export const UPDATE_POLL_MS = 5 * 60_000;

interface UpdateServiceOptions {
  pollMs?: number;
}

const sameBuild = (a: UpdateManifest, b: UpdateManifest) =>
  a.sha256 === b.sha256 && a.commit === b.commit;

/**
 * Updates from the local channel. Installing asks the user from the main process, never
 * interrupts a recording, and only quits once the script is launched.
 */
export class UpdateService {
  private readonly state: UpdateState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private installing = false;
  /** Pid of the launched script: the app is quitting. */
  private launchedPid: number | null = null;

  constructor(
    private readonly ports: UpdatePorts,
    private readonly options: UpdateServiceOptions = {},
  ) {
    this.state = new UpdateState(ports, (snapshot) => this.announce(snapshot));
  }

  async start(): Promise<void> {
    const closed = await this.state.closedReason();
    this.state.ready().catch((error: unknown) => {
      this.ports.log(`lecture initiale : ${errorText(error)}`);
    });
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
    await this.state.settled();
  }

  /** The last known state; the first call waits for the startup read. */
  async status(): Promise<UpdateStatus> {
    return this.guarded(async () =>
      this.visible(this.state.snapshot ?? (await this.state.ready())),
    );
  }

  /** Re-reads the channel now and returns the resulting state. */
  async check(): Promise<UpdateStatus> {
    return this.guarded(async () => {
      await this.state.ready();
      return this.visible(await this.state.check());
    });
  }

  /** A window got focus: the channel is re-read without waiting. Never throws. */
  windowFocused(): void {
    this.refreshInBackground();
  }

  readCount(): number {
    return this.state.readCount();
  }

  /** Asks, then replaces the app with the staged version; the app quits right after. */
  async install(): Promise<UpdateInstallOutcome> {
    if (this.installing || this.launchedPid !== null) {
      throw new UpdateRefusal(UPDATE_MESSAGES.alreadyInstalling);
    }
    this.installing = true;
    try {
      return await this.consentAndLaunch();
    } finally {
      this.installing = false;
    }
  }

  private async consentAndLaunch(): Promise<UpdateInstallOutcome> {
    this.refuseWhileRecording();
    await this.guarded(() => this.state.ready());
    // Full check, hash recomputed: the bundle may have changed since it was offered.
    const offered = await this.installableNow();
    if (!(await this.ports.confirmInstall(infoOf(offered.manifest)))) return 'postponed';
    // The question may have stayed open: everything is checked again.
    const { manifest, target } = await this.installableNow();
    if (!sameBuild(manifest, offered.manifest)) {
      throw new UpdateRefusal(UPDATE_MESSAGES.changedMeanwhile);
    }
    this.launchedPid = await this.launch(manifest, target);
    this.announceCurrent();
    // After answering the interface: the app quits through its ordinary path.
    setImmediate(() => this.finishInstall());
    return 'started';
  }

  private async installableNow(): Promise<{ manifest: UpdateManifest; target: InstallTarget }> {
    const ready = installable(await this.guarded(() => this.state.refresh(true)));
    this.refuseWhileRecording();
    return ready;
  }

  /** Last check before quitting: a recording started since the click wins over the update. */
  private finishInstall(): void {
    const pid = this.launchedPid;
    if (pid === null) return;
    try {
      if (this.ports.isRecording()) {
        this.abortInstall(pid, 'un enregistrement a démarré avant la sortie');
        return;
      }
      this.ports.quit();
    } catch (error) {
      this.abortInstall(pid, `sortie de l’app impossible : ${errorText(error)}`);
    }
  }

  private abortInstall(pid: number, why: string): void {
    this.ports.cancelInstall(pid);
    this.launchedPid = null;
    this.ports.log(`installation annulée : ${why}`);
    this.announceCurrent();
  }

  private refuseWhileRecording(): void {
    if (this.ports.isRecording()) throw new UpdateRefusal(UPDATE_MESSAGES.recording);
  }

  private async launch(manifest: UpdateManifest, target: InstallTarget): Promise<number> {
    try {
      return await this.ports.launchInstall(manifest, target);
    } catch (error) {
      this.ports.log(`installation non lancée : ${errorText(error)}`);
      throw new UpdateRefusal(UPDATE_MESSAGES.launchFailed);
    }
  }

  /** While the script is launched, the button must not be offered again. */
  private visible(snapshot: Snapshot): UpdateStatus {
    const status = structuredClone(snapshot.status);
    if (this.launchedPid === null) return status;
    return { ...status, canInstall: false, reason: UPDATE_MESSAGES.installing };
  }

  private announce(snapshot: Snapshot): void {
    if (!this.stopped) this.ports.publish(this.visible(snapshot));
  }

  private announceCurrent(): void {
    const { snapshot } = this.state;
    if (snapshot !== null) this.announce(snapshot);
  }

  private refreshInBackground(): void {
    if (this.stopped || this.launchedPid !== null) return;
    this.state.refreshInBackground();
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
}
