import { describe, expect, it } from 'vitest';
import { UngroundedNotesError, notesInstruction } from './notes-context';
import { MERGE_LIMITS } from './notes-format';
import {
  type Condensed,
  citedIds,
  groundedCondensed,
  groupPartials,
  partialInstruction,
  reduceContext,
  reduceInstruction,
  sliceInstruction,
} from './notes-reduce';
import { MAX_REDUCE_ROUNDS, PROMPT_BUDGET, estimateTokens } from './ollama-budget';
import { frenchText } from './ollama-fake.test-support';

function partialOf(index: number, chars = 600): Condensed {
  return {
    summary: frenchText(chars),
    keyPoints: [{ text: `Point ${index}`, sourceIds: [`${index}-0`, `${index}-1`] }],
    questions: [{ text: 'Qui envoie le devis ?', sourceIds: [`${index}-2`] }],
  };
}

// The largest answer a merge may give: every list full, every text and id list at its cap.
function worstCase(index: number): Condensed {
  const item = (position: number) => ({
    text: frenchText(MERGE_LIMITS.itemText),
    sourceIds: Array.from(
      { length: MERGE_LIMITS.sourceIds },
      (_id, id) => `${index}${position}-${id}`,
    ),
  });
  return {
    summary: frenchText(MERGE_LIMITS.summary),
    keyPoints: Array.from({ length: MERGE_LIMITS.keyPoints }, (_unused, position) =>
      item(position),
    ),
    questions: Array.from({ length: MERGE_LIMITS.questions }, (_unused, position) =>
      item(position),
    ),
  };
}

// Each group is merged into one partial of the same size; the last round is the final merge.
function rounds(count: number): number {
  let level = Array.from({ length: count }, (_unused, index) => worstCase(index));
  let done = 1;
  while (groupPartials('Revue', level).length > 1) {
    level = groupPartials('Revue', level).map((group) => group[0] ?? worstCase(0));
    done += 1;
  }
  return done;
}

describe('groupPartials', () => {
  it('keeps order and every partial exactly once', () => {
    const partials = Array.from({ length: 9 }, (_unused, index) => partialOf(index));

    expect(groupPartials('Revue', partials).flat()).toEqual(partials);
  });

  it('keeps each group, with the reduce instruction, under the prompt budget', () => {
    const partials = Array.from({ length: 9 }, (_unused, index) => partialOf(index, 900));

    for (const group of groupPartials('Revue', partials)) {
      const size =
        estimateTokens(reduceInstruction) + estimateTokens(reduceContext('Revue', group));
      expect(size).toBeLessThanOrEqual(PROMPT_BUDGET);
    }
  });

  it('always fits two partials of the largest possible size, so every round makes progress', () => {
    const pair = [worstCase(0), worstCase(1)];

    const groups = groupPartials('Revue', pair);

    expect(groups).toHaveLength(1);
    expect(
      estimateTokens(reduceInstruction) + estimateTokens(reduceContext('Revue', pair)),
    ).toBeLessThanOrEqual(PROMPT_BUDGET);
  });

  it('halves the number of partials at least at each round, so the loop is bounded', () => {
    expect(rounds(2)).toBe(1);
    expect(rounds(17)).toBeLessThanOrEqual(6);
    expect(rounds(200)).toBeLessThanOrEqual(MAX_REDUCE_ROUNDS);
  });
});

describe('reduceContext', () => {
  it('carries the partial notes and their sourceIds, never a transcript', () => {
    const context = JSON.parse(reduceContext('Revue', [partialOf(0), partialOf(1)])) as {
      title: string;
      partials: Condensed[];
      transcript?: unknown;
    };

    expect(context.title).toBe('Revue');
    expect(context.transcript).toBeUndefined();
    expect(context.partials[1]?.keyPoints[0]?.sourceIds).toEqual(['1-0', '1-1']);
  });

  it('leaves decisions and actions out of what the model merges', () => {
    const context = reduceContext('Revue', [partialOf(0)]);

    expect(context).not.toContain('decisions');
    expect(context).not.toContain('actions');
  });
});

describe('citedIds', () => {
  it('lists every id the key points and questions cite', () => {
    expect([...citedIds([partialOf(0), partialOf(3)])].sort()).toEqual([
      '0-0',
      '0-1',
      '0-2',
      '3-0',
      '3-1',
      '3-2',
    ]);
  });
});

describe('groundedCondensed', () => {
  const answer = {
    summary: 'Fusion.',
    keyPoints: [
      { text: 'Réel', sourceIds: ['1-0', '9-9'] },
      { text: 'Inventé', sourceIds: ['9-9'] },
    ],
    questions: [],
  };

  it('keeps only the ids the merge was shown, even if another block of the meeting exists', () => {
    const kept = groundedCondensed(JSON.stringify(answer), new Set(['1-0']));

    expect(kept.keyPoints).toEqual([{ text: 'Réel', sourceIds: ['1-0'] }]);
  });

  it('rejects an answer that cites nothing the merge was shown, without echoing ids', () => {
    const failure = () => groundedCondensed(JSON.stringify(answer), new Set(['2-0']));

    expect(failure).toThrow(UngroundedNotesError);
    expect(failure).not.toThrow(/9-9/);
  });
});

describe('slice instructions', () => {
  const definition = 'Une décision est un choix que les participants actent explicitement';
  const emptyAnswer = 'des listes decisions et actions vides sont alors la réponse attendue';

  it('define a decision and an action in the single-call and the partial instructions', () => {
    for (const instruction of [sliceInstruction, partialInstruction]) {
      expect(instruction).toContain(definition);
      expect(instruction).toContain('Une action est une tâche concrète');
      expect(instruction).toContain(emptyAnswer);
    }
  });

  it('leave the instruction the other providers share untouched', () => {
    expect(notesInstruction).not.toContain(definition);
    expect(reduceInstruction).not.toContain(definition);
  });
});
