// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IslandLiveSnapshot, LiveSegment } from '../../shared/live';
import { fakeIsland, recordingSnapshot, shown } from './island-fixture';
import { IslandApp } from './IslandApp';
import { stubImageUrls } from './island-media.test-support';
import { FRAME_WAIT } from './use-preview-frame';

const jpeg = () => new Uint8Array([255, 216, 255]);
const preview = () => screen.queryByRole('img', { name: 'Aperçu de l’écran capturé' });
const flush = () => act(async () => {});

const said = (extra: Partial<LiveSegment>): LiveSegment => ({
  id: 'microphone-1',
  track: 'microphone',
  text: 'On valide le budget jeudi.',
  start: 1,
  end: 3,
  final: true,
  revision: 1,
  ...extra,
});

const live = (segments: LiveSegment[]): IslandLiveSnapshot => ({
  enabled: true,
  availability: { state: 'ready' },
  segments,
});

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

describe('the preview of the recording island', () => {
  it('waits on a skeleton, then shows each frame once decoded and lets the old one go', async () => {
    const island = await shown(recordingSnapshot());
    expect(screen.getByRole('status', { name: 'Aperçu en attente' })).toBeInTheDocument();
    island.preview(jpeg());
    await flush();
    expect(preview()).toHaveAttribute('src', 'blob:frame-1');
    expect(media.decode).toHaveBeenCalledOnce();
    island.preview(jpeg());
    await flush();
    expect(preview()).toHaveAttribute('src', 'blob:frame-2');
    expect(media.revoke).toHaveBeenCalledWith('blob:frame-1');
    expect(media.revoke).not.toHaveBeenCalledWith('blob:frame-2');
  });

  it('drops a frame that cannot be decoded', async () => {
    const island = await shown(recordingSnapshot());
    media.decode.mockRejectedValueOnce(new Error('broken'));
    island.preview(jpeg());
    await flush();
    expect(preview()).not.toBeInTheDocument();
    expect(media.revoke).toHaveBeenCalledWith('blob:frame-1');
  });

  it('says there is no preview when no frame comes', async () => {
    await shown(recordingSnapshot());
    await act(async () => vi.advanceTimersByTime(FRAME_WAIT));
    expect(screen.getByRole('img', { name: 'Aucun aperçu' })).toBeInTheDocument();
  });

  it('starts over from the skeleton after a screen switch, never showing the old screen', async () => {
    const island = await shown(recordingSnapshot());
    island.preview(jpeg());
    await flush();
    island.push(recordingSnapshot({ sourceId: 'screen:2:0' }));
    expect(preview()).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Aperçu en attente' })).toBeInTheDocument();
    island.preview(jpeg());
    await flush();
    expect(preview()).toHaveAttribute('src', 'blob:frame-2');
  });

  it('keeps the frame while paused, however long', async () => {
    const island = await shown(recordingSnapshot());
    island.preview(jpeg());
    await flush();
    island.push(recordingSnapshot({ paused: true }));
    await act(async () => vi.advanceTimersByTime(FRAME_WAIT * 3));
    expect(preview()).toHaveAttribute('src', 'blob:frame-1');
    expect(screen.getByRole('main')).toHaveAttribute('data-paused', 'true');
  });

  it('says there is no preview when the frames stop coming during the recording', async () => {
    const island = await shown(recordingSnapshot());
    island.preview(jpeg());
    await flush();
    await act(async () => vi.advanceTimersByTime(FRAME_WAIT - 1));
    expect(preview()).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(1));
    expect(screen.getByRole('img', { name: 'Aucun aperçu' })).toBeInTheDocument();
    island.preview(jpeg());
    await flush();
    expect(preview()).toHaveAttribute('src', 'blob:frame-2');
  });

  it('never shows a frame received before a switch, even decoded after it', async () => {
    const island = await shown(recordingSnapshot());
    let decoded: () => void = () => {};
    media.decode.mockReturnValueOnce(
      new Promise<undefined>((resolve) => (decoded = () => resolve(undefined))),
    );
    island.preview(jpeg());
    island.push(recordingSnapshot({ sourceId: 'screen:2:0' }));
    await act(async () => decoded());
    expect(preview()).not.toBeInTheDocument();
  });

  it('lets the frame go when the preview goes', async () => {
    const island = await shown(recordingSnapshot());
    island.preview(jpeg());
    await flush();
    cleanup();
    expect(media.revoke).toHaveBeenCalledWith('blob:frame-1');
  });

  it('has no preview for a recording of the sound alone', async () => {
    await shown(recordingSnapshot({ sourceId: undefined }));
    expect(screen.queryByRole('status', { name: 'Aperçu en attente' })).not.toBeInTheDocument();
  });
});

describe('the live text of the recording island', () => {
  it('shows nothing of the text while the setting is off', async () => {
    await shown(recordingSnapshot());
    await flush();
    expect(screen.queryByText('En attente de parole…')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Texte en direct' })).not.toBeInTheDocument();
  });

  it('waits for speech, then shows « Toi » and « Les autres » in order', async () => {
    const island = await shown(recordingSnapshot(), live([]));
    expect(screen.getByText('En attente de parole…')).toBeInTheDocument();
    island.segment(said({ final: false, text: 'On valide' }));
    island.segment(said({ id: 'system-1', track: 'system', text: 'Ça me va.', start: 4 }));
    const region = screen.getByRole('region', { name: 'Texte en direct' });
    expect(region).toHaveTextContent('ToiOn valideLes autresÇa me va.');
    island.segment(said({ revision: 2 }));
    expect(region).toHaveTextContent('ToiOn valide le budget jeudi.Les autresÇa me va.');
    island.segment(said({ id: 'system-1', track: 'system', text: '', revision: 2, start: 4 }));
    expect(region).not.toHaveTextContent('Les autres');
  });

  it('replaces everything on a new snapshot, and keeps one newer than the answer at mount', async () => {
    const island = fakeIsland(recordingSnapshot());
    let answer: (snapshot: IslandLiveSnapshot) => void = () => {};
    island.liveSnapshot.mockReturnValueOnce(
      new Promise((resolve) => (answer = (value) => resolve({ ok: true, value }))),
    );
    render(<IslandApp api={island.api} now={() => Date.now()} />);
    await flush();
    island.live(live([said({})]));
    answer({ enabled: false });
    await flush();
    expect(screen.getByRole('region', { name: 'Texte en direct' })).toHaveTextContent(
      'On valide le budget jeudi.',
    );
    island.live({ enabled: false });
    expect(screen.queryByRole('region', { name: 'Texte en direct' })).not.toBeInTheDocument();
  });

  it('asks again once when the first snapshot fails', async () => {
    const island = fakeIsland(recordingSnapshot());
    island.liveSnapshot
      .mockResolvedValueOnce({ ok: false, error: 'Trop de demandes.' })
      .mockResolvedValueOnce({ ok: true, value: live([said({})]) });
    render(<IslandApp api={island.api} now={() => Date.now()} />);
    await flush();
    expect(island.liveSnapshot).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('region', { name: 'Texte en direct' })).toHaveTextContent(
      'On valide le budget jeudi.',
    );
  });

  it('asks again when the first segment arrives while the snapshot is missing', async () => {
    const island = fakeIsland(recordingSnapshot());
    island.liveSnapshot
      .mockRejectedValueOnce(new Error('gone'))
      .mockRejectedValueOnce(new Error('gone'))
      .mockResolvedValueOnce({ ok: true, value: live([said({})]) });
    render(<IslandApp api={island.api} now={() => Date.now()} />);
    await flush();
    expect(island.liveSnapshot).toHaveBeenCalledTimes(2);
    island.segment(said({ id: 'system-1', track: 'system', text: 'Ça me va.', start: 4 }));
    island.segment(said({ id: 'system-2', track: 'system', text: 'Oui.', start: 5 }));
    await flush();
    expect(island.liveSnapshot).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('region', { name: 'Texte en direct' })).toHaveTextContent(
      'On valide le budget jeudi.',
    );
  });

  it.each([
    ['no-model', 'Texte en direct indisponible : aucun modèle local'],
    ['port-conflict', 'Texte en direct coupé par sécurité'],
  ] as const)('says why it is unavailable: %s', async (reason, text) => {
    const island = await shown(recordingSnapshot());
    island.live({ enabled: true, availability: { state: 'unavailable', reason }, segments: [] });
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('takes the whole width without a preview', async () => {
    const island = await shown(recordingSnapshot({ sourceId: undefined }));
    island.live(live([said({})]));
    expect(screen.getByRole('region', { name: 'Texte en direct' })).toBeInTheDocument();
  });
});
