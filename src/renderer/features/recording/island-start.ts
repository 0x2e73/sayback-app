import { analysisConfigured } from '../../../shared/analysis-settings';
import {
  defaultCapturePrefs,
  hasAudioSource,
  screenProblem,
  type SourceToggles,
} from '../../../shared/capture-selection';
import {
  unwrap,
  type CapturePermission,
  type CaptureSource,
  type DesktopApi,
} from '../../../shared/contracts';
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

interface ScreenListing {
  listed: boolean;
  chosen?: CaptureSource;
}

async function listScreens(api: IslandStartApi, id: string | undefined): Promise<ScreenListing> {
  const sources: CaptureSource[] = await api
    .getSources()
    .then(unwrap)
    .catch(() => []);
  return {
    listed: sources.some((source) => source.id.startsWith('screen:')),
    chosen: sources.find((source) => source.id === id),
  };
}

/** A screen problem when no screen is listed; else a chosen screen gone, or a plain failure. */
async function screenFailure(
  api: IslandStartApi,
  { listed, chosen }: ScreenListing,
): Promise<RecordingStartError> {
  const permission = await api
    .getCapturePermission('screen')
    .then(unwrap)
    .catch((): CapturePermission => 'not-determined');
  return screenProblem(listed, permission) ?? (chosen ? 'failed' : 'no-screen');
}

/**
 * What a failed start answers. A refused screen capture is only `screen-denied` once the screens
 * are listed again and the system confirms it, as the island decides at its opening.
 */
export async function startErrorOf(
  api: IslandStartApi,
  failure: unknown,
  screenId: string | undefined,
): Promise<RecordingStartError> {
  if (failure instanceof CaptureBusy && failure.hold === 'interrupted') return 'interrupted';
  if (!(failure instanceof CaptureFailure) || failure.device !== 'screen') return 'failed';
  if (failure.reason === 'NotAllowedError') {
    return screenFailure(api, await listScreens(api, screenId));
  }
  return failure.reason === 'NotFoundError' ? 'no-screen' : 'failed';
}

async function analysisReady(api: IslandStartApi): Promise<boolean> {
  return api
    .getSettings()
    .then(unwrap)
    .then(analysisConfigured)
    .catch(() => false);
}

async function readPrefs(api: IslandStartApi) {
  return api
    .getCapturePrefs()
    .then(unwrap)
    .catch(() => defaultCapturePrefs);
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

/** Acknowledged then refused at once: the page cannot start a recording now. */
export async function refuseIslandStart(
  api: Pick<DesktopApi, 'acknowledgeStartRequest' | 'answerStartRequest'>,
  request: RecordingStartRequest,
): Promise<void> {
  api.acknowledgeStartRequest(request.id);
  await api.answerStartRequest(request.id, FAILED).catch(() => undefined);
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
  // Read together, then straight to the capture: main primed a short-lived user activation.
  const [screens, prefs, analysis] = await Promise.all([
    listScreens(api, sourceId),
    readPrefs(api),
    analysisReady(api),
  ]);
  if (selection.screen && !screens.chosen) return refused(await screenFailure(api, screens));
  const { microphone, systemAudio, screen } = selection;
  const toggles: SourceToggles = { microphone, systemAudio, screen };
  try {
    await launchMeeting(api, onStart, {
      title,
      selection: toggles,
      sourceId,
      source: screens.chosen,
      autoAnalyze: prefs.autoAnalyze && analysis,
      remembered: {
        ...toggles,
        autoAnalyze: prefs.autoAnalyze,
        screenId: rememberedScreenId(toggles, sourceId, prefs.screenId),
      },
    });
    return { ok: true };
  } catch (failure) {
    return refused(await startErrorOf(api, failure, selection.screenId));
  }
}
