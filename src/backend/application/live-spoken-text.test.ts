import { describe, expect, it } from 'vitest';
import { spokenText } from './live-spoken-text';

describe('spoken text', () => {
  it.each([
    [' [BLANK_AUDIO] Oui,\n  bien sûr. [Rires]', 'Oui, bien sûr.'],
    ['[[nested]] Bonjour', 'Bonjour'],
    ['♪ La la ♪ Merci', 'La la Merci'],
    ['(musique) Bonjour (applaudissements)', 'Bonjour'],
    ['*rires* Alors *tousse*', 'Alors'],
    ['[(musique)] [♪]', ''],
    ['', ''],
  ])('reads %j as %j', (raw, expected) => {
    expect(spokenText(raw)).toBe(expected);
  });
});
