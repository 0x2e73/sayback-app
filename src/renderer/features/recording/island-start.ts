import { analysisConfigured } from '../../../shared/analysis-settings';
import {
  defaultCapturePrefs,
  hasAudioSource,
  type SourceToggles,
} from '../../../shared/capture-selection';
import { unwrap, type CaptureSource, type DesktopApi } from '../../../shared/contracts';
import type {
  RecordingStartError,
  RecordingStartOutcome,
  RecordingStartRequest,
  StartPayload,
} from '../../../shared/recording-start';
import { CaptureBusy } from './capture-opener';
import { CaptureFailure } from './capture-resources';
import { launchMeeting, rememberedScreenId, type StartMeeting } from './start-meeting';

type IslandStartApi = Pick<
  DesktopApi,
  | 'getCapturePrefs'
  | 'getSettings'
  | 'getSources'
  | 'getCapturePermission'
  | 'selectSource'
  | 'setCapturePrefs'
>;

const refused = (error: RecordingStartError): RecordingStartOutcome => ({ ok: false, error });

/** An unseen interruption and the screen capture name their error; anything else is `failed`. */
export function startErrorOf(failure: unknown): RecordingStartError {
  if (failure instanceof CaptureBusy && failure.hold === 'interrupted') return 'interrupted';
  if (!(failure instanceof CaptureFailure) || failure.device !== 'screen') return 'failed';
  if (failure.reason === 'NotAllowedError') return 'screen-denied';
  if (failure.reason === 'NotFoundError') return 'no-screen';
  return 'failed';
}

async function analysisReady(api: IslandStartApi): Promise<boolean> {
  return api
    .getSettings()
    .then(unwrap)
    .then(analysisConfigured)
    .catch(() => false);
}

async function findScreen(api: IslandStartApi, id: string | undefined) {
  const sources: CaptureSource[] = await api
    .getSources()
    .then(unwrap)
    .catch(() => []);
  return sources.find((source) => source.id === id);
}

// macOS reports a refusal for a right it never asked about: only a missing screen proves it.
async function missingScreen(api: IslandStartApi): Promise<RecordingStartError> {
  const permission = await api
    .getCapturePermission('screen')
    .then(unwrap)
    .catch(() => 'not-determined');
  return permission === 'denied' ? 'screen-denied' : 'no-screen';
}

const FAILED: RecordingStartOutcome = { ok: false, error: 'failed' };

type AnswerApi = IslandStartApi &
  Pick<DesktopApi, 'acknowledgeStartRequest' | 'answerStartRequest'>;

/**
 * Acknowledges at once, before any wait (main gives up after 15 s without it), then runs the
 * start and always answers: the main process is waiting with the island busy.
 */
export async function answerIslandStart(
  api: AnswerApi,
  request: RecordingStartRequest,
  onStart: StartMeeting,
): Promise<void> {
  api.acknowledgeStartRequest(request.id);
  const withinDeadline: StartMeeting = (title, options, autoAnalyze) =>
    onStart(title, options, autoAnalyze, request.deadline);
  const outcome = await startFromIsland(api, request, withinDeadline).catch(() => FAILED);
  await api.answerStartRequest(request.id, outcome).catch(() => undefined);
}

/**
 * The dialog's start, asked by the island: the analysis and the habits come from the remembered
 * choices, the screen from the island. Never shows the window.
 */
export async function startFromIsland(
  api: IslandStartApi,
  { title, selection }: StartPayload,
  onStart: StartMeeting,
): Promise<RecordingStartOutcome> {
  if (!hasAudioSource(selection)) return refused('no-audio-source');
  const sourceId = selection.screenId ?? '';
  const source = selection.screen ? await findScreen(api, sourceId) : undefined;
  if (selection.screen && !source) return refused(await missingScreen(api));
  const prefs = await api
    .getCapturePrefs()
    .then(unwrap)
    .catch(() => defaultCapturePrefs);
  const { microphone, systemAudio, screen } = selection;
  const toggles: SourceToggles = { microphone, systemAudio, screen };
  try {
    await launchMeeting(api, onStart, {
      title,
      selection: toggles,
      sourceId,
      source,
      autoAnalyze: prefs.autoAnalyze && (await analysisReady(api)),
      remembered: {
        ...toggles,
        autoAnalyze: prefs.autoAnalyze,
        screenId: rememberedScreenId(toggles, sourceId, prefs.screenId),
      },
    });
    return { ok: true };
  } catch (failure) {
    return refused(startErrorOf(failure));
  }
}
