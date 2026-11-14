import { describe, expect, it } from 'vitest';
import { FRAME_TOKENS, MAX_FRAMES_PER_CALL, PROMPT_BUDGET, estimateTokens } from './ollama-budget';
import { meetingOf } from './ollama-fake';
import { planSlices, sliceContext } from './notes-slicing';

const instructionTokens = 400;
const emptySlice = { blocks: [], clarifications: [], frames: [] };

function used(slice: ReturnType<typeof planSlices>[number], title = 'Revue produit'): number {
  return (
    instructionTokens +
    estimateTokens(sliceContext(title, slice)) +
    slice.frames.length * FRAME_TOKENS
  );
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

  it('keeps every slice, with its frames, under the prompt budget', () => {
    const slices = planSlices(meetingOf({ blocks: 90, frames: 143 }), instructionTokens);

    for (const slice of slices) expect(used(slice)).toBeLessThanOrEqual(PROMPT_BUDGET);
  });

  it('gives each frame to the slice that covers its time, at most once', () => {
    const meeting = meetingOf({ blocks: 90, frames: 143 });

    const slices = planSlices(meeting, instructionTokens);

    const sent = slices.flatMap((slice) => slice.frames.map((frame) => frame.index));
    expect(new Set(sent).size).toBe(sent.length);
    expect(sent.length).toBeGreaterThan(slices.length / 2);
    slices.forEach((slice, position) => {
      const start = position === 0 ? 0 : (slice.blocks[0]?.start ?? 0);
      const end = slices[position + 1]?.blocks[0]?.start ?? Number.POSITIVE_INFINITY;
      expect(slice.frames.length).toBeLessThanOrEqual(MAX_FRAMES_PER_CALL);
      for (const frame of slice.frames) {
        expect(frame.at).toBeGreaterThanOrEqual(start);
        expect(frame.at).toBeLessThan(end);
      }
    });
  });

  it('reserves room for a frame only when the meeting has frames', () => {
    const without = planSlices(meetingOf({ blocks: 68 }), instructionTokens);
    const withFrames = planSlices(meetingOf({ blocks: 68, frames: 40 }), instructionTokens);

    expect(withFrames.length).toBeGreaterThan(without.length);
  });

  it('hands each clarification to the slice that covers its time and counts its size', () => {
    const meeting = meetingOf({
      blocks: 40,
      clarifications: [
        { id: 'early', at: 0, text: 'Contexte.', createdAt: '' },
        { id: 'middle', at: 900, text: 'x'.repeat(1_500), createdAt: '' },
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
});
