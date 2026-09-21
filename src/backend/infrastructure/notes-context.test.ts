import { describe, expect, it } from 'vitest';
import type { Meeting, Segment } from '../../shared/contracts';
import { citableBlocks, meetingContext, parseGroundedNotes } from './notes-context';

function meetingWith(
  transcript: Segment[],
  clarifications: Meeting['clarifications'] = [],
): Meeting {
  return {
    id: 'meeting',
    title: 'Revue produit',
    createdAt: '',
    status: 'recorded',
    duration: 120,
    hasVideo: false,
    audioChunks: [],
    frames: [],
    transcript,
    notes: null,
    clarifications,
    error: null,
  };
}

const notes = {
  summary: 'La date reste mardi.',
  keyPoints: [{ text: 'Lancement mardi', sourceIds: ['0-0'] }],
  decisions: [],
  actions: [],
  questions: [],
};

describe('citableBlocks', () => {
  it('regroupe une fenêtre de paroles et cite le premier segment du bloc', () => {
    const blocks = citableBlocks([
      { id: '0-0', start: 0, end: 4, text: 'Gardons mardi.', speaker: 'A' },
      { id: '0-1', start: 4, end: 6, text: 'D’accord.', speaker: 'B' },
      { id: '0-2', start: 6, end: 9, text: 'Et pour le budget ?', speaker: 'B' },
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.id).toBe('0-0');
    expect(blocks[0]?.start).toBe(0);
    expect(blocks[0]?.end).toBe(9);
    expect(blocks[0]?.text).toBe('A: Gardons mardi. B: D’accord. Et pour le budget ?');
  });

  it('ouvre un bloc au-delà de la fenêtre de regroupement', () => {
    const blocks = citableBlocks([
      { id: '0-0', start: 0, end: 4, text: 'Début.', speaker: 'A' },
      { id: '0-1', start: 50, end: 54, text: 'Bien plus tard.', speaker: 'A' },
    ]);

    expect(blocks.map((block) => block.id)).toEqual(['0-0', '0-1']);
  });

  it('ne fusionne jamais deux extraits audio, dont les intervenants sont nommés séparément', () => {
    const blocks = citableBlocks([
      { id: '0-0', start: 0, end: 4, text: 'Premier extrait.', speaker: 'A' },
      { id: '1-0', start: 4, end: 8, text: 'Second extrait.', speaker: 'A' },
    ]);

    expect(blocks.map((block) => block.id)).toEqual(['0-0', '1-0']);
  });
});

describe('meetingContext', () => {
  it('donne la même clé de citation aux paroles et aux précisions', () => {
    const meeting = meetingWith(
      [{ id: '0-0', start: 0, end: 4, text: 'Gardons mardi.', speaker: 'A' }],
      [{ id: 'abc', at: 10, text: 'Budget validé.', createdAt: '' }],
    );

    const context = JSON.parse(meetingContext(meeting)) as {
      transcript: Array<{ id: string }>;
      clarifications: Array<{ id: string; createdAt?: string }>;
    };

    expect(context.transcript[0]?.id).toBe('0-0');
    expect(context.clarifications[0]?.id).toBe('clarification:abc');
    expect(context.clarifications[0]?.createdAt).toBeUndefined();
  });
});

describe('parseGroundedNotes', () => {
  const meeting = meetingWith([
    { id: '0-0', start: 0, end: 4, text: 'Gardons mardi.', speaker: 'A' },
    { id: '1-0', start: 60, end: 64, text: 'Budget accepté.', speaker: 'B' },
  ]);

  it('retire une source inventée et garde l’élément qui reste cité', () => {
    const text = JSON.stringify({
      ...notes,
      decisions: [{ text: 'Budget accepté', sourceIds: ['1-0', '9-99'] }],
    });

    const result = parseGroundedNotes(text, meeting);

    expect(result.decisions[0]?.sourceIds).toEqual(['1-0']);
    expect(result.keyPoints[0]?.sourceIds).toEqual(['0-0']);
    expect(result.summary).toBe('La date reste mardi.');
  });

  it('écarte l’élément dont aucune source n’existe', () => {
    const text = JSON.stringify({
      ...notes,
      decisions: [{ text: 'Invention', sourceIds: ['9-99'] }],
    });

    const result = parseGroundedNotes(text, meeting);

    expect(result.decisions).toEqual([]);
    expect(result.keyPoints).toHaveLength(1);
  });

  it('échoue en nommant les sources fautives quand plus rien n’est cité correctement', () => {
    const text = JSON.stringify({
      summary: 'Résumé.',
      keyPoints: [{ text: 'Invention', sourceIds: ['9-99'] }],
      decisions: [],
      actions: [],
      questions: [],
    });

    expect(() => parseGroundedNotes(text, meeting)).toThrow(/9-99/);
  });

  it('accepte une précision humaine comme source', () => {
    const withClarification = meetingWith(meeting.transcript, [
      { id: 'abc', at: 10, text: 'Budget validé.', createdAt: '' },
    ]);
    const text = JSON.stringify({
      ...notes,
      actions: [{ text: 'Confirmer le budget', sourceIds: ['clarification:abc'] }],
    });

    expect(parseGroundedNotes(text, withClarification).actions[0]?.sourceIds).toEqual([
      'clarification:abc',
    ]);
  });

  it('conserve un compte rendu sans aucun élément cité', () => {
    const text = JSON.stringify({
      summary: 'Réunion courte.',
      keyPoints: [],
      decisions: [],
      actions: [],
      questions: [],
    });

    expect(parseGroundedNotes(text, meeting).summary).toBe('Réunion courte.');
  });
});
