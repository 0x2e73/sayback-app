import { describe, expect, it } from 'vitest';
import { MERGE_LIMITS, SLICE_LIMITS, mergeFormat, sliceFormat } from './notes-format';
import { OUTPUT_TOKENS } from './ollama-budget';
import { frenchText } from './ollama-fake.test-support';

function items(count: number, seed: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    text: frenchText(SLICE_LIMITS.itemText),
    sourceIds: [`${100 + seed + index}-0`, `${200 + seed + index}-1`],
  }));
}

// The largest answer the slice grammar allows, with realistic French.
const worstSlice = {
  summary: frenchText(SLICE_LIMITS.summary),
  keyPoints: items(SLICE_LIMITS.keyPoints, 0),
  decisions: items(SLICE_LIMITS.decisions, 10),
  actions: items(SLICE_LIMITS.actions, 20),
  questions: items(SLICE_LIMITS.questions, 30),
};

describe('answer size', () => {
  // Measured on Ollama 0.40.15: 3166 compact characters are 763 tokens, 3913 pretty ones 1105.
  it('keeps the largest compact slice answer inside the output cap at 3.0 characters per token', () => {
    expect(JSON.stringify(worstSlice).length / 3.0).toBeLessThanOrEqual(OUTPUT_TOKENS);
  });

  it('keeps the pretty-printed answer, which the grammar produces, inside the cap at the measured 3.5', () => {
    expect(JSON.stringify(worstSlice, null, 2).length / 3.5).toBeLessThanOrEqual(OUTPUT_TOKENS);
  });
});

describe('sliceFormat', () => {
  it('caps every list at its slice limit and asks for the notes keys', () => {
    const format = sliceFormat();

    expect(format.required).toEqual(['summary', 'keyPoints', 'decisions', 'actions', 'questions']);
    expect(format.properties.keyPoints.maxItems).toBe(SLICE_LIMITS.keyPoints);
    expect(format.properties.decisions.maxItems).toBe(SLICE_LIMITS.decisions);
    expect(format.properties.actions.maxItems).toBe(SLICE_LIMITS.actions);
    expect(format.properties.questions.maxItems).toBe(SLICE_LIMITS.questions);
    expect(format.properties.summary.maxLength).toBe(SLICE_LIMITS.summary);
  });

  it('bounds every id, so a runaway string cannot reach an error message', () => {
    const ids = sliceFormat().properties.keyPoints.items.properties.sourceIds;

    expect(ids.items.maxLength).toBe(64);
    expect(ids.minItems).toBe(1);
    expect(ids.maxItems).toBe(SLICE_LIMITS.sourceIds);
  });

  it('restricts the ids to those of the extract when they are given', () => {
    const allowed = sliceFormat(['3-0', '3-1']).properties.actions.items.properties.sourceIds.items;
    const open = sliceFormat().properties.actions.items.properties.sourceIds.items;

    expect(allowed).toMatchObject({ enum: ['3-0', '3-1'] });
    expect(open).not.toHaveProperty('enum');
  });
});

describe('mergeFormat', () => {
  it('holds only summary, key points and questions: decisions and actions never reach a merge', () => {
    const format = mergeFormat(['1-0']);

    expect(Object.keys(format.properties)).toEqual(['summary', 'keyPoints', 'questions']);
    expect(format.properties.keyPoints.maxItems).toBe(MERGE_LIMITS.keyPoints);
    expect(format.properties.questions.maxItems).toBe(MERGE_LIMITS.questions);
    expect(format.properties.keyPoints.items.properties.sourceIds.items).toMatchObject({
      enum: ['1-0'],
    });
  });

  it('allows no key point and no question when there is no id to cite', () => {
    const format = mergeFormat([]);

    expect(format.properties.keyPoints.maxItems).toBe(0);
    expect(format.properties.questions.maxItems).toBe(0);
    expect(format.properties.keyPoints.items.properties.sourceIds.items).not.toHaveProperty('enum');
  });
});
