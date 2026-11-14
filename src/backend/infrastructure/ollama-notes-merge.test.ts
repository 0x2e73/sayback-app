import { describe, expect, it } from 'vitest';
import { notesSchema } from '../../shared/validation';
import { MAX_LIST_ITEMS } from './notes-lists';
import {
  echoNotes,
  fakeOllama,
  ids,
  meetingOf,
  providerOver,
  sliceIds,
  uncitedBlock,
} from './ollama-fake.test-support';

describe('Ollama notes: merge grounding', () => {
  it('drops a real block id that no partial note cited, because the merge never saw the transcript', async () => {
    const uncited = uncitedBlock(68);
    const { request } = fakeOllama((call) => {
      const answer = echoNotes(call);
      if (call.kind !== 'reduce') return answer;
      return {
        ...answer,
        keyPoints: [...answer.keyPoints, { text: 'Jamais cité', sourceIds: [uncited] }],
        questions: [{ text: 'Jamais cité non plus', sourceIds: [uncited, '0-0'] }],
      };
    });

    const notes = await providerOver(request).summarize(meetingOf({ blocks: 68 }));

    expect(notes.keyPoints.map((item) => item.text)).not.toContain('Jamais cité');
    expect(ids(notes)).not.toContain(uncited);
    expect(notes.questions).toEqual([{ text: 'Jamais cité non plus', sourceIds: ['0-0'] }]);
  });

  it('drops a citation invented by the merge and keeps the real ones', async () => {
    const { request } = fakeOllama((call) => {
      const answer = echoNotes(call);
      if (call.kind !== 'reduce') return answer;
      const real = answer.keyPoints[0]?.sourceIds ?? [];
      return {
        ...answer,
        keyPoints: [...answer.keyPoints, { text: 'Inventé', sourceIds: ['999-0'] }],
        questions: [{ text: 'Mélangé', sourceIds: [...real, '999-1'] }],
      };
    });

    const notes = await providerOver(request).summarize(meetingOf({ blocks: 68 }));

    expect(notes.keyPoints.map((item) => item.text)).not.toContain('Inventé');
    expect(notes.questions).toEqual([{ text: 'Mélangé', sourceIds: ['0-0'] }]);
    expect(ids(notes)).not.toContain('999-0');
    expect(ids(notes)).not.toContain('999-1');
  });
});

describe('Ollama notes: decisions and actions are kept in full', () => {
  it('concatenates the actions of every slice, unchanged, in chronological order', async () => {
    const { request, calls } = fakeOllama();

    const notes = await providerOver(request).summarize(meetingOf({ blocks: 68 }));

    const maps = calls.filter((call) => call.kind === 'map');
    expect(maps.length).toBeGreaterThanOrEqual(6);
    const expected = maps.flatMap((call) => {
      const [head, tail] = [sliceIds(call)[0], sliceIds(call).at(-1)];
      return [
        { text: `Action ${head}`, sourceIds: [head] },
        { text: `Action ${tail}`, sourceIds: [tail] },
      ];
    });
    expect(notes.actions).toHaveLength(2 * maps.length);
    expect(notes.actions).toEqual(expected);
    expect(notes.decisions).toHaveLength(maps.length);
  });

  it('merges the same action said in several slices, with the union of their ids', async () => {
    const { request } = fakeOllama((call, index) => {
      const answer = echoNotes(call);
      if (call.kind !== 'map') return answer;
      const text = index % 2 === 0 ? 'Valider le budget.' : ' valider  LE budget ';
      return { ...answer, actions: [{ text, sourceIds: [sliceIds(call)[0] ?? ''] }] };
    });

    const notes = await providerOver(request).summarize(meetingOf({ blocks: 68 }));

    expect(notes.actions).toHaveLength(1);
    expect(notes.actions[0]?.text).toBe('Valider le budget.');
    expect(notes.actions[0]?.sourceIds.length).toBeGreaterThanOrEqual(6);
  });

  it('cuts a list at the contract maximum and still returns valid notes', async () => {
    const { request, calls } = fakeOllama();

    const notes = await providerOver(request).summarize(
      meetingOf({ blocks: 240, blockChars: 1_000 }),
    );

    expect(calls.filter((call) => call.kind === 'map').length * 2).toBeGreaterThan(MAX_LIST_ITEMS);
    expect(notes.actions).toHaveLength(MAX_LIST_ITEMS);
    expect(notes.actions[0]?.text).toBe('Action 0-0');
    expect(() => notesSchema.parse(notes)).not.toThrow();
  });
});
