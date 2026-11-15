import { describe, expect, it } from 'vitest';
import { PROMPT_BUDGET, estimateTokens } from './ollama-budget';
import { frenchText, meetingOf } from './ollama-fake.test-support';
import { planSlices, sliceContext, sliceSourceIds } from './notes-slicing';

const instructionTokens = 400;
const emptySlice = { blocks: [], clarifications: [] };

function used(slice: ReturnType<typeof planSlices>[number], title = 'Revue produit'): number {
  return instructionTokens + estimateTokens(sliceContext(title, slice));
}

describe('planSlices', () => {
  it('keeps a short meeting in a single slice', () => {
    const slices = planSlices(meetingOf({ blocks: 4 }), instructionTokens);

    expect(slices).toHaveLength(1);
    expect(slices[0]?.blocks.map((block) => block.id)).toEqual(['0-0', '1-0', '2-0', '3-0']);
  });

  it('splits a long meeting on block boundaries without losing or repeating a block', () => {
    const meeting = meetingOf({ blocks: 68 });

    const slices = planSlices(meeting, instructionTokens);

    expect(slices.length).toBeGreaterThan(3);
    expect(slices.flatMap((slice) => slice.blocks.map((block) => block.id))).toEqual(
      meeting.transcript.map((segment) => segment.id),
    );
  });

  it('keeps every slice under the prompt budget', () => {
    const slices = planSlices(meetingOf({ blocks: 90 }), instructionTokens);

    for (const slice of slices) expect(used(slice)).toBeLessThanOrEqual(PROMPT_BUDGET);
  });

  it('plans the same slices for a meeting with screen frames as for one without', () => {
    const without = planSlices(meetingOf({ blocks: 90 }), instructionTokens);

    const withFrames = planSlices(meetingOf({ blocks: 90, frames: 143 }), instructionTokens);

    expect(withFrames).toEqual(without);
  });

  it('hands each clarification to the slice that covers its time and counts its size', () => {
    const meeting = meetingOf({
      blocks: 40,
      clarifications: [
        { id: 'early', at: 0, text: 'Contexte.', createdAt: '' },
        { id: 'middle', at: 900, text: frenchText(1_500), createdAt: '' },
        { id: 'late', at: 99_999, text: 'Fin.', createdAt: '' },
      ],
    });

    const slices = planSlices(meeting, instructionTokens);

    const owner = (id: string) =>
      slices.findIndex((slice) =>
        slice.clarifications.some((item) => item.id === `clarification:${id}`),
      );
    expect(owner('early')).toBe(0);
    expect(owner('late')).toBe(slices.length - 1);
    const middle = owner('middle');
    expect(slices[middle]?.blocks[0]?.start).toBeLessThanOrEqual(900);
    expect(slices[middle + 1]?.blocks[0]?.start).toBeGreaterThan(900);
    for (const slice of slices) expect(used(slice)).toBeLessThanOrEqual(PROMPT_BUDGET);
  });

  it('exposes clarifications with the ids the model must cite', () => {
    const meeting = meetingOf({
      blocks: 2,
      clarifications: [{ id: 'c1', at: 10, text: 'Précision.', createdAt: '' }],
    });

    const [slice] = planSlices(meeting, instructionTokens);

    expect(slice).toBeDefined();
    const context = JSON.parse(sliceContext('Revue', slice ?? emptySlice)) as {
      clarifications: Array<{ id: string }>;
    };
    expect(context.clarifications.map((item) => item.id)).toEqual(['clarification:c1']);
  });

  it('lists the ids an extract may cite: its blocks and its clarifications', () => {
    const slice = {
      blocks: [{ id: '1-0', start: 0, end: 4, text: 'a' }],
      clarifications: [{ id: 'clarification:c', at: 2, text: 'b' }],
    };

    expect(sliceSourceIds(slice)).toEqual(['1-0', 'clarification:c']);
  });
});
