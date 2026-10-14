import { dialog, type BrowserWindow } from 'electron';
import type { UpdateInfo } from '../shared/contracts';

const INSTALL = 0;
const LATER = 1;

/**
 * The consent the renderer cannot give on its own: a native question from the main process,
 * attached to the window when there is one.
 */
export async function confirmUpdateInstall(
  window: BrowserWindow | null,
  update: UpdateInfo,
): Promise<boolean> {
  const builtAt = new Date(update.builtAt).toLocaleString('fr-CH', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const options = {
    type: 'question' as const,
    message: `Installer SayBack ${update.version} ?`,
    detail: `Commit ${update.commit.slice(0, 12)}, construit le ${builtAt}.`,
    buttons: ['Installer et redémarrer', 'Plus tard'],
    defaultId: INSTALL,
    cancelId: LATER,
  };
  const usable = window !== null && !window.isDestroyed();
  const { response } = usable
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
  return response === INSTALL;
}
