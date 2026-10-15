import { describe, expect, it } from 'vitest';
import { meetingFixture } from '../../test-api';
import { meetingMarkdown, noteSources, notesMarkdown, speakerLabel } from './meeting-format';

const ids = ['1-0', '0-0', '0-1', 'clarification:c1', 'inconnu'];
const meeting = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z', {
  status: 'ready',
  transcript: [
    { id: '0-0', start: 4, end: 6, text: 'Bonjour.', speaker: 'A' },
    { id: '0-1', start: 4.6, end: 8, text: 'Salut.', speaker: 'B' },
    { id: '1-0', start: 61, end: 63, text: 'Le budget.', speaker: 'A' },
  ],
  clarifications: [{ id: 'c1', at: 90, text: 'Le budget 2027.', createdAt: '' }],
  notes: {
    summary: 'On valide le budget.',
    keyPoints: [{ text: 'Budget validé', sourceIds: ids }],
    decisions: [],
    actions: [],
    questions: [],
  },
});

describe('noteSources', () => {
  it('lists every playable source of a note, in order, once per second', () => {
    expect(noteSources(meeting, ids)).toEqual([
      { id: '1-0', at: 61 },
      { id: '0-0', at: 4 },
      { id: 'clarification:c1', at: 90 },
    ]);
  });
});

describe('notesMarkdown', () => {
  it('copies the notes and the clarifications without the transcript or empty sections', () => {
    const notes = notesMarkdown(meeting);
    expect(notes).toBe(
      [
        '# Revue produit',
        'On valide le budget.',
        '## Points clés\n- Budget validé (01:01, 00:04, 00:04, 01:30)',
        '## Précisions\n- [01:30] Le budget 2027.',
      ].join('\n\n'),
    );
    expect(meetingMarkdown(meeting)).toBe(
      `${notes}\n\n## Transcription\n\n[00:04] Intervenant A (partie 1) : Bonjour.\n\n[00:04] Intervenant B (partie 1) : Salut.\n\n[01:01] Intervenant A (partie 2) : Le budget.`,
    );
  });

  it('writes a note without any source as a plain line', () => {
    const plain = meetingFixture('m2', 'Point', '2026-10-14T08:00:00Z', {
      status: 'ready',
      notes: {
        summary: '',
        keyPoints: [{ text: 'Sans horodatage', sourceIds: [] }],
        decisions: [{ text: 'Source inconnue', sourceIds: ['inconnu'] }],
        actions: [],
        questions: [],
      },
    });
    expect(notesMarkdown(plain)).toBe(
      ['# Point', '## Points clés\n- Sans horodatage', '## Décisions\n- Source inconnue'].join(
        '\n\n',
      ),
    );
  });

  it('has no « Précisions » section without a clarification', () => {
    expect(notesMarkdown(meetingFixture('m3', 'Vide', '2026-10-14T08:00:00Z'))).toBe('# Vide');
  });
});

describe('speakerLabel', () => {
  it.each([
    [{ id: '0-0', speaker: 'A' }, 'Intervenant A (partie 1)'],
    [{ id: '1-3', speaker: 'B' }, 'Intervenant B (partie 2)'],
    [{ id: 'x', speaker: 'A' }, 'Intervenant A'],
    [{ id: '-1-0', speaker: 'A' }, 'Intervenant A'],
    [{ id: '0-0' }, undefined],
    [{ id: '0-0', speaker: '' }, undefined],
  ])('names %j « %s »', (spoken, label) => {
    expect(speakerLabel(spoken)).toBe(label);
  });
});
