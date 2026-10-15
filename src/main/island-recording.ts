import type { IslandScreen } from '../shared/island';
import { tilesOf, type ListedScreen } from './island-ready';

export interface RecordingScreenPorts {
  /** Empty when the screens cannot be listed. */
  screens(): Promise<ListedScreen[]>;
  /** Hands the screen to the main page, which switches its capture; false when it could not. */
  switchScreen(screenId: string): Promise<boolean>;
}

/** The island shows it for 4 s; the capture goes on with the screen it had. */
export const SWITCH_FAILED = 'Changement impossible.';

/** The screens the recording island may switch to: read at its opening and when they change. */
export class RecordingScreens {
  private disposed = false;

  constructor(
    private readonly ports: RecordingScreenPorts,
    private tiles: IslandScreen[] = [],
  ) {}

  /** Shown at once without tiles: `listed` runs once the screens are read. */
  static open(ports: RecordingScreenPorts, listed: () => void): RecordingScreens {
    const screens = new RecordingScreens(ports);
    screens
      .refresh()
      .then(listed)
      .catch((error: unknown) => console.error('[island] listing the screens failed', error));
    return screens;
  }

  list(): IslandScreen[] {
    return this.tiles;
  }

  async refresh(): Promise<void> {
    const screens = await this.ports.screens();
    if (!this.disposed) this.tiles = tilesOf(screens);
  }

  async select(screenId: string): Promise<void> {
    if (this.disposed) return;
    if (!(await this.ports.switchScreen(screenId))) throw new Error(SWITCH_FAILED);
  }

  dispose(): void {
    this.disposed = true;
  }
}
