import type { BuildInfo, UpdateManifest } from '../../shared/update-channel';
import type { BuildIdentity, UpdateStatus } from '../domain/update';

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
  channel: ChannelReader;
  /** Can the running app be replaced where it is? */
  locateTarget(): Promise<TargetVerdict>;
  isRecording(): boolean;
  /** Writes the install script and launches it detached; it waits for the app to exit. */
  launchInstall(manifest: UpdateManifest, target: InstallTarget): Promise<void>;
  quit(): void;
  /** Announces a new state to the interface. */
  publish(status: UpdateStatus): void;
  /** Never throws. */
  log(message: string): void;
}
