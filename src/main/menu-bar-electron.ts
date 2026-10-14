import { Menu, Tray, nativeImage } from 'electron';
import { readFileSync } from 'node:fs';
import icon from './assets/trayTemplate.png?asset';
import icon2x from './assets/trayTemplate@2x.png?asset';
import { createMenuBar, type MenuBar } from './menu-bar';
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

// The menu bar exists on macOS only.
export function createElectronMenuBar(actions: MenuBarActions): MenuBar | null {
  if (process.platform !== 'darwin') return null;
  return createMenuBar({
    createTray: () => {
      const tray = new Tray(trayImage());
      tray.setToolTip('SayBack');
      return tray;
    },
    buildMenu: (template) => Menu.buildFromTemplate(template),
    actions,
  });
}
