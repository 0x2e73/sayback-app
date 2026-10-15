// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { opened, readySnapshot, recordingSnapshot, shown, twoScreens } from './island-fixture';
import { stubImageUrls } from './island-media.test-support';
import { PICKED_HOLD } from './use-screen-picker';
import { SWITCH_FAILURE_SHOWN } from './use-screen-switch';

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const tile = (name: string) => screen.getByRole('radio', { name });
const picker = () => screen.queryByRole('radiogroup', { name: 'Écran à enregistrer' });
const flush = () => act(async () => {});

let media: ReturnType<typeof stubImageUrls>;
beforeEach(() => {
  vi.useFakeTimers();
  media = stubImageUrls();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the picker of the ready island', () => {
  it('replaces the sources with a tile per screen, the current one checked', async () => {
    const island = await opened(readySnapshot());
    press('Changer d’écran');
    expect(picker()).toBeInTheDocument();
    expect(tile('Écran 1')).toHaveAttribute('aria-checked', 'true');
    expect(tile('Écran 2')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('button', { name: 'Microphone' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Démarrer' })).toBeInTheDocument();
    expect(island.screenThumbnails).toHaveBeenCalledOnce();
    expect(tile('Écran 1')).toHaveFocus();
  });

  it('moves the check to a picked screen, tells main, and closes 180 ms later', async () => {
    const island = await opened(readySnapshot());
    press('Changer d’écran');
    fireEvent.click(tile('Écran 2'));
    expect(tile('Écran 2')).toHaveAttribute('aria-checked', 'true');
    expect(island.request).toHaveBeenCalledWith({ type: 'select-screen', screenId: 'screen:2:0' });
    await act(async () => vi.advanceTimersByTime(PICKED_HOLD - 1));
    expect(picker()).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(1));
    expect(picker()).not.toBeInTheDocument();
    island.push(readySnapshot({ screen: twoScreens[1]! }));
    expect(screen.getByText('Écran 2 sélectionné')).toBeInTheDocument();
  });

  it('closes at once on the current screen, on ‹ and on Escape, before the island', async () => {
    const island = await opened(readySnapshot());
    press('Changer d’écran');
    fireEvent.click(tile('Écran 1'));
    expect(picker()).not.toBeInTheDocument();
    press('Changer d’écran');
    press('Retour');
    expect(picker()).not.toBeInTheDocument();
    press('Changer d’écran');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(picker()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Changer d’écran' })).toHaveFocus();
    expect(island.request).not.toHaveBeenCalledWith('close');
    expect(island.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'select-screen' }),
    );
  });

  it('asks main to close on Escape once the picker is closed', async () => {
    const island = await opened(readySnapshot());
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(island.request).not.toHaveBeenCalledWith('close');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(island.request).toHaveBeenLastCalledWith('close');
  });

  it('moves the focus with the arrows without picking', async () => {
    const island = await opened(readySnapshot());
    press('Changer d’écran');
    fireEvent.keyDown(tile('Écran 1'), { key: 'ArrowRight' });
    expect(tile('Écran 2')).toHaveFocus();
    fireEvent.keyDown(tile('Écran 2'), { key: 'ArrowRight' });
    expect(tile('Écran 2')).toHaveFocus();
    fireEvent.keyDown(tile('Écran 2'), { key: 'ArrowLeft' });
    expect(tile('Écran 1')).toHaveFocus();
    expect(island.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'select-screen' }),
    );
  });

  it('starts on the screen just picked, before main has answered the pick', async () => {
    const island = await opened(readySnapshot());
    press('Changer d’écran');
    fireEvent.click(tile('Écran 2'));
    await act(async () => vi.advanceTimersByTime(PICKED_HOLD));
    expect(screen.getByText('Écran 2')).toBeInTheDocument();
    press('Démarrer');
    expect(island.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'start',
        selection: expect.objectContaining({ screenId: 'screen:2:0' }),
      }),
    );
  });

  it('closes when fewer than two screens remain', async () => {
    const island = await opened(readySnapshot());
    press('Changer d’écran');
    island.push(readySnapshot({ screens: [twoScreens[0]!] }));
    expect(picker()).not.toBeInTheDocument();
  });

  it('closes when a start begins', async () => {
    await opened(readySnapshot());
    press('Changer d’écran');
    press('Démarrer');
    expect(picker()).not.toBeInTheDocument();
  });

  it('shows the thumbnails once read, an icon for a missing one, and lets them go on close', async () => {
    const island = await opened(readySnapshot());
    island.screenThumbnails.mockResolvedValueOnce({
      ok: true,
      value: [{ id: 'screen:1:0', jpeg: new Uint8Array([255, 216]) }],
    });
    press('Changer d’écran');
    expect(tile('Écran 1').querySelector('img')).not.toBeInTheDocument();
    await flush();
    expect(tile('Écran 1').querySelector('img')).toHaveAttribute('src', 'blob:frame-1');
    expect(tile('Écran 2').querySelector('img')).not.toBeInTheDocument();
    expect(tile('Écran 2').querySelector('svg')).toBeInTheDocument();
    press('Retour');
    expect(media.revoke).toHaveBeenCalledWith('blob:frame-1');
  });
});

describe('the picker of the recording island', () => {
  it('offers « Changer d’écran » left of the actions with a captured screen and another one', async () => {
    const island = await shown(recordingSnapshot());
    const button = screen.getByRole('button', { name: 'Changer d’écran' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(tile('Écran 1')).toHaveAttribute('aria-checked', 'true');
    expect(tile('Écran 1')).not.toHaveFocus();
    island.push(recordingSnapshot({ sourceId: undefined }));
    expect(screen.queryByRole('button', { name: 'Changer d’écran' })).not.toBeInTheDocument();
    island.push(recordingSnapshot({}, [twoScreens[0]!]));
    expect(screen.queryByRole('button', { name: 'Changer d’écran' })).not.toBeInTheDocument();
  });

  it('asks main for the switch, then says for 4 s when it failed', async () => {
    const island = await shown(recordingSnapshot());
    island.request.mockResolvedValueOnce({ ok: false, error: 'Changement impossible.' });
    press('Changer d’écran');
    fireEvent.click(tile('Écran 2'));
    expect(island.request).toHaveBeenCalledWith({ type: 'select-screen', screenId: 'screen:2:0' });
    await act(async () => vi.advanceTimersByTime(PICKED_HOLD));
    expect(picker()).not.toBeInTheDocument();
    expect(screen.getByText('Changement impossible')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Changer d’écran' })).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(SWITCH_FAILURE_SHOWN));
    expect(screen.getByRole('button', { name: 'Changer d’écran' })).toBeInTheDocument();
  });

  it('checks the new screen once the capture switched, and opens closed after a fold', async () => {
    const island = await shown(recordingSnapshot());
    press('Changer d’écran');
    island.push(recordingSnapshot({ sourceId: 'screen:2:0' }));
    expect(tile('Écran 2')).toHaveAttribute('aria-checked', 'true');
    island.expand(false);
    island.expand(true);
    expect(picker()).not.toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('button', { name: 'Pause' })).toBeVisible();
  });
});
