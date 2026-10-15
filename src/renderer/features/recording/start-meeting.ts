import type { SourceToggles } from '../../../shared/capture-selection';
import {
  unwrap,
  type CapturePrefs,
  type CaptureSource,
  type DesktopApi,
} from '../../../shared/contracts';
import type { CaptureOptions } from './capture-session';

export type CaptureSelection = Omit<CaptureOptions, 'onFailure' | 'onEnded'>;
export type StartMeeting = (
  title: string,
  options: CaptureSelection,
  autoAnalyze: boolean,
  /** Epoch ms after which nobody waits for this start: it stops instead of recording. */
  deadline?: number,
) => Promise<void>;

/** One start, from the dialog or the island. */
export interface MeetingLaunch {
  title: string;
  selection: SourceToggles;
  /** The screen or window to share; read only with the screen on. */
  sourceId: string;
  source?: CaptureSource;
  /** The analysis after the stop, once the settings allow it. */
  autoAnalyze: boolean;
  /** The habits kept once the recording has really started. */
  remembered: CapturePrefs;
}

type LaunchApi = Pick<DesktopApi, 'selectSource' | 'setCapturePrefs'>;

/** A window gets a new identifier each time: only a screen is worth remembering. */
export function rememberedScreenId(
  selection: SourceToggles,
  sourceId: string,
  previous: string | undefined,
): string | undefined {
  if (selection.screen && sourceId.startsWith('screen:')) return sourceId;
  return previous;
}

/**
 * Points the capture at its source, starts, then remembers the choices. A failure throws
 * before anything is remembered; a failed save of the habits is not worth a message.
 */
export async function launchMeeting(
  api: LaunchApi,
  onStart: StartMeeting,
  launch: MeetingLaunch,
): Promise<void> {
  const { selection } = launch;
  if (selection.screen) unwrap(await api.selectSource(launch.sourceId, selection.systemAudio));
  const source = selection.screen ? launch.source : undefined;
  await onStart(launch.title, { ...selection, source }, launch.autoAnalyze);
  void api.setCapturePrefs(launch.remembered).catch(() => undefined);
}
