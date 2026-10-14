/** A build of the app: the running one, or the one waiting in the update channel. */
export interface UpdateInfo {
  version: string;
  /** Git commit the build comes from; `inconnu` for a build made outside a repository. */
  commit: string;
  /** ISO date of the build. */
  builtAt: string;
  /** One line written at publication. */
  notes?: string;
}

/**
 * Update state for the interface. `available` and `canInstall` are independent: a version may be
 * available without being installable from here, and `reason` then says why, ready to display.
 */
export interface UpdateStatus {
  current: UpdateInfo;
  available: UpdateInfo | null;
  canInstall: boolean;
  reason?: string;
}

export interface BuildIdentity {
  commit: string;
  builtAt: string;
}

/** An update is ANOTHER commit built AFTER the running one. An unreadable date proves nothing. */
export function isNewer(candidate: BuildIdentity, current: BuildIdentity): boolean {
  return (
    candidate.commit !== current.commit &&
    Date.parse(candidate.builtAt) > Date.parse(current.builtAt)
  );
}
