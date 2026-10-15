import type { IslandRequest, IslandSnapshot } from '../shared/island';
import type { RecordingRequest } from '../shared/recording-state';
import { debounce, type Debounced } from './debounce';
import type { IslandLayout, Rect } from './island-geometry';
import type { HoverArea, IslandHover } from './island-hover';
import type { RecordingSnapshot, RecordingStateHub } from './recording-state-hub';

export interface IslandWindowPort {
  readonly webContents: {
    readonly mainFrame: unknown;
    send(channel: string, payload: unknown): void;
    isDestroyed(): boolean;
    on(event: 'render-process-gone', listener: () => void): unknown;
  };
  showInactive(): void;
  setBounds(bounds: Rect): void;
  setIgnoreMouseEvents(ignore: boolean): void;
  isDestroyed(): boolean;
  /** Identifier of the window among the capture sources. */
  getMediaSourceId(): string;
  destroy(): void;
}

export interface IslandPorts {
  hub: Pick<RecordingStateHub, 'current' | 'elapsed' | 'subscribe'>;
  /** Where the island goes on the current screens; null when no screen can hold it. */
  layout(): Promise<IslandLayout | null>;
  openWindow(layout: IslandLayout): IslandWindowPort;
  startHover(area: () => HoverArea | null, onChange: (expanded: boolean) => void): IslandHover;
  /** « Ouvrir SayBack ». */
  openApp(): void;
  /** Sent to the main page, which owns the capture. */
  request(request: RecordingRequest): void;
}

export interface Island {
  /** The island window while it exists, for the IPC roles. */
  window(): IslandWindowPort | null;
  /** The page has loaded: shows the window and returns what to draw. */
  ready(): IslandSnapshot;
  request(request: IslandRequest): void;
  level(level: number): void;
  screensChanged(): Promise<void>;
  close(): void;
}

// A burst of start and stop opens or closes the window once, after it settles.
export const ISLAND_SETTLE = 200;
// The time of the opening animation: a click aimed at what was under the island stays there.
export const CLICK_GUARD = 250;

const report = (what: string) => (error: unknown) => console.error(`[island] ${what}`, error);

// Lives with the recording: created when it starts, destroyed when it ends.
class IslandController implements Island {
  private current: IslandWindowPort | null = null;
  private layout: IslandLayout | null = null;
  private hover: IslandHover | null = null;
  private expanded = false;
  private opening = false;
  private stale = false;
  private readonly lifecycle: Debounced;
  private readonly clickGuard: Debounced;

  constructor(private readonly ports: IslandPorts) {
    this.lifecycle = debounce(() => this.settle(), ISLAND_SETTLE);
    this.clickGuard = debounce(() => {
      if (this.expanded) this.window()?.setIgnoreMouseEvents(false);
    }, CLICK_GUARD);
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
    return current;
  }

  request(request: IslandRequest): void {
    if (request === 'open') this.ports.openApp();
    else this.ports.request(request);
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
    const next = await this.ports.layout();
    const target = this.window();
    if (!next || !target) return;
    this.layout = next;
    target.setBounds(next.window);
    this.send('island:state', this.snapshot());
  }

  close(): void {
    this.lifecycle.cancel();
    this.clickGuard.cancel();
    this.hover?.stop();
    this.hover = null;
    this.window()?.destroy();
    this.current = null;
    this.layout = null;
    this.expanded = false;
  }

  private follow({ state }: RecordingSnapshot): void {
    if (this.window()) this.send('island:state', this.snapshot());
    if (state.recording !== Boolean(this.current)) this.lifecycle.call();
  }

  private settle(): void {
    if (!this.ports.hub.current().state.recording) return this.close();
    if (!this.current && !this.opening) this.open().catch(report('opening failed'));
  }

  private async open(): Promise<void> {
    this.opening = true;
    this.stale = false;
    try {
      const next = await this.ports.layout();
      if (!next || !this.ports.hub.current().state.recording) return;
      this.layout = next;
      this.current = this.ports.openWindow(next);
      this.watch(this.current);
      this.hover = this.ports.startHover(
        () => this.area(),
        (expanded) => this.setExpanded(expanded),
      );
    } finally {
      this.opening = false;
    }
    // The screens changed while they were read: read them again for the new window.
    if (this.stale) await this.screensChanged();
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
    const { state } = this.ports.hub.current();
    // The elapsed time at sending: the page counts on from its own reception.
    const recording = state.recording ? { ...state, elapsed: this.ports.hub.elapsed() } : state;
    return { recording, expanded: this.expanded, shape: this.layout.shape };
  }

  private send(channel: string, payload: unknown): void {
    const target = this.window();
    if (target && !target.webContents.isDestroyed()) target.webContents.send(channel, payload);
  }
}

export function createIsland(ports: IslandPorts): Island {
  return new IslandController(ports);
}
