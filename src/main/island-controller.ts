import type { IslandRequest, IslandSnapshot } from '../shared/island';
import type { IslandStart } from '../shared/recording-start';
import { debounce, type Debounced } from './debounce';
import type { IslandLayout } from './island-geometry';
import {
  READY_HOVER,
  RECORDING_HOVER,
  type HoverArea,
  type HoverState,
  type IslandHover,
} from './island-hover';
import type { Island, IslandPorts, IslandWindowPort } from './island-ports';
import { ReadySession } from './island-ready';
import { islandSnapshot } from './island-snapshot';
import type { RecordingSnapshot } from './recording-state-hub';

export type { Island, IslandPorts, IslandWindowPort } from './island-ports';

// A burst of start and stop opens or closes the window once, after it settles.
export const ISLAND_SETTLE = 200;
// The time of the opening animation: a click aimed at what was under the island stays there.
export const CLICK_GUARD = 250;
// The page folds its shell on `island:expanded` false; the window goes once it is folded.
export const FOLD_FALLBACK = 400;

type Mode = 'ready' | 'recording';
type IslandCommand = Exclude<IslandRequest, IslandStart>;

const report = (what: string) => (error: unknown) => console.error(`[island] ${what}`, error);

/**
 * Ready: opened by the menu bar icon, open at once, closed by its own rules. Recording: lives
 * with the recording. A ready island whose start succeeds becomes the recording one.
 */
class IslandController implements Island {
  private current: IslandWindowPort | null = null;
  private layout: IslandLayout | null = null;
  private hover: IslandHover | null = null;
  private session: ReadySession | null = null;
  /** The mode of the window shown or being opened; null without any. */
  private mode: Mode | null = null;
  private expanded = false;
  /** The icon was clicked during a recording before its island existed. */
  private expandWhenShown = false;
  private opening = false;
  private stale = false;
  // Each opening and closing moves it on: an opening that outlived its turn is dropped.
  private generation = 0;
  private readonly lifecycle: Debounced;
  private readonly clickGuard: Debounced;
  private readonly commands: Record<IslandCommand, () => void>;

  constructor(private readonly ports: IslandPorts) {
    this.lifecycle = debounce(() => this.settle(), ISLAND_SETTLE);
    this.clickGuard = debounce(() => {
      if (this.expanded) this.window()?.setIgnoreMouseEvents(false);
    }, CLICK_GUARD);
    this.commands = {
      pause: () => ports.request('pause'),
      resume: () => ports.request('resume'),
      stop: () => ports.request('stop'),
      open: () => this.openFromIsland(),
      // The × waits for the start: closing would hide its outcome.
      close: () =>
        this.whenReady(() => {
          if (!this.session?.isBusy()) this.dismiss();
        }),
      'open-privacy-settings': () => this.whenReady(() => ports.openPrivacySettings()),
      'cycle-screen': () => {
        this.session?.cycleScreen().catch(report('listing the screens failed'));
      },
    };
    ports.hub.subscribe((snapshot) => this.follow(snapshot));
  }

  window(): IslandWindowPort | null {
    return this.current && !this.current.isDestroyed() ? this.current : null;
  }

  ready(): IslandSnapshot {
    const target = this.window();
    const current = this.snapshot();
    if (!target || !this.layout || !current) throw new Error('L’îlot n’est pas affiché.');
    target.showInactive();
    // Placed again once shown: macOS may have pushed a new window below the menu bar.
    target.setBounds(this.layout.window);
    // The ready island opens expanded: it takes clicks once its opening animation is over.
    if (this.expanded) this.clickGuard.call();
    return current;
  }

  request(request: IslandRequest): void {
    if (typeof request === 'string') return this.commands[request]();
    this.session?.start(request).catch(report('the start failed'));
  }

  toggle(): void {
    if (this.ports.hub.current().state.recording) return this.openRecording();
    const wasReady = this.mode === 'ready';
    if (wasReady) return this.dismiss();
    this.close();
    this.open('ready').catch(report('opening failed'));
  }

  private openRecording(): void {
    if (this.hover) return this.hover.expand();
    this.expandWhenShown = true;
    if (!this.mode) this.lifecycle.call();
  }

  level(level: number): void {
    this.send('island:level', level);
  }

  async screensChanged(): Promise<void> {
    if (this.opening) {
      this.stale = true;
      return;
    }
    if (!this.window()) return;
    const session = this.session;
    const [next] = await Promise.all([this.ports.layout(), session?.refreshScreens()]);
    const target = this.window();
    if (!next || !target) return;
    this.layout = next;
    target.setBounds(next.window);
    this.send('island:state', this.snapshot());
  }

  close(): void {
    this.detach()?.destroy();
  }

  // Folded by the page first, then destroyed; its IPC role ends at once.
  private dismiss(): void {
    const leaving = this.detach();
    if (!leaving) return;
    leaving.setIgnoreMouseEvents(true);
    if (!leaving.webContents.isDestroyed()) leaving.webContents.send('island:expanded', false);
    setTimeout(() => {
      if (!leaving.isDestroyed()) leaving.destroy();
    }, FOLD_FALLBACK);
  }

  private detach(): IslandWindowPort | null {
    const leaving = this.window();
    this.generation += 1;
    this.lifecycle.cancel();
    this.clickGuard.cancel();
    this.hover?.stop();
    this.session?.dispose();
    this.hover = null;
    this.session = null;
    this.current = null;
    this.layout = null;
    this.mode = null;
    this.expanded = false;
    this.expandWhenShown = false;
    this.opening = false;
    return leaving;
  }

  private whenReady(action: () => void): void {
    if (this.mode === 'ready') action();
  }

  private openFromIsland(): void {
    if (this.mode !== 'ready') return this.ports.openApp();
    this.ports.openDialog();
    this.dismiss();
  }

  private follow({ state }: RecordingSnapshot): void {
    if (state.recording && this.mode === 'ready') this.becomeRecording();
    if (this.window()) this.send('island:state', this.snapshot());
    if (state.recording !== (this.mode === 'recording')) this.lifecycle.call();
  }

  // The same window carries on; its hover folds it into wings once the cursor goes.
  private becomeRecording(): void {
    if (!this.window()) return this.close();
    this.session?.dispose();
    this.session = null;
    this.mode = 'recording';
    this.hover?.stop();
    this.hover = this.startHover('recording', { expanded: this.expanded, entered: true });
  }

  private settle(): void {
    if (!this.ports.hub.current().state.recording) {
      if (this.mode === 'recording') this.close();
      return;
    }
    if (!this.mode) this.open('recording').catch(report('opening failed'));
  }

  private wanted(mode: Mode): boolean {
    return this.ports.hub.current().state.recording === (mode === 'recording');
  }

  private async open(mode: Mode): Promise<void> {
    const generation = ++this.generation;
    this.mode = mode;
    this.opening = true;
    this.stale = false;
    const opening = this.openSession(mode);
    try {
      const [next, session] = await Promise.all([this.ports.layout(), opening]);
      if (generation !== this.generation || !next || !this.wanted(mode)) {
        session?.dispose();
        return this.abandon(generation);
      }
      this.show(mode, next, session);
    } catch (error) {
      // The layout may fail while the session opened: its error hold must not outlive it.
      opening.then((session) => session?.dispose()).catch(() => undefined);
      this.abandon(generation);
      throw error;
    } finally {
      if (generation === this.generation) this.opening = false;
    }
    // The screens changed while they were read: read them again for the new window.
    if (this.stale) await this.screensChanged();
  }

  private openSession(mode: Mode): Promise<ReadySession | null> {
    if (mode === 'recording') return Promise.resolve(null);
    return ReadySession.open(this.ports.ready, {
      changed: () => this.send('island:state', this.snapshot()),
      result: (outcome) => this.send('island:start-result', outcome),
    });
  }

  private abandon(generation: number): void {
    if (generation === this.generation) this.mode = null;
  }

  private show(mode: Mode, layout: IslandLayout, session: ReadySession | null): void {
    this.layout = layout;
    this.session = session;
    this.expanded = mode === 'ready';
    this.current = this.ports.openWindow(layout);
    this.watch(this.current);
    this.hover = this.startHover(mode, { expanded: this.expanded, entered: false });
    if (mode === 'recording' && this.expandWhenShown) this.hover.expand();
    this.expandWhenShown = false;
  }

  private startHover(mode: Mode, initial: HoverState): IslandHover {
    return this.ports.startHover({
      area: () => this.area(),
      onChange: (expanded) => this.hovered(expanded),
      delays: mode === 'ready' ? READY_HOVER : RECORDING_HOVER,
      initial,
      hold: () => this.session?.holding() ?? false,
    });
  }

  private watch(target: IslandWindowPort): void {
    target.setIgnoreMouseEvents(true);
    // A crashed page is closed: the next state of the recording opens a new one.
    target.webContents.on('render-process-gone', () => {
      if (this.current === target) this.close();
    });
  }

  // The open area is the visible shell, never the whole transparent window.
  private area(): HoverArea | null {
    return this.layout && { compact: this.layout.compact, open: this.layout.open };
  }

  private hovered(expanded: boolean): void {
    if (!expanded && this.mode === 'ready') return this.dismiss();
    this.setExpanded(expanded);
  }

  private setExpanded(next: boolean): void {
    this.expanded = next;
    if (next) {
      this.clickGuard.call();
    } else {
      // Closed, every click goes through to what lies under the island.
      this.clickGuard.cancel();
      this.window()?.setIgnoreMouseEvents(true);
    }
    this.send('island:expanded', next);
  }

  private snapshot(): IslandSnapshot | null {
    if (!this.layout) return null;
    const ready = this.mode === 'ready' ? (this.session?.state() ?? null) : null;
    const { shape } = this.layout;
    return islandSnapshot({ hub: this.ports.hub, shape, expanded: this.expanded, ready });
  }

  private send(channel: string, payload: unknown): void {
    const target = this.window();
    if (target && !target.webContents.isDestroyed()) target.webContents.send(channel, payload);
  }
}

export function createIsland(ports: IslandPorts): Island {
  return new IslandController(ports);
}
