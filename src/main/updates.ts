import { app, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { UpdateService } from '../backend/application/updates';
import { localUpdatePorts } from '../backend/infrastructure/local-updates';
import { APP_NAME, BUILD_INFO_FILE_NAME } from '../shared/update-channel';
import { confirmUpdateInstall } from './update-dialog';

interface UpdateWiring {
  getWindow(): BrowserWindow | null;
  isRecording(): boolean;
}

/** The local update channel lives in `appData/SayBack`, independent of the data folder. */
export function createUpdateService({ getWindow, isRecording }: UpdateWiring): UpdateService {
  return new UpdateService({
    ...localUpdatePorts({
      channelRoot: join(app.getPath('appData'), APP_NAME),
      // `out/build-info.json`, next to `out/main/`, inside app.asar once packaged.
      buildInfoPath: join(import.meta.dirname, '..', BUILD_INFO_FILE_NAME),
      exePath: app.getPath('exe'),
    }),
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    isRecording,
    confirmInstall: (update) => confirmUpdateInstall(getWindow(), update),
    quit: () => app.quit(),
    publish: (status) => {
      const window = getWindow();
      if (window && !window.isDestroyed()) window.webContents.send('updates:changed', status);
    },
  });
}
