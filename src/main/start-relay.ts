import { randomUUID } from 'node:crypto';
import {
  startAcceptedSchema,
  startAnswerSchema,
  type RecordingStartOutcome,
  type RecordingStartRequest,
  type StartPayload,
} from '../shared/recording-start';
import type { IpcRegistrar } from './ipc';

export const START_REQUEST = 'recording:start-request';
/** A page that has not subscribed by then will not: its loading failed or it crashed. */
export const READY_TIMEOUT = 15_000;
/** A listening page acknowledges at once; silence means it never got the request. */
export const ACCEPT_TIMEOUT = 15_000;
// Counted from the request: room for the person to answer the macOS microphone prompt.
export const RESULT_TIMEOUT = 180_000;
// One start at a time; a few a second is a stuck page, not a person.
const MESSAGES_PER_SECOND = 5;

const FAILED: RecordingStartOutcome = { ok: false, error: 'failed' };

type PageEvent = 'did-start-navigation' | 'render-process-gone' | 'destroyed';

export interface RelayContents {
  isDestroyed(): boolean;
  isCrashed(): boolean;
  reload(): void;
  send(channel: string, payload: unknown): void;
  executeJavaScript(code: string, userGesture: boolean): Promise<unknown>;
  on(event: PageEvent, listener: (details?: unknown) => void): unknown;
}

export interface RelayWindow {
  webContents: RelayContents;
}

export interface StartRelayDeps {
  /** The live main window, or null once it is closed. */
  getWindow(): RelayWindow | null;
  /** Creates the main window without ever showing it; null when the app cannot open one yet. */
  openHiddenWindow(): RelayWindow | null;
  newId?(): string;
  /** Epoch ms, for the deadline the page receives. */
  now?(): number;
}

export interface StartRelay {
  /** Hands the start to the main page, hidden as it is, and waits for its answer. */
  start(payload: StartPayload): Promise<RecordingStartOutcome>;
  /** The main page has subscribed: a start waiting for it goes on. */
  rendererReady(): void;
  /** The main page has received a request, unvalidated. */
  accepted(input: unknown): void;
  /** The main page's answer, unvalidated. */
  answer(input: unknown): void;
}

interface Pending {
  accept(): void;
  settle(outcome: RecordingStartOutcome): void;
}

/** Only a new document in the top frame replaces the page that listened. */
function replacesPage(details: unknown): boolean {
  if (typeof details !== 'object' || details === null) return true;
  const { isMainFrame, isSameDocument } = details as Record<string, unknown>;
  return isMainFrame !== false && isSameDocument !== true;
}

/** Which page listens: set by its first announcement, cleared when it goes. */
function createPageWatch(onLost: () => void) {
  const tracked = new WeakSet<RelayContents>();
  const listening = new WeakSet<RelayContents>();
  const readyWaiters = new Map<(ready: boolean) => void, RelayContents>();

  function lost(contents: RelayContents): void {
    listening.delete(contents);
    onLost();
  }

  function track(contents: RelayContents): void {
    if (tracked.has(contents)) return;
    tracked.add(contents);
    contents.on('did-start-navigation', (details) => {
      if (replacesPage(details)) lost(contents);
    });
    contents.on('render-process-gone', () => lost(contents));
    contents.on('destroyed', () => lost(contents));
  }

  return {
    track,
    listens: (contents: RelayContents) => listening.has(contents),
    ready(contents: RelayContents): void {
      track(contents);
      listening.add(contents);
      for (const [settle, waiting] of [...readyWaiters]) {
        if (waiting === contents) settle(true);
      }
    },
    waitReady(contents: RelayContents): Promise<boolean> {
      return new Promise((resolve) => {
        const settle = (ready: boolean) => {
          clearTimeout(timer);
          readyWaiters.delete(settle);
          resolve(ready);
        };
        const timer = setTimeout(() => settle(false), READY_TIMEOUT);
        readyWaiters.set(settle, contents);
      });
    },
  };
}

/** Requests sent and not answered: 15 s to be acknowledged, then until their deadline. */
function createPendingAnswers(now: () => number) {
  const pending = new Map<string, Pending>();

  function wait(request: RecordingStartRequest, send: () => void) {
    return new Promise<RecordingStartOutcome>((resolve) => {
      let accepted = false;
      const settle = (outcome: RecordingStartOutcome) => {
        clearTimeout(timer);
        pending.delete(request.id);
        resolve(outcome);
      };
      let timer = setTimeout(() => settle(FAILED), ACCEPT_TIMEOUT);
      const accept = () => {
        if (accepted) return;
        accepted = true;
        clearTimeout(timer);
        timer = setTimeout(() => settle(FAILED), Math.max(0, request.deadline - now()));
      };
      pending.set(request.id, { accept, settle });
      try {
        send();
      } catch {
        settle(FAILED);
      }
    });
  }

  return {
    wait,
    accept: (id: string) => pending.get(id)?.accept(),
    settle: (id: string, outcome: RecordingStartOutcome) => pending.get(id)?.settle(outcome),
    // The page that held them is gone: they fail now, not at their timeout.
    failAll: () => {
      for (const { settle } of [...pending.values()]) settle(FAILED);
    },
  };
}

export function createStartRelay({
  getWindow,
  openHiddenWindow,
  newId = randomUUID,
  now = Date.now,
}: StartRelayDeps): StartRelay {
  const answers = createPendingAnswers(now);
  const pages = createPageWatch(answers.failAll);

  // A destroyed window is opened again hidden, a crashed page reloaded; both wait for the page.
  async function listeningContents(): Promise<RelayContents | null> {
    const existing = getWindow();
    const window = existing && !existing.webContents.isDestroyed() ? existing : openHiddenWindow();
    if (!window) return null;
    const contents = window.webContents;
    pages.track(contents);
    if (pages.listens(contents)) return contents;
    if (contents.isCrashed()) contents.reload();
    return (await pages.waitReady(contents)) ? contents : null;
  }

  return {
    async start(payload) {
      const contents = await listeningContents();
      if (!contents) return FAILED;
      try {
        // A never-shown page has had no gesture, and getDisplayMedia may ask for one: a constant
        // script run with userGesture grants it transient activation. Proven only on a real Mac.
        await contents.executeJavaScript('void 0', true);
      } catch {
        return FAILED;
      }
      if (!pages.listens(contents)) return FAILED;
      const request: RecordingStartRequest = {
        id: newId(),
        deadline: now() + ACCEPT_TIMEOUT + RESULT_TIMEOUT,
        ...payload,
      };
      return answers.wait(request, () => contents.send(START_REQUEST, request));
    },
    rendererReady() {
      const contents = getWindow()?.webContents;
      if (contents && !contents.isDestroyed()) pages.ready(contents);
    },
    accepted(input) {
      answers.accept(startAcceptedSchema.parse(input).id);
    },
    answer(input) {
      const { id, outcome } = startAnswerSchema.parse(input);
      answers.settle(id, outcome);
    },
  };
}

/** The acknowledgement and the answer, from the main page only. */
export function registerStartRelay({ handle, listen }: IpcRegistrar, relay: StartRelay): void {
  listen(
    'recording:start-accepted',
    (input) => relay.accepted(input),
    ['main'],
    MESSAGES_PER_SECOND,
  );
  handle('recording:start-result', (input) => relay.answer(input), ['main'], MESSAGES_PER_SECOND);
}
