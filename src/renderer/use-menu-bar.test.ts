import { expect, it } from 'vitest';
import type { CaptureSource } from '../shared/contracts';
import { recordingStateOf } from './use-menu-bar';

function captureOf(source?: CaptureSource) {
  return { elapsed: 12, paused: true, source };
}

it('names the shared screen or window in the state sent to the main process', () => {
  expect(recordingStateOf(null, false)).toEqual({ recording: false });
  expect(recordingStateOf(captureOf(), true)).toEqual({
    recording: true,
    elapsed: 12,
    paused: true,
    stopping: true,
  });
  expect(
    recordingStateOf(captureOf({ id: 'screen:2:0', name: 'Écran 2', thumbnail: '' }), false),
  ).toEqual({
    recording: true,
    elapsed: 12,
    paused: true,
    stopping: false,
    sourceId: 'screen:2:0',
  });
});
