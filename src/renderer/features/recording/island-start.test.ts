import { describe, expect, it, vi } from 'vitest';
import type { CaptureSource } from '../../../shared/contracts';
import type { StartPayload } from '../../../shared/recording-start';
import { apiFor, ok, settings } from '../../test-api';
import { CaptureBusy } from './capture-opener';
import { CaptureFailure } from './capture-resources';
import { startErrorOf, startFromIsland } from './island-start';

const main: CaptureSource = { id: 'screen:1:0', name: 'Écran 1', thumbnail: '', primary: true };

const withScreen: StartPayload = {
  title: 'Réunion du 15 octobre, 11 h 42',
  selection: { microphone: true, systemAudio: true, screen: true, screenId: 'screen:1:0' },
};
const withoutScreen: StartPayload = {
  title: 'Réunion du 15 octobre, 11 h 42',
  selection: { microphone: true, systemAudio: false, screen: false },
};

function fixture() {
  const api = apiFor();
  api.getSettings = () => ok({ ...settings, hasOpenAiKey: true });
  api.getSources = () => ok([main]);
  api.getCapturePrefs = () =>
    ok({
      microphone: true,
      systemAudio: true,
      screen: true,
      autoAnalyze: true,
      screenId: 'screen:2:0',
    });
  const calls: string[] = [];
  const selectSource = vi.spyOn(api, 'selectSource').mockImplementation(async () => {
    calls.push('select');
    return { ok: true, value: undefined };
  });
  const setCapturePrefs = vi.spyOn(api, 'setCapturePrefs');
  const onStart = vi.fn(async () => {
    calls.push('start');
  });
  return { api, calls, selectSource, setCapturePrefs, onStart };
}

describe('startFromIsland', () => {
  it('starts as the dialog does and remembers the choices once started', async () => {
    const { api, calls, selectSource, setCapturePrefs, onStart } = fixture();
    await expect(startFromIsland(api, withScreen, onStart)).resolves.toEqual({ ok: true });
    expect(selectSource).toHaveBeenCalledWith('screen:1:0', true);
    expect(onStart).toHaveBeenCalledWith(
      'Réunion du 15 octobre, 11 h 42',
      { microphone: true, systemAudio: true, screen: true, source: main },
      true,
    );
    expect(calls).toEqual(['select', 'start']);
    expect(setCapturePrefs).toHaveBeenCalledWith({
      microphone: true,
      systemAudio: true,
      screen: true,
      autoAnalyze: true,
      screenId: 'screen:1:0',
    });
  });

  it('keeps the remembered analysis but skips it while the analysis is not set up', async () => {
    const { api, setCapturePrefs, onStart } = fixture();
    api.getSettings = () => ok(settings);
    await startFromIsland(api, withScreen, onStart);
    expect(onStart).toHaveBeenCalledWith(expect.any(String), expect.anything(), false);
    expect(setCapturePrefs).toHaveBeenCalledWith(expect.objectContaining({ autoAnalyze: true }));
  });

  it('starts without a screen and keeps the remembered one', async () => {
    const { api, selectSource, setCapturePrefs, onStart } = fixture();
    await expect(startFromIsland(api, withoutScreen, onStart)).resolves.toEqual({ ok: true });
    expect(selectSource).not.toHaveBeenCalled();
    expect(onStart).toHaveBeenCalledWith(
      expect.any(String),
      { microphone: true, systemAudio: false, screen: false, source: undefined },
      true,
    );
    expect(setCapturePrefs).toHaveBeenCalledWith({
      microphone: true,
      systemAudio: false,
      screen: false,
      autoAnalyze: true,
      screenId: 'screen:2:0',
    });
  });

  it('answers no-audio-source without starting anything', async () => {
    const { api, setCapturePrefs, onStart } = fixture();
    const silent: StartPayload = {
      ...withScreen,
      selection: { microphone: false, systemAudio: false, screen: true, screenId: 'screen:1:0' },
    };
    await expect(startFromIsland(api, silent, onStart)).resolves.toEqual({
      ok: false,
      error: 'no-audio-source',
    });
    expect(onStart).not.toHaveBeenCalled();
    expect(setCapturePrefs).not.toHaveBeenCalled();
  });

  it('answers no-screen when the chosen screen is gone or the list fails', async () => {
    const { api, setCapturePrefs, onStart } = fixture();
    api.getSources = () => ok([{ ...main, id: 'screen:3:0' }]);
    await expect(startFromIsland(api, withScreen, onStart)).resolves.toEqual({
      ok: false,
      error: 'no-screen',
    });
    api.getSources = async () => ({ ok: false, error: 'Liste indisponible.' });
    await expect(startFromIsland(api, withScreen, onStart)).resolves.toEqual({
      ok: false,
      error: 'no-screen',
    });
    expect(onStart).not.toHaveBeenCalled();
    expect(setCapturePrefs).not.toHaveBeenCalled();
  });

  it('answers screen-denied when the screen is refused, listed or not', async () => {
    const { api, setCapturePrefs, onStart } = fixture();
    onStart.mockRejectedValueOnce(new CaptureFailure('screen', 'NotAllowedError'));
    await expect(startFromIsland(api, withScreen, onStart)).resolves.toEqual({
      ok: false,
      error: 'screen-denied',
    });
    api.getSources = () => ok([]);
    api.getCapturePermission = () => ok('denied');
    await expect(startFromIsland(api, withScreen, onStart)).resolves.toEqual({
      ok: false,
      error: 'screen-denied',
    });
    expect(setCapturePrefs).not.toHaveBeenCalled();
  });

  it('answers failed for anything else and remembers nothing', async () => {
    const { api, setCapturePrefs, onStart } = fixture();
    onStart.mockRejectedValueOnce(new Error('La réunion n’a pas pu être créée.'));
    await expect(startFromIsland(api, withScreen, onStart)).resolves.toEqual({
      ok: false,
      error: 'failed',
    });
    vi.spyOn(api, 'selectSource').mockResolvedValueOnce({ ok: false, error: 'Source invalide.' });
    await expect(startFromIsland(api, withScreen, onStart)).resolves.toEqual({
      ok: false,
      error: 'failed',
    });
    expect(setCapturePrefs).not.toHaveBeenCalled();
  });
});

describe('startErrorOf', () => {
  it.each([
    [new CaptureFailure('screen', 'NotAllowedError'), 'screen-denied'],
    [new CaptureFailure('screen', 'NotFoundError'), 'no-screen'],
    [new CaptureFailure('screen', 'NotReadableError'), 'failed'],
    [new CaptureFailure('microphone', 'NotAllowedError'), 'failed'],
    [new CaptureBusy('interrupted'), 'interrupted'],
    [new CaptureBusy('running'), 'failed'],
    [new Error('Une autre panne.'), 'failed'],
    ['pas une erreur', 'failed'],
  ])('maps %o to %s', (failure, expected) => {
    expect(startErrorOf(failure)).toBe(expected);
  });
});
