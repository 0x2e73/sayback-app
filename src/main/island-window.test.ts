import { expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ BrowserWindow: vi.fn(), screen: {} }));

import { islandWindowOptions } from './island-window';

const bounds = { x: 600, y: 0, width: 600, height: 280 };

it('opens a borderless, transparent panel that never takes the focus', () => {
  expect(islandWindowOptions('/app/out/preload/island.cjs', bounds)).toMatchObject({
    ...bounds,
    frame: false,
    transparent: true,
    hasShadow: false,
    type: 'panel',
    focusable: false,
    acceptFirstMouse: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    enableLargerThanScreen: true,
    show: false,
  });
});

it('isolates the page and keeps its timers running in the background', () => {
  expect(islandWindowOptions('/app/out/preload/island.cjs', bounds).webPreferences).toEqual({
    preload: '/app/out/preload/island.cjs',
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    backgroundThrottling: false,
  });
});
