import type { UpdateManifest } from '../../shared/update-channel';
import type { UpdateInfo, UpdateStatus } from '../domain/update';
import type { ChannelReading, InstallTarget, TargetVerdict } from './update-ports';

/** A refusal whose message is a sentence for the interface, without paths or internal details. */
export class UpdateRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpdateRefusal';
  }
}

export const UPDATE_MESSAGES = {
  disabled: 'Le canal de mise à jour local est désactivé dans ce build.',
  noIdentity: 'L’identité de ce build est illisible : les mises à jour sont désactivées.',
  notPackaged:
    'SayBack n’est pas empaquetée (build de développement) : elle ne peut pas se remplacer.',
  nothingToInstall: 'Aucune mise à jour à installer.',
  recording: 'Arrêtez l’enregistrement avant d’installer la mise à jour.',
  alreadyInstalling: 'Une installation est déjà en cours.',
  launchFailed: 'La mise à jour n’a pas pu être lancée. Rien n’a été modifié.',
  readFailed: 'Le canal de mise à jour n’a pas pu être lu.',
} as const;

/** What prevents installing, if anything. */
export const UpdateBlocker = {
  /** Channel closed in this build, or unreadable build identity. */
  Closed: 'closed',
  NotPackaged: 'not-packaged',
  /** The app cannot replace itself where it is. */
  Target: 'target',
  /** Manifest or staged bundle refused. */
  Channel: 'channel',
} as const;
export type UpdateBlocker = (typeof UpdateBlocker)[keyof typeof UpdateBlocker];

/** What one read of the channel established: the state for the interface, and what to install. */
export interface Snapshot {
  status: UpdateStatus;
  manifest: UpdateManifest | null;
  target: InstallTarget | null;
  blocker: UpdateBlocker | null;
}

/** Where the running app stands: not packaged, or the verdict on its location. */
export type Placement = { packaged: false } | { packaged: true; verdict: TargetVerdict };

function infoOf(manifest: UpdateManifest): UpdateInfo {
  const { version, commit, builtAt, notes } = manifest;
  return { version, commit, builtAt, ...(notes === undefined ? {} : { notes }) };
}

export function closedSnapshot(current: UpdateInfo, reason: string): Snapshot {
  return {
    status: { current, available: null, canInstall: false, reason },
    manifest: null,
    target: null,
    blocker: UpdateBlocker.Closed,
  };
}

export function channelSnapshot(
  current: UpdateInfo,
  reading: ChannelReading,
  placement: Placement,
): Snapshot {
  const manifest = reading.kind === 'available' ? reading.manifest : null;
  const available = manifest === null ? null : infoOf(manifest);
  const refuse = (reason: string, blocker: UpdateBlocker, target: InstallTarget | null) => ({
    status: { current, available, canInstall: false, reason },
    manifest,
    target,
    blocker,
  });
  if (!placement.packaged)
    return refuse(UPDATE_MESSAGES.notPackaged, UpdateBlocker.NotPackaged, null);
  if (!placement.verdict.ok) return refuse(placement.verdict.reason, UpdateBlocker.Target, null);
  const { target } = placement.verdict;
  if (reading.kind === 'invalid') return refuse(reading.reason, UpdateBlocker.Channel, target);
  return { status: { current, available, canInstall: true }, manifest, target, blocker: null };
}

/** What is needed to install, or the refusal that says why it is not possible. */
export function installable(snapshot: Snapshot): {
  manifest: UpdateManifest;
  target: InstallTarget;
} {
  const { manifest, target, blocker } = snapshot;
  const reason = snapshot.status.reason ?? UPDATE_MESSAGES.nothingToInstall;
  if (blocker === UpdateBlocker.Closed || blocker === UpdateBlocker.NotPackaged) {
    throw new UpdateRefusal(reason);
  }
  if (manifest === null) {
    throw new UpdateRefusal(
      blocker === UpdateBlocker.Channel ? reason : UPDATE_MESSAGES.nothingToInstall,
    );
  }
  if (target === null || blocker !== null) throw new UpdateRefusal(reason);
  return { manifest, target };
}
