import {
  defaultMeetingTitle,
  defaultScreenId,
  hasAudioSource,
  screenProblem,
  type ScreenProblem,
} from '../shared/capture-selection';
import type { CapturePermission, CapturePrefs } from '../shared/contracts';
import type { IslandReadyState, IslandScreen } from '../shared/island';
import type { IslandStart, RecordingStartOutcome, StartPayload } from '../shared/recording-start';
import { READY_ERROR_HOLD } from './island-hover';

/** A screen as the capture sources list it: the main one comes first and is marked. */
export interface ListedScreen extends IslandScreen {
  primary?: boolean;
}

export interface ReadyPorts {
  /** The choices remembered by the dialog and the last start. */
  prefs(): CapturePrefs;
  /** Empty when the screens cannot be listed. */
  screens(): Promise<ListedScreen[]>;
  screenPermission(): CapturePermission;
  today(): Date;
  /** Hands the start to the main page. */
  start(payload: StartPayload): Promise<RecordingStartOutcome>;
}

export interface ReadyEvents {
  /** The state to draw has changed. */
  changed(): void;
  result(outcome: RecordingStartOutcome): void;
}

const FAILED: RecordingStartOutcome = { ok: false, error: 'failed' };

const SCREEN_PROBLEMS: readonly string[] = ['screen-denied', 'no-screen'] satisfies ScreenProblem[];

const shown = (screen: ListedScreen | undefined): IslandScreen | null =>
  screen ? { id: screen.id, name: screen.name } : null;

/** The tiles of the picker: the screens as listed, without their primary mark. */
export const tilesOf = (screens: readonly ListedScreen[]): IslandScreen[] =>
  screens.map(({ id, name }) => ({ id, name }));

/** One opening of the ready island: its state, its start and its error hold. */
export class ReadySession {
  private busy = false;
  /** The picker is open: Escape closes it first, in the page. */
  private picking = false;
  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  private constructor(
    private current: IslandReadyState,
    /** The screen remembered at the opening: where the island falls back when its screen goes. */
    private readonly rememberedScreenId: string | undefined,
    private readonly ports: ReadyPorts,
    private readonly events: ReadyEvents,
  ) {
    if (current.error) this.holdError();
  }

  /** Reads the title, the remembered sources and the screens afresh. */
  static async open(ports: ReadyPorts, events: ReadyEvents): Promise<ReadySession> {
    const prefs = ports.prefs();
    const screens = await ports.screens();
    const { microphone, systemAudio, screen } = prefs;
    const chosen = screens.find((item) => item.id === defaultScreenId(screens, prefs.screenId));
    const state: IslandReadyState = {
      title: defaultMeetingTitle(ports.today()),
      remembered: { microphone, systemAudio, screen },
      screen: shown(chosen),
      screens: tilesOf(screens),
      error: screen ? screenProblem(screens.length > 0, ports.screenPermission()) : null,
    };
    return new ReadySession(state, prefs.screenId, ports, events);
  }

  state(): IslandReadyState {
    return this.current;
  }

  /** A start in progress or a fresh error keeps the island open. */
  holding(): boolean {
    return this.busy || this.holdTimer !== undefined;
  }

  isBusy(): boolean {
    return this.busy;
  }

  isPicking(): boolean {
    return this.picking;
  }

  setPicking(open: boolean): void {
    this.picking = open;
  }

  async start({ title, selection }: IslandStart): Promise<void> {
    if (this.busy || this.disposed) return;
    // The previous error goes with the new attempt: a later state must not bring it back.
    this.current = { ...this.current, error: null };
    if (!hasAudioSource(selection)) return this.finish({ ok: false, error: 'no-audio-source' });
    this.busy = true;
    const outcome = await this.ports.start({ title, selection }).catch(() => FAILED);
    this.busy = false;
    this.finish(outcome);
  }

  /** A tile of the picker: the screens are listed again, the chosen one kept if still there. */
  async selectScreen(screenId: string): Promise<void> {
    if (this.busy) return;
    await this.reread(screenId);
  }

  /** « Réessayer »: lists the screens again, keeping the current one if it is still there. */
  async retryScreens(): Promise<void> {
    await this.reread(this.current.screen?.id);
  }

  /**
   * The screens changed: the current one stays if it is still there, else the remembered or main
   * one. A start error stays; a screen problem follows the new screens, as at the opening.
   */
  async refreshScreens(): Promise<void> {
    const screens = await this.ports.screens();
    if (this.disposed) return;
    const kept =
      screens.find((item) => item.id === this.current.screen?.id) ??
      screens.find((item) => item.id === defaultScreenId(screens, this.rememberedScreenId));
    const { error, remembered } = this.current;
    const startError = error !== null && !SCREEN_PROBLEMS.includes(error);
    const problem = remembered.screen
      ? screenProblem(screens.length > 0, this.ports.screenPermission())
      : null;
    this.current = {
      ...this.current,
      screen: shown(kept),
      screens: tilesOf(screens),
      error: startError ? error : problem,
    };
    if (!startError && problem && !error) this.holdError();
  }

  private async reread(wanted: string | undefined): Promise<void> {
    const screens = await this.ports.screens();
    if (this.disposed) return;
    const problem = screenProblem(screens.length > 0, this.ports.screenPermission());
    const chosen =
      screens.find((item) => item.id === wanted) ??
      screens.find((item) => item.id === defaultScreenId(screens, this.rememberedScreenId));
    this.current = {
      ...this.current,
      screen: shown(chosen),
      screens: tilesOf(screens),
      error: problem,
    };
    if (problem) this.holdError();
    else this.releaseHold();
    this.events.changed();
  }

  /** Closed: late answers and timers are dropped. */
  dispose(): void {
    this.disposed = true;
    this.releaseHold();
  }

  private finish(outcome: RecordingStartOutcome): void {
    if (this.disposed) return;
    this.current = { ...this.current, error: outcome.ok ? null : outcome.error };
    if (!outcome.ok) this.holdError();
    this.events.result(outcome);
  }

  private releaseHold(): void {
    clearTimeout(this.holdTimer);
    this.holdTimer = undefined;
  }

  private holdError(): void {
    clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => {
      this.holdTimer = undefined;
    }, READY_ERROR_HOLD);
  }
}
