import type { IslandRequest, IslandSnapshot } from '../shared/island';
import { debounce, type Debounced } from './debounce';
import type { IslandLayout } from './island-geometry';
import { hoverFor, type HoverState, type IslandHover } from './island-hover';
import type { Island, IslandPorts, IslandWindowPort } from './island-ports';
import { createIslandPointer, type IslandPointer } from './island-pointer';
import { ReadySession } from './island-ready';
import { RecordingScreens } from './island-recording';
import { createIslandRequests, type IslandRequests } from './island-requests';
import { islandSnapshot } from './island-snapshot';
import { foldAway, sendTo, watchSurface } from './island-surface';
import type { RecordingSnapshot } from './recording-state-hub';

export type { Island, IslandPorts, IslandWindowPort } from './island-ports';
export { CLICK_GUARD } from './island-pointer';
export { FOLD_FALLBACK } from './island-surface';

// A burst of start and stop opens or closes the window once, after it settles.
export const ISLAND_SETTLE = 200;
// A click on the menu bar icon may blur the ready island first: that click closes, not reopens.
export const BLUR_TOGGLE_GUARD = 400;

type Mode = 'ready' | 'recording';

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
  private screens: RecordingScreens | null = null;
  /** The mode of the window shown or being opened; null without any. */
  private mode: Mode | null = null;
  private expanded = false;
  /** The icon was clicked during a recording before its island existed. */
  private expandWhenShown = false;
  private opening = false;
  private stale = false;
  // Each opening and closing moves it on: an opening that outlived its turn is dropped.
  private generation = 0;
  private blurredAt = -Infinity;
  private readonly lifecycle: Debounced;
  private readonly pointer: IslandPointer;
  private readonly requests: IslandRequests;
  private readonly recordingPorts: IslandPorts['ready'] & Pick<IslandPorts, 'switchScreen'>;

  constructor(private readonly ports: IslandPorts) {
    this.lifecycle = debounce(() => this.settle(), ISLAND_SETTLE);
    this.pointer = createIslandPointer(() => this.window());
    this.recordingPorts = { ...ports.ready, switchScreen: ports.switchScreen };
    this.requests = createIslandRequests(
      {
        mode: () => this.mode,
        session: () => this.session,
        screens: () => this.screens,
        expand: () => this.hover?.expand(),
        dismiss: () => this.dismiss(),
      },
      ports,
    );
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
    // The ready island opens expanded and focused: a click anywhere else closes it.
    if (this.expanded) this.pointer.expanded(true);
    if (this.mode === 'ready') this.pointer.focusable(true);
    return current;
  }

  request(request: IslandRequest): Promise<void> | void {
    return this.requests.handle(request);
  }

  toggle(): void {
    if (this.ports.hub.current().state.recording) return this.openRecording();
    if (this.mode === 'ready') return this.dismiss();
    if (Date.now() - this.blurredAt < BLUR_TOGGLE_GUARD) return;
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

  preview(jpeg: Uint8Array): void {
    if (this.mode === 'recording') this.send('island:preview', jpeg);
  }

  async screensChanged(): Promise<void> {
    if (this.opening) {
      this.stale = true;
      return;
    }
    if (!this.window()) return;
    const lists = [this.session?.refreshScreens(), this.screens?.refresh()];
    const [next] = await Promise.all([this.ports.layout(), ...lists]);
    const target = this.window();
    if (!next || !target) return;
    this.layout = next;
    target.setBounds(next.window);
    this.send('island:state', this.snapshot());
  }

  close(): void {
    this.detach()?.destroy();
  }

  private blurred(): void {
    if (this.mode !== 'ready' || this.session?.isBusy()) return;
    this.blurredAt = Date.now();
    this.dismiss();
  }

  // Its IPC role ends at once; the window goes once folded.
  private dismiss(): void {
    const leaving = this.detach();
    if (leaving) foldAway(leaving);
  }

  private detach(): IslandWindowPort | null {
    const leaving = this.window();
    this.generation += 1;
    this.lifecycle.cancel();
    this.pointer.reset();
    this.hover?.stop();
    this.session?.dispose();
    this.screens?.dispose();
    this.hover = null;
    this.session = null;
    this.screens = null;
    this.current = null;
    this.layout = null;
    this.mode = null;
    this.expanded = false;
    this.expandWhenShown = false;
    this.opening = false;
    return leaving;
  }

  private follow({ state }: RecordingSnapshot): void {
    if (state.recording && this.mode === 'ready') this.becomeRecording();
    if (state.recording && state.stopping) this.hover?.collapse();
    if (this.window()) this.send('island:state', this.snapshot());
    if (state.recording !== (this.mode === 'recording')) this.lifecycle.call();
  }

  // The same window carries on, folded into wings at once and no longer taking the keyboard.
  private becomeRecording(): void {
    if (!this.window()) return this.close();
    this.screens = new RecordingScreens(this.recordingPorts, this.session?.state().screens);
    this.session?.dispose();
    this.session = null;
    this.mode = 'recording';
    this.pointer.focusable(false);
    this.hover?.stop();
    this.hover = this.startHover('recording', { expanded: false });
    if (this.expanded) this.setExpanded(false);
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
    if (mode === 'recording') {
      this.screens = RecordingScreens.open(this.recordingPorts, () =>
        this.send('island:state', this.snapshot()),
      );
    }
    this.expanded = mode === 'ready';
    this.current = this.ports.openWindow(layout);
    this.watch(this.current);
    this.hover = this.startHover(mode, { expanded: this.expanded, entered: false });
    if (mode === 'recording' && this.expandWhenShown) this.hover.expand();
    this.expandWhenShown = false;
  }

  private startHover(mode: Mode, initial: HoverState): IslandHover {
    return this.ports.startHover(
      hoverFor(mode, initial, {
        shells: () => this.layout,
        onChange: (expanded) => this.hovered(expanded),
        onReach: (reachable) => this.pointer.reach(reachable),
        hold: () => this.session?.holding() ?? false,
      }),
    );
  }

  // A crashed page is closed: the next state of the recording opens a new one.
  private watch(target: IslandWindowPort): void {
    const ifCurrent = (action: () => void) => () => {
      if (this.current === target) action();
    };
    watchSurface(target, {
      crashed: ifCurrent(() => this.close()),
      blurred: ifCurrent(() => this.blurred()),
    });
  }

  private hovered(expanded: boolean): void {
    if (!expanded && this.mode === 'ready') return this.dismiss();
    this.setExpanded(expanded);
  }

  private setExpanded(next: boolean): void {
    this.expanded = next;
    this.pointer.expanded(next);
    this.send('island:expanded', next);
  }

  private snapshot(): IslandSnapshot | null {
    if (!this.layout) return null;
    const ready = this.mode === 'ready' ? (this.session?.state() ?? null) : null;
    const { shape } = this.layout;
    const screens = this.screens?.list() ?? [];
    return islandSnapshot({ hub: this.ports.hub, shape, expanded: this.expanded, ready, screens });
  }

  private send(channel: string, payload: unknown): void {
    sendTo(this.window(), channel, payload);
  }
}

export function createIsland(ports: IslandPorts): Island {
  return new IslandController(ports);
}
