import { BrowserWindow, dialog } from 'electron';
import { join } from 'node:path';
import { relayFullScreen } from './full-screen';
import { windowChrome } from './window-chrome';

interface WindowOptions {
  rendererUrl: string;
  isRecording(): boolean;
}

export function createWindow({ rendererUrl, isRecording }: WindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: 1320,
    height: 870,
    minWidth: 900,
    minHeight: 650,
    title: 'SayBack',
    ...windowChrome(process.platform),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  relayFullScreen(window);
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== rendererUrl) event.preventDefault();
  });
  window.on('close', (event) => {
    if (!isRecording()) return;
    event.preventDefault();
    void dialog.showMessageBox(window, {
      type: 'info',
      message: 'Arrêtez l’enregistrement avant de fermer SayBack.',
      buttons: ['Revenir à la réunion'],
    });
  });
  void window.loadURL(rendererUrl);
  return window;
}
