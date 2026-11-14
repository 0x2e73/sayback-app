import { describe, expect, it } from 'vitest';
import type { Notes } from '../../shared/contracts';
import { MAX_REDUCE_ROUNDS, OUTPUT_TOKENS, PROMPT_BUDGET, estimateTokens } from './ollama-budget';
import { NOTE_LIMITS } from './notes-format';
import { citedIds, groupPartials, reduceContext, reduceInstruction } from './notes-reduce';

// The largest answer the grammar allows: every list full, every text and id list at its cap.
function worstCase(index: number): Notes {
  const items = Array.from({ length: NOTE_LIMITS.items }, (_unused, item) => ({
    text: 'x'.repeat(NOTE_LIMITS.itemText),
    sourceIds: Array.from({ length: NOTE_LIMITS.sourceIds }, (_id, id) => `${index}-${item}${id}`),
  }));
  return {
    summary: 'r'.repeat(NOTE_LIMITS.summary),
    keyPoints: items,
    decisions: items,
    actions: items,
    questions: items,
  };
}

function partialOf(index: number, chars = 1_200): Notes {
  return {
    summary: 'r'.repeat(chars),
    keyPoints: [{ text: `Point ${index}`, sourceIds: [`${index}-0`, `${index}-1`] }],
    decisions: [],
    actions: [{ text: 'Envoyer le devis', sourceIds: [`${index}-2`] }],
    questions: [],
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

    const groups = groupPartials('Revue', partials);

    expect(groups.flat()).toEqual(partials);
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

describe('largest answer', () => {
  it('stays within the output cap at the measured 3.4 characters per token', () => {
    expect(JSON.stringify(worstCase(0)).length / 3.4).toBeLessThanOrEqual(OUTPUT_TOKENS);
  });
});

describe('reduceContext', () => {
  it('carries the partial notes and their sourceIds, never a transcript', () => {
    const context = JSON.parse(reduceContext('Revue', [partialOf(0), partialOf(1)])) as {
      title: string;
      partials: Notes[];
      transcript?: unknown;
    };

    expect(context.title).toBe('Revue');
    expect(context.transcript).toBeUndefined();
    expect(context.partials[1]?.keyPoints[0]?.sourceIds).toEqual(['1-0', '1-1']);
  });
});

describe('citedIds', () => {
  it('lists every id a set of notes cites', () => {
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
