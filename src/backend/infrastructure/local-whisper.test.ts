import { expect, it } from 'vitest';
import { locateBinary, parseWhisperSegments } from './local-whisper';

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

it('never finds a binary through a relative PATH entry', () => {
  const path = process.env.PATH;
  process.env.PATH = '.:';
  try {
    // `package.json` sits in the folder the tests run from.
    expect(locateBinary('package.json')).toBeUndefined();
  } finally {
    process.env.PATH = path;
  }
});
