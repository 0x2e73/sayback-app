import type { BuildInfo, UpdateManifest } from '../../shared/update-channel';
import type { BuildIdentity, UpdateInfo, UpdateStatus } from '../domain/update';

export type ChannelReading =
  /** No manifest, or one that offers nothing newer. */
  | { kind: 'none' }
  /** The manifest or the staged bundle is refused; `reason` is for the interface, without paths. */
  | { kind: 'invalid'; reason: string }
  | { kind: 'available'; manifest: UpdateManifest };

export interface ChannelReadOptions {
  /** Recompute the bundle hash even if its file did not move (right before installing). */
  fresh?: boolean;
}

export interface ChannelReader {
  read(current: BuildIdentity, options?: ChannelReadOptions): Promise<ChannelReading>;
}

export interface InstallTarget {
  /** Real path (links followed) of the running bundle. */
  bundlePath: string;
  /** Where the replaced version is kept, next to it. */
  previousPath: string;
}

export type TargetVerdict = { ok: true; target: InstallTarget } | { ok: false; reason: string };

export interface UpdatePorts {
  /** `app.getVersion()`, used when the build identity is unreadable. */
  appVersion: string;
  isPackaged: boolean;
  /** The build identity, or `null` if absent or invalid. */
  loadBuildInfo(): Promise<BuildInfo | null>;
  /** Does the running bundle carry `com.apple.quarantine` (downloaded, not built here)? */
  isQuarantined(): Promise<boolean>;
  channel: ChannelReader;
  /** Can the running app be replaced where it is? */
  locateTarget(): Promise<TargetVerdict>;
  isRecording(): boolean;
  /** Asks the user, from the main process, whether to install now. */
  confirmInstall(update: UpdateInfo): Promise<boolean>;
  /** Launches the install script detached and returns its pid; it waits for the app to exit. */
  launchInstall(manifest: UpdateManifest, target: InstallTarget): Promise<number>;
  /** Stops a launched script that is still waiting. Never throws. */
  cancelInstall(pid: number): void;
  quit(): void;
  /** Announces a new state to the interface. */
  publish(status: UpdateStatus): void;
  /** Never throws. */
  log(message: string): void;
}
