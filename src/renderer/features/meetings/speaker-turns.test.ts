import { describe, expect, it } from 'vitest';
import type { Segment } from '../../../shared/contracts';
import { partOf, speakerTurns } from './speaker-turns';

describe('speakerTurns', () => {
  it('réunit les paroles suivies d’un même intervenant sous le premier segment', () => {
    const turns = speakerTurns([
      { id: '0-0', start: 1, end: 3, text: 'Gardons mardi.', speaker: 'A' },
      { id: '0-1', start: 3, end: 8, text: 'C’est plus sûr pour la démonstration.', speaker: 'A' },
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0]?.id).toBe('0-0');
    expect(turns[0]?.start).toBe(1);
    expect(turns[0]?.end).toBe(8);
    expect(turns[0]?.text).toBe('Gardons mardi. C’est plus sûr pour la démonstration.');
  });

  it('ouvre un tour à chaque changement d’intervenant', () => {
    const turns = speakerTurns([
      { id: '0-0', start: 1, end: 3, text: 'Gardons mardi.', speaker: 'A' },
      { id: '0-1', start: 3, end: 5, text: 'D’accord.', speaker: 'B' },
      { id: '0-2', start: 5, end: 9, text: 'Alors je prépare la démonstration.', speaker: 'A' },
    ]);

    expect(turns.map((turn) => turn.speaker)).toEqual(['A', 'B', 'A']);
  });

  it('ne réunit pas deux extraits audio, dont les intervenants sont nommés séparément', () => {
    const turns = speakerTurns([
      { id: '0-0', start: 1, end: 3, text: 'Premier extrait.', speaker: 'A' },
      { id: '1-0', start: 3, end: 5, text: 'Second extrait.', speaker: 'A' },
    ]);

    expect(turns.map((turn) => turn.id)).toEqual(['0-0', '1-0']);
  });

  it('signale une relance courte pour l’afficher sur une seule ligne', () => {
    const turns = speakerTurns([
      {
        id: '0-0',
        start: 1,
        end: 9,
        text: 'Gardons mardi, c’est plus sûr pour préparer la démonstration.',
        speaker: 'A',
      },
      { id: '0-1', start: 9, end: 10, text: 'voilà', speaker: 'B' },
    ]);

    expect(turns[0]?.brief).toBe(false);
    expect(turns[1]?.brief).toBe(true);
  });

  it('coupe un monologue trop long pour rester lisible', () => {
    const long: Segment[] = Array.from({ length: 12 }, (_segment, index) => ({
      id: `0-${index}`,
      start: index * 10,
      end: index * 10 + 10,
      text: 'x'.repeat(100),
      speaker: 'A',
    }));

    const turns = speakerTurns(long);

    expect(turns.length).toBeGreaterThan(1);
    for (const turn of turns) expect(turn.text.length).toBeLessThanOrEqual(900);
  });

  it('accepte une transcription sans intervenant identifié', () => {
    const turns = speakerTurns([
      { id: '0-0', start: 1, end: 3, text: 'Première phrase.' },
      { id: '0-1', start: 3, end: 6, text: 'Seconde phrase.' },
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0]?.speaker).toBeUndefined();
  });

  it('renvoie une liste vide sans transcription', () => {
    expect(speakerTurns([])).toEqual([]);
  });

  it('marks the turn cut at 900 characters as the same voice continuing', () => {
    const long: Segment[] = Array.from({ length: 12 }, (_segment, index) => ({
      id: `0-${index}`,
      start: index * 10,
      end: index * 10 + 10,
      text: 'x'.repeat(100),
      speaker: 'A',
    }));

    const turns = speakerTurns(long);

    expect(turns.map((turn) => [turn.id, turn.text.length, turn.continuation])).toEqual([
      ['0-0', 807, false],
      ['0-8', 403, true],
    ]);
    expect(turns[1]?.segmentIds).toEqual(['0-8', '0-9', '0-10', '0-11']);
  });

  it('never calls a new part or a new voice a continuation', () => {
    const turns = speakerTurns([
      { id: '0-0', start: 1, end: 3, text: 'Un.', speaker: 'A' },
      { id: '0-1', start: 3, end: 5, text: 'Deux.', speaker: 'B' },
      { id: '1-0', start: 60, end: 62, text: 'Trois.', speaker: 'B' },
    ]);

    expect(turns.map((turn) => [turn.part, turn.continuation])).toEqual([
      [0, false],
      [0, false],
      [1, false],
    ]);
  });

  it('keeps the ids of the segments a turn gathers', () => {
    const turns = speakerTurns([
      { id: '0-0', start: 1, end: 3, text: 'Gardons mardi.', speaker: 'A' },
      { id: '0-1', start: 3, end: 8, text: 'C’est plus sûr.', speaker: 'A' },
    ]);

    expect(turns[0]?.segmentIds).toEqual(['0-0', '0-1']);
  });
});

describe('partOf', () => {
  it.each([
    ['12-3', 12],
    ['0-0', 0],
    ['abc', null],
    ['', null],
    ['-1-0', null],
    ['1e2-0', null],
  ])('reads the part of %j as %j', (id, part) => {
    expect(partOf(id)).toBe(part);
  });
});
