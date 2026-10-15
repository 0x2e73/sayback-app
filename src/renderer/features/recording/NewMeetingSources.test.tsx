// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ok } from '../../test-api';
import { browser, mainScreen, openDialog, secondScreen } from './new-meeting-fixtures';

afterEach(cleanup);

const pressed = (element: HTMLElement) => element.getAttribute('aria-pressed');

it('groups the three sources as toggles', async () => {
  const { within: inDialog } = await openDialog();
  const group = inDialog.getByRole('group', { name: 'Sources' });
  expect(group).toContainElement(inDialog.getByRole('button', { name: 'Microphone' }));
  expect(group).toContainElement(inDialog.getByRole('button', { name: 'Son du système' }));
  expect(group).toContainElement(inDialog.getByRole('button', { name: 'Écran' }));
});

it('turns the system sound off with the screen and says the notes get no image', async () => {
  const { within: inDialog, user } = await openDialog();
  await user.click(inDialog.getByRole('button', { name: 'Écran' }));
  expect(pressed(inDialog.getByRole('button', { name: 'Son du système' }))).toBe('false');
  expect(inDialog.getByText('Sans écran, les notes n’auront pas d’image.')).toBeInTheDocument();
  expect(inDialog.queryByRole('button', { name: /Changer/ })).toBeNull();
});

it('brings the screen back when the system sound is asked for without it', async () => {
  const { within: inDialog, user } = await openDialog();
  await user.click(inDialog.getByRole('button', { name: 'Écran' }));
  await user.click(inDialog.getByRole('button', { name: 'Son du système' }));
  expect(pressed(inDialog.getByRole('button', { name: 'Écran' }))).toBe('true');
  expect(pressed(inDialog.getByRole('button', { name: 'Son du système' }))).toBe('true');
});

it('starts without a screen when the screen is off', async () => {
  const { within: inDialog, user, onStart, api, startButton } = await openDialog();
  await user.click(inDialog.getByRole('button', { name: 'Écran' }));
  await user.click(startButton);
  expect(api.selectSource).not.toHaveBeenCalled();
  expect(onStart).toHaveBeenCalledWith(
    expect.any(String),
    { screen: false, microphone: true, systemAudio: false, source: undefined },
    true,
  );
});

it('greys the start and warns when no sound source is left', async () => {
  const { within: inDialog, user, startButton } = await openDialog();
  await user.click(inDialog.getByRole('button', { name: 'Microphone' }));
  await user.click(inDialog.getByRole('button', { name: 'Son du système' }));
  expect(startButton).toBeDisabled();
  expect(inDialog.getByRole('alert')).toHaveTextContent(
    'Activez le microphone ou le son du système.',
  );
});

it('turns a blocked microphone off and points to the macOS settings', async () => {
  const open = vi.fn(() => ok(undefined));
  const {
    within: inDialog,
    user,
    startButton,
  } = await openDialog({
    getCapturePermission: (kind) => ok(kind === 'microphone' ? 'denied' : 'granted'),
    openMicrophoneSettings: open,
  });
  const chip = inDialog.getByRole('button', { name: 'Microphone' });
  await waitFor(() => expect(chip).toBeDisabled());
  expect(pressed(chip)).toBe('false');
  expect(inDialog.getByRole('alert')).toHaveTextContent(
    'Le microphone est bloqué dans les réglages macOS.',
  );
  expect(startButton).toBeEnabled();
  await user.click(inDialog.getByRole('button', { name: 'Ouvrir les réglages' }));
  expect(open).toHaveBeenCalledOnce();
});

it('lets the user go on without a screen the system refuses', async () => {
  const { within: inDialog, user } = await openDialog({
    getCapturePermission: (kind) => ok(kind === 'screen' ? 'denied' : 'granted'),
    getSources: () => ok([browser]),
  });
  expect(await inDialog.findByRole('alert')).toHaveTextContent(
    'SayBack n’a pas l’autorisation d’enregistrer l’écran.',
  );
  await user.click(inDialog.getByRole('button', { name: 'Continuer sans écran' }));
  expect(inDialog.queryByRole('alert')).toBeNull();
  expect(pressed(inDialog.getByRole('button', { name: 'Écran' }))).toBe('false');
});

it('trusts the list over a cached refusal: screens listed, nothing is blocked', async () => {
  const { within: inDialog, startButton } = await openDialog({
    getCapturePermission: () => ok('denied'),
  });
  await waitFor(() => expect(startButton).toBeEnabled());
  expect(inDialog.queryByText(/n’a pas l’autorisation/)).toBeNull();
});

it('blames the screen permission when the list itself failed', async () => {
  const { within: inDialog } = await openDialog({
    getCapturePermission: (kind) => ok(kind === 'screen' ? 'denied' : 'granted'),
    getSources: () => Promise.resolve({ ok: false, error: 'Impossible de lister les écrans.' }),
  });
  await waitFor(() =>
    expect(inDialog.getByText(/n’a pas l’autorisation d’enregistrer l’écran/)).toBeInTheDocument(),
  );
});

it('frees the microphone once the user has authorised it and come back', async () => {
  let status: 'denied' | 'granted' = 'denied';
  const { within: inDialog } = await openDialog({
    getCapturePermission: (kind) => ok(kind === 'microphone' ? status : 'granted'),
  });
  const chip = inDialog.getByRole('button', { name: 'Microphone' });
  await waitFor(() => expect(chip).toBeDisabled());
  status = 'granted';
  fireEvent(window, new Event('focus'));
  await waitFor(() => expect(chip).toBeEnabled());
  expect(pressed(chip)).toBe('true');
  expect(inDialog.queryByText(/microphone est bloqué/)).toBeNull();
});

it('reads the permission again when the page becomes visible', async () => {
  const getCapturePermission = vi.fn(() => ok('granted' as const));
  await openDialog({ getCapturePermission });
  const reads = getCapturePermission.mock.calls.length;
  document.dispatchEvent(new Event('visibilitychange'));
  await waitFor(() => expect(getCapturePermission.mock.calls.length).toBeGreaterThan(reads));
});

it('reads the permission again right after the macOS settings were opened', async () => {
  const getCapturePermission = vi.fn((kind: string) =>
    ok(kind === 'microphone' ? ('denied' as const) : ('granted' as const)),
  );
  const { within: inDialog, user } = await openDialog({ getCapturePermission });
  await waitFor(() =>
    expect(inDialog.getByRole('button', { name: 'Ouvrir les réglages' })).toBeInTheDocument(),
  );
  const reads = getCapturePermission.mock.calls.length;
  await user.click(inDialog.getByRole('button', { name: 'Ouvrir les réglages' }));
  await waitFor(() => expect(getCapturePermission.mock.calls.length).toBeGreaterThan(reads));
});

it('shows a skeleton while the sources load and keeps the start greyed', async () => {
  const { within: inDialog, startButton } = await openDialog({
    getSources: () => new Promise(() => {}),
  });
  expect(inDialog.getByRole('status')).toHaveTextContent('Recherche des écrans et fenêtres…');
  expect(startButton).toBeDisabled();
});

it('shows the failure of the list with a retry that lists again', async () => {
  const getSources = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, error: 'Impossible de lister les écrans.' })
    .mockResolvedValue({ ok: true, value: [mainScreen] });
  const { within: inDialog, user, startButton } = await openDialog({ getSources });
  expect(await inDialog.findByRole('alert')).toHaveTextContent('Impossible de lister les écrans.');
  expect(startButton).toBeDisabled();
  await user.click(inDialog.getByRole('button', { name: 'Réessayer' }));
  expect(await inDialog.findByText(mainScreen.name)).toBeInTheDocument();
  expect(startButton).toBeEnabled();
});

it('says when there is nothing to capture, refreshes, and still allows going without a screen', async () => {
  const getSources = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, value: [] })
    .mockResolvedValue({ ok: true, value: [secondScreen] });
  const { within: inDialog, user } = await openDialog({ getSources });
  expect(await inDialog.findByText('Aucun écran ni fenêtre détectés.')).toBeInTheDocument();
  expect(inDialog.getByRole('button', { name: 'Continuer sans écran' })).toBeInTheDocument();
  await user.click(inDialog.getByRole('button', { name: 'Actualiser' }));
  expect(await inDialog.findByText(secondScreen.name)).toBeInTheDocument();
});

it('unfolds the list under « Changer », then folds it on the choice and gives the focus back', async () => {
  const { within: inDialog, user, startButton } = await openDialog();
  const change = await inDialog.findByRole('button', { name: /Changer/ });
  expect(change).toHaveAttribute('aria-expanded', 'false');
  expect(inDialog.queryAllByRole('radio')).toHaveLength(0);
  await user.click(change);
  expect(change).toHaveAttribute('aria-expanded', 'true');
  await user.click(inDialog.getByText(secondScreen.name, { selector: '.source-name' }));
  expect(inDialog.queryAllByRole('radio')).toHaveLength(0);
  expect(change).toHaveFocus();
  expect(inDialog.getByText(secondScreen.name)).toBeInTheDocument();
  expect(startButton).toBeEnabled();
});

it('folds the list on the first Escape and closes on the second', async () => {
  const { within: inDialog, user, onClose, dialog } = await openDialog();
  await user.click(await inDialog.findByRole('button', { name: /Changer/ }));
  const cancel = () => fireEvent(dialog, new Event('cancel', { cancelable: true }));
  cancel();
  expect(inDialog.queryAllByRole('radio')).toHaveLength(0);
  expect(onClose).not.toHaveBeenCalled();
  cancel();
  expect(onClose).toHaveBeenCalledOnce();
});

it('does not swallow Escape once the list it folds is gone', async () => {
  const { within: inDialog, user, onClose, dialog } = await openDialog();
  await user.click(await inDialog.findByRole('button', { name: /Changer/ }));
  await user.click(inDialog.getByRole('button', { name: 'Écran' }));
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(onClose).toHaveBeenCalledOnce();
});

it('brings the screen back with its list folded', async () => {
  const { within: inDialog, user } = await openDialog();
  await user.click(await inDialog.findByRole('button', { name: /Changer/ }));
  await user.click(inDialog.getByRole('button', { name: 'Écran' }));
  await user.click(inDialog.getByRole('button', { name: 'Écran' }));
  expect(await inDialog.findByRole('button', { name: /Changer/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(inDialog.queryAllByRole('radio')).toHaveLength(0);
});

it('folds the list when the user goes on without a screen', async () => {
  const { within: inDialog, user } = await openDialog({
    getCapturePermission: (kind) => ok(kind === 'screen' ? 'denied' : 'granted'),
    getSources: () => ok([browser]),
  });
  await user.click(await inDialog.findByRole('button', { name: /Changer/ }));
  await user.click(inDialog.getByRole('button', { name: 'Continuer sans écran' }));
  await user.click(inDialog.getByRole('button', { name: 'Écran' }));
  expect(await inDialog.findByRole('button', { name: /Changer/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});
