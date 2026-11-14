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
    const warnings: string[] = [];

    const notes = await providerOver(request, undefined, (message) =>
      warnings.push(message),
    ).summarize(meetingOf({ blocks: 240, blockChars: 1_000 }));

    const slices = calls.filter((call) => call.kind === 'map').length;
    expect(slices * 2).toBeGreaterThan(MAX_LIST_ITEMS);
    expect(notes.actions).toHaveLength(MAX_LIST_ITEMS);
    expect(notes.actions[0]?.text).toBe('Action 0-0');
    expect(() => notesSchema.parse(notes)).not.toThrow();
    expect(warnings).toContain(
      `[ollama-notes] actions cut at the contract maximum: ${slices * 2 - MAX_LIST_ITEMS} dropped`,
    );
  });

  it('logs the count of a cut list and never the text of an item', async () => {
    const { request } = fakeOllama();
    const warnings: string[] = [];

    await providerOver(request, undefined, (message) => warnings.push(message)).summarize(
      meetingOf({ blocks: 240, blockChars: 1_000 }),
    );

    expect(warnings.length).toBeGreaterThan(0);
    for (const warning of warnings) {
      expect(warning).toMatch(
        /^\[ollama-notes\] (decisions|actions) cut at the contract maximum: \d+ dropped$/,
      );
    }
  });

  it('drops a decision or an action that cites a real block of another slice before concatenating', async () => {
    const foreign = '60-0'; // a later slice's block: real, but not in the first extract
    const { request } = fakeOllama((call, index) => {
      const answer = echoNotes(call);
      if (call.kind !== 'map' || index !== 0) return answer;
      return {
        ...answer,
        decisions: [{ text: 'Décision hors extrait', sourceIds: [foreign] }],
        actions: [{ text: 'Action hors extrait', sourceIds: [foreign] }],
      };
    });

    const notes = await providerOver(request).summarize(meetingOf({ blocks: 68 }));

    expect(notes.decisions.map((item) => item.text)).not.toContain('Décision hors extrait');
    expect(notes.actions.map((item) => item.text)).not.toContain('Action hors extrait');
    expect(ids(notes)).not.toContain(foreign);
  });
});

describe('Ollama notes: nothing to merge', () => {
  it('still returns the decisions and actions when no slice has a key point or a question', async () => {
    const { request, calls } = fakeOllama((call) => ({
      ...echoNotes(call),
      keyPoints: [],
      questions: [],
    }));

    const notes = await providerOver(request).summarize(meetingOf({ blocks: 68 }));

    const merges = calls.filter((call) => call.kind === 'reduce');
    expect(merges.length).toBeGreaterThan(0);
    for (const merge of merges) {
      const format = merge.body.format as {
        properties: { keyPoints: { maxItems: number }; questions: { maxItems: number } };
      };
      expect(format.properties.keyPoints.maxItems).toBe(0);
      expect(format.properties.questions.maxItems).toBe(0);
    }
    expect(notes.keyPoints).toEqual([]);
    expect(notes.questions).toEqual([]);
    expect(notes.decisions.length).toBeGreaterThan(0);
    expect(notes.actions.length).toBeGreaterThan(0);
  });
});
