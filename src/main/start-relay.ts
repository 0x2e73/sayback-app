import { randomUUID } from 'node:crypto';
import {
  startAnswerSchema,
  type RecordingStartOutcome,
  type RecordingStartRequest,
  type StartPayload,
} from '../shared/recording-start';
import type { RegisterHandler } from './ipc';

export const START_REQUEST = 'recording:start-request';
/** A page that has not subscribed by then will not: its loading failed or it crashed. */
export const READY_TIMEOUT = 15_000;
// A first start waits for the person to answer the macOS microphone prompt.
export const ANSWER_TIMEOUT = 60_000;
// One start at a time; a few a second is a stuck page, not a person.
const ANSWERS_PER_SECOND = 5;

const FAILED: RecordingStartOutcome = { ok: false, error: 'failed' };

export interface RelayWindow {
  webContents: { isLoading(): boolean; send(channel: string, payload: unknown): void };
}

export interface StartRelayDeps {
  getWindow(): RelayWindow | null;
  /** Creates the main window without ever showing it; null when the app cannot open one yet. */
  openHiddenWindow(): RelayWindow | null;
  newId?(): string;
}

export interface StartRelay {
  /** Hands the start to the main page, hidden as it is, and waits for its answer. */
  start(payload: StartPayload): Promise<RecordingStartOutcome>;
  /** The main page has subscribed: a start waiting for it goes on. */
  rendererReady(): void;
  /** The main page's answer, unvalidated. */
  answer(input: unknown): void;
}

/** Resolves with what `settle` gives, or with `fallback` after `timeout` ms. */
function waitFor<T>(
  timeout: number,
  fallback: T,
  register: (settle: (value: T) => void) => () => void,
): Promise<T> {
  return new Promise((resolve) => {
    let unregister = () => {};
    const finish = (value: T) => {
      clearTimeout(timer);
      unregister();
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), timeout);
    try {
      unregister = register(finish);
    } catch {
      finish(fallback);
    }
  });
}

export function createStartRelay({
  getWindow,
  openHiddenWindow,
  newId = randomUUID,
}: StartRelayDeps): StartRelay {
  const readyWaiters = new Set<(ready: boolean) => void>();
  const answers = new Map<string, (outcome: RecordingStartOutcome) => void>();

  function pageReady(): Promise<boolean> {
    return waitFor(READY_TIMEOUT, false, (settle) => {
      readyWaiters.add(settle);
      return () => readyWaiters.delete(settle);
    });
  }

  // A window opened for this start, or still loading, has a page that does not listen yet.
  async function listeningWindow(): Promise<RelayWindow | null> {
    const existing = getWindow();
    const window = existing ?? openHiddenWindow();
    if (!window) return null;
    if (existing && !window.webContents.isLoading()) return window;
    return (await pageReady()) ? getWindow() : null;
  }

  return {
    async start(payload) {
      const window = await listeningWindow();
      if (!window) return FAILED;
      const request: RecordingStartRequest = { id: newId(), ...payload };
      return waitFor(ANSWER_TIMEOUT, FAILED, (settle) => {
        answers.set(request.id, settle);
        window.webContents.send(START_REQUEST, request);
        return () => answers.delete(request.id);
      });
    },
    rendererReady() {
      for (const settle of [...readyWaiters]) settle(true);
    },
    answer(input) {
      const { id, outcome } = startAnswerSchema.parse(input);
      answers.get(id)?.(outcome);
    },
  };
}

/** `recording:start-result`, from the main page only. */
export function registerStartRelay(handle: RegisterHandler, relay: StartRelay): void {
  handle('recording:start-result', (input) => relay.answer(input), ['main'], ANSWERS_PER_SECOND);
}
