// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ok } from '../../test-api';
import { browser, mainScreen, openDialog, secondScreen } from './new-meeting-fixtures';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 11, 0));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const everything = { microphone: true, systemAudio: true, screen: true, autoAnalyze: true };

it('opens on a title that is already there, selected and focused', async () => {
  const { within: inDialog } = await openDialog();
  const title = inDialog.getByLabelText('Titre') as HTMLInputElement;
  expect(title).toHaveValue('Réunion du 15 octobre, 11 h 00');
  expect(title).toHaveFocus();
  expect([title.selectionStart, title.selectionEnd]).toEqual([0, title.value.length]);
});

it('starts with the default title when the title is emptied', async () => {
  const { within: inDialog, user, onStart, startButton } = await openDialog();
  await user.clear(inDialog.getByLabelText('Titre'));
  await user.click(startButton);
  expect(onStart).toHaveBeenCalledWith(
    'Réunion du 15 octobre, 11 h 00',
    expect.objectContaining({ screen: true, microphone: true, systemAudio: true }),
    true,
  );
});

it('starts with the typed title, the main screen and the habits', async () => {
  const { within: inDialog, user, onStart, api, startButton } = await openDialog();
  await user.clear(inDialog.getByLabelText('Titre'));
  await user.type(inDialog.getByLabelText('Titre'), 'Revue du vendredi');
  await user.click(startButton);
  expect(api.selectSource).toHaveBeenCalledWith('screen:1:0', true);
  expect(onStart).toHaveBeenCalledWith(
    'Revue du vendredi',
    { screen: true, microphone: true, systemAudio: true, source: mainScreen },
    true,
  );
});

it('submits the form around the title from the button of its footer', async () => {
  // jsdom cannot press Enter in a field: the browser submits through this very button.
  const { startButton, dialog } = await openDialog();
  expect(startButton).toHaveAttribute('type', 'submit');
  expect(dialog.querySelector(`form#${startButton.getAttribute('form')}`)).not.toBeNull();
});

it('starts on Cmd+Enter from anywhere in the dialog', async () => {
  const { onStart, startButton, within: inDialog } = await openDialog();
  await waitFor(() => expect(startButton).toBeEnabled());
  inDialog.getByRole('button', { name: 'Annuler' }).focus();
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Enter', metaKey: true });
  await waitFor(() => expect(onStart).toHaveBeenCalledOnce());
});

it('sends once however many times it is asked', async () => {
  let release: () => void = () => {};
  const { user, onStart, startButton, within: inDialog } = await openDialog();
  onStart.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
  await user.click(startButton);
  await user.click(startButton);
  fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });
  expect(onStart).toHaveBeenCalledOnce();
  expect(startButton).toHaveAttribute('aria-busy', 'true');
  expect(inDialog.getByLabelText('Titre')).toBeDisabled();
  expect(inDialog.getByRole('button', { name: 'Annuler' })).toBeDisabled();
  release();
});

it('remembers the choices only once the recording has started', async () => {
  const { user, api, onStart, within: inDialog, startButton } = await openDialog();
  await user.click(inDialog.getByRole('button', { name: 'Microphone' }));
  await user.click(inDialog.getByRole('switch', { name: /Lancer l’analyse/ }));
  await user.click(startButton);
  await waitFor(() =>
    expect(api.setCapturePrefs).toHaveBeenCalledWith({
      microphone: false,
      systemAudio: true,
      screen: true,
      autoAnalyze: false,
      screenId: 'screen:1:0',
    }),
  );
  expect(onStart).toHaveBeenCalledWith('Réunion du 15 octobre, 11 h 00', expect.anything(), false);
});

it('remembers nothing when it is closed without starting', async () => {
  const { user, api, onClose, within: inDialog } = await openDialog();
  await user.click(inDialog.getByRole('button', { name: 'Microphone' }));
  await user.click(inDialog.getByRole('button', { name: 'Annuler' }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(api.setCapturePrefs).not.toHaveBeenCalled();
});

it('shows a refused start at the top and lets the user try again', async () => {
  const { user, api, onStart, within: inDialog, startButton } = await openDialog();
  onStart.mockRejectedValueOnce(new Error('Capture refusée'));
  await user.click(startButton);
  expect(await inDialog.findByRole('alert')).toHaveTextContent('Capture refusée');
  expect(api.setCapturePrefs).not.toHaveBeenCalled();
  expect(inDialog.getByLabelText('Titre')).toBeEnabled();
  await user.click(startButton);
  expect(onStart).toHaveBeenCalledTimes(2);
});

it('offers the remembered habits and the remembered screen', async () => {
  const { within: inDialog } = await openDialog({
    getCapturePrefs: () =>
      ok({ ...everything, microphone: false, autoAnalyze: false, screenId: 'screen:2:0' }),
  });
  await waitFor(() => expect(inDialog.getByText(secondScreen.name)).toBeInTheDocument());
  expect(inDialog.getByRole('button', { name: 'Microphone' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(inDialog.getByRole('button', { name: 'Écran' })).toHaveAttribute('aria-pressed', 'true');
  expect(inDialog.getByRole('switch', { name: /Lancer l’analyse/ })).not.toBeChecked();
});

it('falls back to the main screen when the remembered one is gone', async () => {
  const {
    within: inDialog,
    startButton,
    user,
    api,
  } = await openDialog({
    getCapturePrefs: () => ok({ ...everything, screenId: 'screen:9:0' }),
  });
  await waitFor(() => expect(startButton).toBeEnabled());
  expect(inDialog.getByText(mainScreen.name)).toBeInTheDocument();
  await user.click(startButton);
  expect(api.selectSource).toHaveBeenCalledWith('screen:1:0', true);
});

it('never remembers a window, only the screen that was there', async () => {
  const {
    within: inDialog,
    user,
    api,
    startButton,
  } = await openDialog({
    getCapturePrefs: () => ok({ ...everything, screenId: 'screen:2:0' }),
  });
  await user.click(await inDialog.findByRole('button', { name: /Changer/ }));
  await user.click(inDialog.getByText(browser.name));
  await user.click(startButton);
  await waitFor(() => expect(api.setCapturePrefs).toHaveBeenCalled());
  expect(api.setCapturePrefs).toHaveBeenCalledWith(
    expect.objectContaining({ screenId: 'screen:2:0' }),
  );
});

it('has the analysis switch when configured and a way to configure it otherwise', async () => {
  const {
    within: inDialog,
    user,
    onConfigure,
    onClose,
  } = await openDialog({
    getSettings: async () => ({
      ok: true,
      value: {
        notesProvider: 'openai',
        transcriptionProvider: 'openai',
        hasOpenAiKey: false,
        hasAnthropicKey: false,
        hasGeminiKey: false,
        hasCompatibleKey: false,
        compatibleBaseUrl: '',
        whisperModelPath: '',
        model: 'gpt-4.1-mini',
        onboardingCompleted: true,
        appearance: 'system',
      },
    }),
  });
  expect(inDialog.queryByRole('switch')).toBeNull();
  expect(
    inDialog.getByText(/Analyse non configurée. L’enregistrement reste local./),
  ).toBeInTheDocument();
  await user.click(inDialog.getByRole('button', { name: 'Configurer' }));
  expect(onConfigure).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
});

it('no longer carries the old copy', async () => {
  const { dialog } = await openDialog();
  for (const gone of ['Choisir ce qui sera visible', '2 heures', 'Un titre, vos sources']) {
    expect(dialog).not.toHaveTextContent(gone);
  }
});

it('names an untouched title after the minute the recording starts', async () => {
  const { user, onStart, startButton } = await openDialog();
  await waitFor(() => expect(startButton).toBeEnabled());
  vi.setSystemTime(new Date(2026, 9, 15, 11, 23));
  await user.click(startButton);
  expect(onStart).toHaveBeenCalledWith('Réunion du 15 octobre, 11 h 23', expect.anything(), true);
});

it('keeps a typed title as it was typed, whatever the time', async () => {
  const { user, onStart, within: inDialog, startButton } = await openDialog();
  await user.clear(inDialog.getByLabelText('Titre'));
  await user.type(inDialog.getByLabelText('Titre'), 'Point client');
  vi.setSystemTime(new Date(2026, 9, 15, 11, 40));
  await user.click(startButton);
  expect(onStart).toHaveBeenCalledWith('Point client', expect.anything(), true);
});

it('stays shut until the habits are read, then takes the focus on the title', async () => {
  let release: () => void = () => {};
  const habits = new Promise<void>((resolve) => (release = resolve));
  const { within: inDialog, startButton } = await openDialog({
    getCapturePrefs: async () => {
      await habits;
      return { ok: true, value: everything };
    },
  });
  expect(inDialog.getByLabelText('Titre')).toBeDisabled();
  expect(inDialog.getByRole('button', { name: 'Microphone' })).toBeDisabled();
  expect(startButton).toBeDisabled();
  release();
  await waitFor(() => expect(inDialog.getByLabelText('Titre')).toBeEnabled());
  expect(inDialog.getByLabelText('Titre')).toHaveFocus();
});
