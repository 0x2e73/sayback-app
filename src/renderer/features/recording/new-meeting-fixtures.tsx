import { vi } from 'vitest';
import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CaptureSource, DesktopApi } from '../../../shared/contracts';
import { newMeetingDialog } from '../../new-meeting-harness';
import { apiFor, ok, settings } from '../../test-api';
import { NewMeetingDialog } from './NewMeetingDialog';

const thumbnail = 'data:image/png;base64,a';
export const mainScreen: CaptureSource = {
  id: 'screen:1:0',
  name: 'Écran 1',
  thumbnail,
  primary: true,
};
export const secondScreen: CaptureSource = { id: 'screen:2:0', name: 'Écran 2', thumbnail };
export const browser: CaptureSource = { id: 'window:7:0', name: 'Navigateur', thumbnail };

/** An api for the dialog: analysis configured, the two screens on offer, nothing blocked. */
export function dialogApi(changes: Partial<DesktopApi> = {}): DesktopApi {
  return {
    ...apiFor(),
    getSettings: () => ok({ ...settings, hasOpenAiKey: true }),
    getSources: () => ok([mainScreen, secondScreen, browser]),
    selectSource: vi.fn(() => ok(undefined)),
    setCapturePrefs: vi.fn(() => ok(undefined)),
    ...changes,
  };
}

export async function openDialog(changes: Partial<DesktopApi> = {}) {
  const api = dialogApi(changes);
  const onStart = vi.fn(() => Promise.resolve());
  const onClose = vi.fn();
  const onConfigure = vi.fn();
  const user = userEvent.setup();
  render(
    <NewMeetingDialog api={api} onStart={onStart} onClose={onClose} onConfigure={onConfigure} />,
  );
  const dialog = await newMeetingDialog();
  const startButton = within(dialog).getByRole('button', { name: 'Démarrer l’enregistrement' });
  return { api, onStart, onClose, onConfigure, user, dialog, within: within(dialog), startButton };
}
