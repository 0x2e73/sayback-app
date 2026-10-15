import { defaultMeetingTitle, defaultScreenId, hasAudioSource } from '../shared/capture-selection';
import type { CapturePermission, CapturePrefs } from '../shared/contracts';
import type { IslandReadyState, IslandScreen } from '../shared/island';
import type {
  IslandStart,
  RecordingStartError,
  RecordingStartOutcome,
  StartPayload,
} from '../shared/recording-start';
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

function screenError(
  screens: readonly ListedScreen[],
  permission: CapturePermission,
): RecordingStartError | null {
  if (permission === 'denied') return 'screen-denied';
  return screens.length ? null : 'no-screen';
}

const shown = (screen: ListedScreen | undefined): IslandScreen | null =>
  screen ? { id: screen.id, name: screen.name } : null;

/** One opening of the ready island: its state, its start and its error hold. */
export class ReadySession {
  private busy = false;
  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  private constructor(
    private current: IslandReadyState,
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
      screenCount: screens.length,
      error: screen ? screenError(screens, ports.screenPermission()) : null,
    };
    return new ReadySession(state, ports, events);
  }

  state(): IslandReadyState {
    return this.current;
  }

  /** A start in progress or a fresh error keeps the island open. */
  holding(): boolean {
    return this.busy || this.holdTimer !== undefined;
  }

  async start({ title, selection }: IslandStart): Promise<void> {
    if (this.busy || this.disposed) return;
    if (!hasAudioSource(selection)) return this.finish({ ok: false, error: 'no-audio-source' });
    this.busy = true;
    const outcome = await this.ports.start({ title, selection }).catch(() => FAILED);
    this.busy = false;
    this.finish(outcome);
  }

  /** « Changer » and « Réessayer »: lists the screens again and moves to the next one. */
  async cycleScreen(): Promise<void> {
    const screens = await this.ports.screens();
    if (this.disposed) return;
    const index = screens.findIndex((item) => item.id === this.current.screen?.id);
    this.current = {
      ...this.current,
      screen: shown(screens[(index + 1) % screens.length]),
      screenCount: screens.length,
      error: screenError(screens, this.ports.screenPermission()),
    };
    this.events.changed();
  }

  /** Closed: late answers and timers are dropped. */
  dispose(): void {
    this.disposed = true;
    clearTimeout(this.holdTimer);
    this.holdTimer = undefined;
  }

  private finish(outcome: RecordingStartOutcome): void {
    if (this.disposed) return;
    this.current = { ...this.current, error: outcome.ok ? null : outcome.error };
    if (!outcome.ok) this.holdError();
    this.events.result(outcome);
  }

  private holdError(): void {
    clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => {
      this.holdTimer = undefined;
    }, READY_ERROR_HOLD);
  }
}
