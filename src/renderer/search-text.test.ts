import { describe, expect, it } from 'vitest';
import { findMatches, foldText, normalizeSearch } from './search-text';

describe('normalizeSearch', () => {
  it.each([
    ['Équipe', 'equipe'],
    ['ÉQUIPE PRODUIT', 'equipe produit'],
    ['Cœur du sujet', 'coeur du sujet'],
    ['ŒUVRE Ægis', 'oeuvre aegis'],
    ['  revue   produit ', 'revue produit'],
    ['', ''],
    ['   ', ''],
    ['Naïve façade', 'naive facade'],
    ['Zürich', 'zurich'],
    ['e\u0301quipe', 'equipe'],
    ['Revue\nproduit\t2026', 'revue produit 2026'],
    ['Point d’équipe', "point d'equipe"],
    ['d‘équipe d\u02bcéquipe d`équipe d´équipe', "d'equipe d'equipe d'equipe d'equipe"],
    ['Straße', 'strasse'],
    ['Søren', 'soren'],
    ['Kick-off Kick\u2011off Kick–off', 'kick off kick off kick off'],
    ['ﬁnal', 'final'],
    ['Rendez-vous\ufe0f', 'rendez vous'],
  ])('%j reads as %j', (text, expected) => {
    expect(normalizeSearch(text)).toBe(expected);
  });
});

describe('foldText', () => {
  it('keeps, for every folded unit, the source character it comes from', () => {
    expect(foldText(' Œu')).toEqual({ folded: 'oeu', starts: [1, 1, 2], ends: [2, 2, 3] });
  });
});

const highlighted = (text: string, query: string) =>
  findMatches(foldText(text), normalizeSearch(query), Number.POSITIVE_INFINITY).map(
    ({ start, end }) => text.slice(start, end),
  );

describe('findMatches', () => {
  it.each<[string, string, string, string[]]>([
    ['an accent typed without it', 'Le Café de l’Équipe', 'cafe', ['Café']],
    ['a curly apostrophe typed straight', 'Le Café de l’Équipe', "l'equipe", ['l’Équipe']],
    ['a ligature typed as two letters, twice', 'Cœur, cœur', 'coeur', ['Cœur', 'cœur']],
    ['one letter of a ligature: the whole ligature', 'Cœur', 'e', ['œ']],
    ['ß matched once, not twice', 'Straße', 's', ['S', 'ß']],
    ['a typographic ligature', 'ﬁnal ﬁn', 'fi', ['ﬁ', 'ﬁ']],
    ['combining accents, the last one included', 'e\u0301te\u0301', 'ete', ['e\u0301te\u0301']],
    ['collapsed spaces', 'Revue  produit', 'revue produit', ['Revue  produit']],
    ['a hyphen typed as a space', 'Kick-off', 'kick off', ['Kick-off']],
    ['after an emoji (two UTF-16 units)', 'Rendez-vous 🎉 ok', 'ok', ['ok']],
    ['successive matches without overlap', 'aaaa', 'aa', ['aa', 'aa']],
    ['nothing for an empty query', 'Le budget', '', []],
  ])('finds %s', (_case, text, query, expected) => {
    expect(highlighted(text, query)).toEqual(expected);
  });

  it('gives source offsets', () => {
    expect(findMatches(foldText('Le Café de l’Équipe'), 'cafe', 10)).toEqual([
      { start: 3, end: 7 },
    ]);
    expect(findMatches(foldText('Rendez-vous 🎉 ok'), 'ok', 10)).toEqual([{ start: 15, end: 17 }]);
  });

  it('stops at the limit', () => {
    expect(findMatches(foldText('a a a a'), 'a', 2)).toHaveLength(2);
  });
});
