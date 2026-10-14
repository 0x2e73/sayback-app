export const LIST_ERROR = 'Impossible de charger vos réunions.';

interface WorkspaceErrors {
  recording: string;
  analysis: string;
  library: string;
  folders: string;
  update: string;
}

export interface WorkspaceNotice {
  message: string;
  retryList: boolean;
}

/** One notice at a time, the most urgent first; only the list can be retried from it. */
export function workspaceNotice(errors: WorkspaceErrors): WorkspaceNotice | null {
  if (errors.recording) return { message: errors.recording, retryList: false };
  if (errors.analysis) return { message: errors.analysis, retryList: false };
  if (errors.library) return { message: LIST_ERROR, retryList: true };
  if (errors.folders) return { message: errors.folders, retryList: false };
  if (errors.update) return { message: errors.update, retryList: false };
  return null;
}
