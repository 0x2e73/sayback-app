import { describe, expect, it, vi } from 'vitest';
import type { CaptureSource } from '../../../shared/contracts';
import { answerScreenSwitch, type SwitchTarget } from './island-switch';

const screen2: CaptureSource = { id: 'screen:2:0', name: 'Écran 2', thumbnail: '' };
const window4: CaptureSource = { id: 'window:4:0', name: 'Notes', thumbnail: '' };

function setup(current = 'screen:1:0') {
  const api = {
    getSources: vi.fn(async () => ({ ok: true as const, value: [screen2, window4] })),
    selectSource: vi.fn(async () => ({ ok: true as const, value: undefined })),
    answerScreenSwitch: vi.fn(async () => ({ ok: true as const, value: undefined })),
  };
  const capture = {
    source: { id: current, name: 'Écran 1', thumbnail: '' },
    switchSource: vi.fn(async () => undefined),
  };
  const target: SwitchTarget = { capture, stopping: false };
  return { api, capture, target };
}

describe('answerScreenSwitch', () => {
  it('switches the capture to the listed screen and answers ok', async () => {
    const { api, capture, target } = setup();
    await answerScreenSwitch(api, { id: 'a', screenId: 'screen:2:0' }, target);
    expect(capture.switchSource).toHaveBeenCalledWith(api, screen2);
    expect(api.answerScreenSwitch).toHaveBeenCalledWith('a', true);
  });

  it('answers ok at once for the screen already captured', async () => {
    const { api, capture, target } = setup('screen:2:0');
    await answerScreenSwitch(api, { id: 'a', screenId: 'screen:2:0' }, target);
    expect(capture.switchSource).not.toHaveBeenCalled();
    expect(api.answerScreenSwitch).toHaveBeenCalledWith('a', true);
  });

  it.each([
    ['a screen no longer listed', 'screen:3:0'],
    ['a window', 'window:4:0'],
  ])('refuses %s', async (_case, screenId) => {
    const { api, capture, target } = setup();
    await answerScreenSwitch(api, { id: 'a', screenId }, target);
    expect(capture.switchSource).not.toHaveBeenCalled();
    expect(api.answerScreenSwitch).toHaveBeenCalledWith('a', false);
  });

  it('answers false without a recording, while it closes, or when the switch fails', async () => {
    const { api, capture } = setup();
    await answerScreenSwitch(
      api,
      { id: 'a', screenId: 'screen:2:0' },
      {
        capture: null,
        stopping: false,
      },
    );
    await answerScreenSwitch(api, { id: 'b', screenId: 'screen:2:0' }, { capture, stopping: true });
    capture.switchSource.mockRejectedValueOnce(new Error('refused'));
    await answerScreenSwitch(
      api,
      { id: 'c', screenId: 'screen:2:0' },
      { capture, stopping: false },
    );
    expect(api.answerScreenSwitch.mock.calls).toEqual([
      ['a', false],
      ['b', false],
      ['c', false],
    ]);
  });
});
