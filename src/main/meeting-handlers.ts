import { shell } from 'electron';
import {
  appearanceSchema,
  clarificationSchema,
  folderNameSchema,
  idSchema,
  settingsSchema,
  setupGuideSchema,
  timeSchema,
  titleSchema,
  validateMedia,
} from '../shared/validation';
import type { RegisterHandler } from './ipc';
import type { DesktopServices } from './services';
import { isLocalCompatibleUrl } from '../shared/compatible-url';
import type { Appearance } from '../shared/contracts';

const setupGuides = {
  whisper: 'https://github.com/0x2e73/sayback-app/blob/main/docs/local-setup.md',
  ollama: 'https://github.com/0x2e73/sayback-app/blob/main/docs/ollama.md',
} as const;

export function registerMeetingHandlers(handle: RegisterHandler, services: DesktopServices) {
  const { meetings, recordings, credentials } = services;
  handle('meetings:list', () => meetings.list());
  handle('meetings:create', (title) => meetings.create(titleSchema.parse(title)));
  handle('meetings:get', (id) => meetings.get(idSchema.parse(id)));
  handle('meetings:finish', (id, duration) =>
    meetings.finish(idSchema.parse(id), timeSchema.parse(duration)),
  );
  handle('meetings:process', (id) => {
    const settings = credentials.settings();
    if (!settings.model)
      throw new Error('Choisissez un modèle pour les notes dans les paramètres.');
    if (settings.transcriptionProvider === 'openai' || settings.notesProvider === 'openai') {
      credentials.key('openai');
    }
    if (settings.notesProvider === 'anthropic') credentials.key('anthropic');
    if (settings.transcriptionProvider === 'gemini' || settings.notesProvider === 'gemini')
      credentials.key('gemini');
    if (settings.notesProvider === 'compatible') {
      if (isLocalCompatibleUrl(settings.compatibleBaseUrl)) credentials.compatibleKey();
      else credentials.key('compatible');
    }
    return meetings.process(idSchema.parse(id));
  });
  handle('meetings:clarify', (id, at, text) => {
    const input = clarificationSchema.parse({ id, at, text });
    return meetings.clarify(input.id, input.at, input.text);
  });
  handle('meetings:delete', (id) => recordings.remove(idSchema.parse(id)));
  handle('media:save', (input) => recordings.save(validateMedia(input)));
}

export function registerFolderHandlers(handle: RegisterHandler, services: DesktopServices) {
  const { folders } = services;
  handle('folders:list', () => folders.list());
  handle('folders:create', (name) => folders.create(folderNameSchema.parse(name)));
  handle('folders:rename', (id, name) =>
    folders.rename(idSchema.parse(id), folderNameSchema.parse(name)),
  );
  handle('folders:delete', (id) => folders.delete(idSchema.parse(id)));
  handle('folders:move-meeting', (id, folderId) =>
    folders.move(idSchema.parse(id), folderId === null ? null : idSchema.parse(folderId)),
  );
}

// Opening a system pane twice a second is a stuck button, not a person.
const PRIVACY_PER_SECOND = 3;

const privacyPanes = { screen: 'Privacy_ScreenCapture', microphone: 'Privacy_Microphone' } as const;

/** Opens the system settings pane of one capture right; macOS only. */
export async function openPrivacyPane(kind: keyof typeof privacyPanes): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('Action disponible uniquement sur macOS.');
  await shell.openExternal(
    `x-apple.systempreferences:com.apple.preference.security?${privacyPanes[kind]}`,
  );
}

function handlePrivacyPane(
  handle: RegisterHandler,
  channel: string,
  kind: keyof typeof privacyPanes,
): void {
  handle(channel, () => openPrivacyPane(kind), ['main'], PRIVACY_PER_SECOND);
}

export function registerSettingsHandlers(
  handle: RegisterHandler,
  services: DesktopServices,
  root: string,
  applyAppearance: (value: Appearance) => void,
) {
  const { credentials, models } = services;
  handle('settings:get', () => credentials.settings());
  handle('onboarding:complete', () => credentials.completeOnboarding());
  handle('settings:list-models', (provider) =>
    models.list(settingsSchema.shape.notesProvider.parse(provider)),
  );
  handle('settings:save', (input) => {
    return credentials.save(settingsSchema.parse(input));
  });
  handle('settings:clear-key', (provider) =>
    credentials.clear(settingsSchema.shape.notesProvider.exclude(['ollama']).parse(provider)),
  );
  handlePrivacyPane(handle, 'privacy:open-screen-settings', 'screen');
  handlePrivacyPane(handle, 'privacy:open-microphone-settings', 'microphone');
  handle('setup:check', () => services.localSetup.check());
  handle('setup:open-guide', (guide) =>
    shell.openExternal(setupGuides[setupGuideSchema.parse(guide)]),
  );
  handle('settings:set-appearance', (value) => {
    const appearance = appearanceSchema.parse(value);
    credentials.setAppearance(appearance);
    applyAppearance(appearance);
  });
  handle('data:open', async () => {
    const error = await shell.openPath(root);
    if (error) throw new Error('Le dossier ne peut pas être ouvert.');
  });
}
