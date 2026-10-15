import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import type { MeetingMenuChoice, Result } from '../shared/contracts';

type Event = { sender: unknown; senderFrame: unknown };
type PopupOptions = { window: unknown; x?: number; y?: number; callback: () => void };

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  templates: [] as MenuItemConstructorOptions[][],
  popup: vi.fn<(options: PopupOptions) => void>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      electron.handlers.set(channel, handler);
    },
    on: vi.fn(),
  },
  Menu: {
    buildFromTemplate: (template: MenuItemConstructorOptions[]) => {
      electron.templates.push(template);
      return { popup: electron.popup };
    },
  },
}));

import { createIpcRegistrar } from './ipc';
import { registerMeetingMenu } from './meeting-menu';
import { createWindowRoles } from './window-roles';

function fakeWindow() {
  const mainFrame = { name: 'top' };
  return { webContents: { mainFrame }, isDestroyed: () => false };
}

const main = fakeWindow();
const island = fakeWindow();
let time = 0;
const from = (window: ReturnType<typeof fakeWindow>): Event => ({
  sender: window.webContents,
  senderFrame: window.webContents.mainFrame,
});
const invoke = (event: Event, ...args: unknown[]) =>
  (
    electron.handlers.get('meeting:context-menu') as (
      e: Event,
      ...a: unknown[]
    ) => Promise<Result<MeetingMenuChoice>>
  )(event, ...args);

const meetingId = '11111111-1111-4111-8111-111111111111';
const acme = '22222222-2222-4222-8222-222222222222';
const projet = '33333333-3333-4333-8333-333333333333';
const request = {
  meetingId,
  folders: [
    { id: acme, name: 'Acme' },
    { id: projet, name: 'Projet' },
  ],
  folderId: acme,
  disabled: false,
};

function menu(): MenuItemConstructorOptions[] {
  return electron.templates.at(-1) ?? [];
}
function moveSubmenu(): MenuItemConstructorOptions[] {
  return menu()[0]?.submenu as MenuItemConstructorOptions[];
}

let hasWindow = true;

beforeEach(() => {
  electron.handlers.clear();
  electron.templates.length = 0;
  electron.popup.mockReset();
  hasWindow = true;
  time = 0;
  const roles = createWindowRoles({ main: () => main, island: () => island });
  registerMeetingMenu(createIpcRegistrar(roles, () => time).handle, () =>
    hasWindow ? (main as never) : null,
  );
});

describe('the meeting row menu', () => {
  it('moves to a folder, with the current one checked and « Aucun dossier » last', async () => {
    const answer = invoke(from(main), request);
    await vi.waitFor(() => expect(electron.popup).toHaveBeenCalled());
    expect(menu().map((item) => item.label ?? item.type)).toEqual([
      'Déplacer vers',
      'separator',
      'Supprimer…',
    ]);
    expect(moveSubmenu().map((item) => [item.label ?? item.type, item.checked])).toEqual([
      ['Acme', true],
      ['Projet', false],
      ['separator', undefined],
      ['Aucun dossier', false],
    ]);
    moveSubmenu()[1]?.click?.({} as never, undefined, {} as never);
    expect(await answer).toEqual({ ok: true, value: { kind: 'move', folderId: projet } });
  });

  it('checks « Aucun dossier » for a meeting without a folder and moves to none', async () => {
    const answer = invoke(from(main), { ...request, folderId: null });
    await vi.waitFor(() => expect(electron.popup).toHaveBeenCalled());
    const none = moveSubmenu().at(-1);
    expect(none?.checked).toBe(true);
    none?.click?.({} as never, undefined, {} as never);
    expect(await answer).toEqual({ ok: true, value: { kind: 'move', folderId: null } });
  });

  it('answers a deletion without deleting anything', async () => {
    const answer = invoke(from(main), request);
    await vi.waitFor(() => expect(electron.popup).toHaveBeenCalled());
    menu()[2]?.click?.({} as never, undefined, {} as never);
    expect(await answer).toEqual({ ok: true, value: { kind: 'delete' } });
  });

  it('answers null when the menu is dismissed', async () => {
    const answer = invoke(from(main), request);
    await vi.waitFor(() => expect(electron.popup).toHaveBeenCalled());
    electron.popup.mock.calls[0]?.[0].callback();
    expect(await answer).toEqual({ ok: true, value: null });
  });

  it('keeps the click when the close callback comes first', async () => {
    const answer = invoke(from(main), request);
    await vi.waitFor(() => expect(electron.popup).toHaveBeenCalled());
    electron.popup.mock.calls[0]?.[0].callback();
    menu()[2]?.click?.({} as never, undefined, {} as never);
    expect(await answer).toEqual({ ok: true, value: { kind: 'delete' } });
  });

  it('shows both actions disabled for a meeting that cannot change', async () => {
    void invoke(from(main), { ...request, disabled: true });
    await vi.waitFor(() => expect(electron.popup).toHaveBeenCalled());
    expect(menu()[0]?.enabled).toBe(false);
    expect(menu()[2]?.enabled).toBe(false);
  });

  it('opens at the given place and attaches to the window', async () => {
    void invoke(from(main), { ...request, at: { x: 40, y: 120 } });
    await vi.waitFor(() => expect(electron.popup).toHaveBeenCalled());
    expect(electron.popup.mock.calls[0]?.[0]).toMatchObject({ window: main, x: 40, y: 120 });
  });

  it('doubles the ampersands of folder names so they are shown', async () => {
    const folders = [
      { id: acme, name: 'R&D' },
      { id: projet, name: 'A&&B' },
    ];
    void invoke(from(main), { ...request, folders });
    await vi.waitFor(() => expect(electron.popup).toHaveBeenCalled());
    expect(moveSubmenu().map((item) => item.label)).toEqual([
      'R&&D',
      'A&&&&B',
      undefined,
      'Aucun dossier',
    ]);
  });

  it('offers only « Aucun dossier » when there is no folder', async () => {
    void invoke(from(main), { ...request, folders: [], folderId: null });
    await vi.waitFor(() => expect(electron.popup).toHaveBeenCalled());
    expect(moveSubmenu().map((item) => item.label)).toEqual(['Aucun dossier']);
  });

  it.each([
    ['a meeting id that is not an identifier', { ...request, meetingId: 'x' }],
    ['a folder without an identifier', { ...request, folders: [{ id: 'x', name: 'A' }] }],
    ['a current folder that is not an identifier', { ...request, folderId: 'x' }],
    ['a missing disabled flag', { ...request, disabled: undefined }],
    ['a place off the window', { ...request, at: { x: -1, y: 0 } }],
    ['nothing', undefined],
  ])('refuses %s without opening a menu', async (_name, input) => {
    expect(await invoke(from(main), input)).toEqual({
      ok: false,
      error: 'Vérifiez les informations saisies.',
    });
    expect(electron.popup).not.toHaveBeenCalled();
  });

  it('refuses a window that is not the main one', async () => {
    expect(await invoke(from(island), request)).toEqual({ ok: false, error: 'Accès refusé.' });
    expect(electron.popup).not.toHaveBeenCalled();
  });

  it('answers null when the main window is gone', async () => {
    hasWindow = false;
    expect(await invoke(from(main), request)).toEqual({ ok: true, value: null });
  });

  it('refuses menus asked faster than five a second', async () => {
    for (let call = 0; call < 5; call += 1) void invoke(from(main), request);
    const sixth = await invoke(from(main), request);
    expect(sixth.ok).toBe(false);
    time = 1_000;
    void invoke(from(main), request);
    await vi.waitFor(() => expect(electron.popup).toHaveBeenCalledTimes(6));
  });
});
