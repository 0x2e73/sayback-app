import { Menu, Tray, nativeImage } from 'electron';
import { readFileSync } from 'node:fs';
import icon from './assets/trayTemplate.png?asset';
import icon2x from './assets/trayTemplate@2x.png?asset';
import { createMenuBar, type MenuBar, type TrayPort } from './menu-bar';
import type { MenuBarActions } from './menu-bar-menu';

// ?asset makes the build copy the files into out/ and gives their runtime path, packaged or not.
// Each density is added by hand: the copies are renamed, so the @2x pairing by name is lost.
function trayImage() {
  const image = nativeImage.createEmpty();
  image.addRepresentation({ scaleFactor: 1, buffer: readFileSync(icon) });
  image.addRepresentation({ scaleFactor: 2, buffer: readFileSync(icon2x) });
  image.setTemplateImage(true);
  return image;
}

function createTray(): TrayPort {
  const tray = new Tray(trayImage());
  tray.setToolTip('SayBack');
  return {
    setTitle: (title) => tray.setTitle(title),
    popUpContextMenu: (menu) => {
      if (menu instanceof Menu) tray.popUpContextMenu(menu);
    },
    on: (event, listener) =>
      event === 'click' ? tray.on('click', listener) : tray.on('right-click', listener),
    destroy: () => tray.destroy(),
  };
}

// The menu bar exists on macOS only. A left click opens the island, a right click the menu.
export function createElectronMenuBar(
  actions: MenuBarActions,
  onClick: () => void,
): MenuBar | null {
  if (process.platform !== 'darwin') return null;
  return createMenuBar({
    createTray,
    buildMenu: (template) => Menu.buildFromTemplate(template),
    actions,
    onClick,
  });
}
