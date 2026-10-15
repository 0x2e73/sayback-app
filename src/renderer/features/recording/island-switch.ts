import { unwrap, type CaptureSource, type DesktopApi } from '../../../shared/contracts';
import type { ScreenSwitchRequest } from '../../../shared/screen-switch';
import type { CaptureSession } from './capture-session';

type SwitchApi = Pick<DesktopApi, 'getSources' | 'selectSource' | 'answerScreenSwitch'>;

/** What the page records now: nothing, or a capture that may be closing. */
export interface SwitchTarget {
  capture: Pick<CaptureSession, 'source' | 'switchSource'> | null;
  stopping: boolean;
}

async function screenOf(api: SwitchApi, screenId: string): Promise<CaptureSource> {
  const sources = unwrap(await api.getSources());
  const screen = sources.find(
    (source) => source.id === screenId && source.id.startsWith('screen:'),
  );
  if (!screen) throw new Error('Cet écran n’est plus disponible.');
  return screen;
}

/** The dialog's switch, asked by the island: main primed the activation getDisplayMedia needs. */
async function switchTo(api: SwitchApi, target: SwitchTarget, screenId: string): Promise<void> {
  const { capture } = target;
  if (!capture || target.stopping) throw new Error('Aucun enregistrement à modifier.');
  if (capture.source?.id === screenId) return;
  await capture.switchSource(api, await screenOf(api, screenId));
}

/** Always answers: main waits with the island's picker closed and its button pending. */
export async function answerScreenSwitch(
  api: SwitchApi,
  request: ScreenSwitchRequest,
  target: SwitchTarget,
): Promise<void> {
  const ok = await switchTo(api, target, request.screenId).then(
    () => true,
    () => false,
  );
  await api.answerScreenSwitch(request.id, ok).catch(() => undefined);
}
