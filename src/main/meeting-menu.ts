import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { MeetingMenuChoice, MeetingMenuRequest } from '../shared/contracts';
import { meetingMenuRequestSchema } from '../shared/validation';
import type { RegisterHandler } from './ipc';

// A menu opened several times a second is a stuck key, not a person.
const MENU_PER_SECOND = 5;

type Choose = (choice: MeetingMenuChoice) => void;

// A lone `&` marks a mnemonic in a native label and would vanish: it is doubled to be shown.
export function menuLabel(name: string): string {
  return name.replace(/&/g, '&&');
}

function moveItems(request: MeetingMenuRequest, choose: Choose): MenuItemConstructorOptions[] {
  const folders = request.folders.map((folder): MenuItemConstructorOptions => ({
    label: menuLabel(folder.name),
    type: 'checkbox',
    checked: folder.id === request.folderId,
    click: () => choose({ kind: 'move', folderId: folder.id }),
  }));
  const none: MenuItemConstructorOptions = {
    label: 'Aucun dossier',
    type: 'checkbox',
    checked: request.folderId === null,
    click: () => choose({ kind: 'move', folderId: null }),
  };
  return folders.length === 0 ? [none] : [...folders, { type: 'separator' }, none];
}

/** The menu of one row; `choose` receives the action picked, if any. */
export function meetingMenuTemplate(
  request: MeetingMenuRequest,
  choose: Choose,
): MenuItemConstructorOptions[] {
  const enabled = !request.disabled;
  return [
    { label: 'Déplacer vers', enabled, submenu: moveItems(request, choose) },
    { type: 'separator' },
    { label: 'Supprimer…', enabled, click: () => choose({ kind: 'delete' }) },
  ];
}

function popUpMeetingMenu(
  window: BrowserWindow,
  request: MeetingMenuRequest,
): Promise<MeetingMenuChoice> {
  return new Promise((resolve) => {
    const menu = Menu.buildFromTemplate(meetingMenuTemplate(request, resolve));
    // Whether the click or the close callback comes first is the system's call: the click wins.
    const dismissed = () => setImmediate(() => resolve(null));
    menu.popup({ window, ...request.at, callback: dismissed });
  });
}

/** The system menu of a meeting row. It changes nothing: the page runs the action chosen. */
export function registerMeetingMenu(
  handle: RegisterHandler,
  getWindow: () => BrowserWindow | null,
): void {
  handle(
    'meeting:context-menu',
    (input) => {
      const request = meetingMenuRequestSchema.parse(input);
      const window = getWindow();
      return window ? popUpMeetingMenu(window, request) : null;
    },
    ['main'],
    MENU_PER_SECOND,
  );
}
