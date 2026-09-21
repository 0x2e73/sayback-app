import { expect, it } from 'vitest';
import { parseWhisperSegments } from './local-whisper';

it('maps local Whisper milliseconds to the meeting timeline', () => {
  expect(
    parseWhisperSegments(
      {
        transcription: [
          { offsets: { from: 1_200, to: 3_400 }, text: ' Bonjour ' },
          { offsets: { from: 10_500, to: 11_000 }, text: 'Hors segment' },
        ],
      },
      { index: 2, start: 60, duration: 10, transcript: null },
    ),
  ).toEqual([{ id: '2-0', start: 61.2, end: 63.4, text: 'Bonjour' }]);
});
