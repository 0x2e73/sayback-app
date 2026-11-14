import { describe, expect, it } from 'vitest';
import { notesSchema } from '../../shared/validation';
import { MAX_ITEM_SOURCES, MAX_LIST_ITEMS, concatenateItems } from './notes-lists';

describe('concatenateItems', () => {
  it('keeps every item of every slice, in chronological order, ids untouched', () => {
    const merged = concatenateItems([
      [{ text: 'Envoyer le devis', sourceIds: ['0-0'] }],
      [
        { text: 'Valider le budget', sourceIds: ['5-0'] },
        { text: 'Appeler Paul', sourceIds: ['6-0', '6-1'] },
      ],
    ]);

    expect(merged).toEqual([
      { text: 'Envoyer le devis', sourceIds: ['0-0'] },
      { text: 'Valider le budget', sourceIds: ['5-0'] },
      { text: 'Appeler Paul', sourceIds: ['6-0', '6-1'] },
    ]);
  });

  it('merges duplicates on normalized text and unions their ids', () => {
    const merged = concatenateItems([
      [{ text: 'Envoyer le devis.', sourceIds: ['0-0', '0-1'] }],
      [{ text: '  envoyer  LE devis ', sourceIds: ['7-0', '0-1'] }],
    ]);

    expect(merged).toEqual([{ text: 'Envoyer le devis.', sourceIds: ['0-0', '0-1', '7-0'] }]);
  });

  it('cuts a list at the contract maximum of 30, keeping the earliest', () => {
    const lists = Array.from({ length: 20 }, (_unused, slice) => [
      { text: `Action ${slice}a`, sourceIds: [`${slice}-0`] },
      { text: `Action ${slice}b`, sourceIds: [`${slice}-1`] },
    ]);

    const merged = concatenateItems(lists);

    expect(merged).toHaveLength(MAX_LIST_ITEMS);
    expect(merged[0]?.text).toBe('Action 0a');
    expect(merged[29]?.text).toBe('Action 14b');
  });

  it('cuts the ids of an item at the contract maximum of 20', () => {
    const lists = Array.from({ length: 25 }, (_unused, slice) => [
      { text: 'Même action', sourceIds: [`${slice}-0`] },
    ]);

    const [item] = concatenateItems(lists);

    expect(item?.sourceIds).toHaveLength(MAX_ITEM_SOURCES);
  });

  it('produces lists the notes contract accepts', () => {
    const lists = Array.from({ length: 40 }, (_unused, slice) => [
      { text: `Décision ${slice}`, sourceIds: [`${slice}-0`] },
    ]);

    const decisions = concatenateItems(lists);

    expect(() =>
      notesSchema.parse({ summary: 'R', keyPoints: [], decisions, actions: [], questions: [] }),
    ).not.toThrow();
  });

  it('reports how many items a cut dropped, and only when it cuts', () => {
    const cuts: number[] = [];
    const lists = Array.from({ length: 36 }, (_unused, slice) => [
      { text: `Action ${slice}`, sourceIds: [`${slice}-0`] },
    ]);

    concatenateItems(lists, (dropped) => cuts.push(dropped));
    concatenateItems(lists.slice(0, 30), (dropped) => cuts.push(dropped));

    expect(cuts).toEqual([6]);
  });
});
