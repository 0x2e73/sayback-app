import type { Frame, Meeting } from '../../shared/contracts';
import { type CitableBlock, citableBlocks } from './notes-context';
import { FRAME_TOKENS, MAX_FRAMES_PER_CALL, PROMPT_BUDGET, estimateTokens } from './ollama-budget';

export interface SliceClarification {
  id: string;
  at: number;
  text: string;
}

/** One call's worth of a meeting: consecutive blocks, the clarifications in their time span, a few frames. */
export interface NotesSlice {
  blocks: CitableBlock[];
  clarifications: SliceClarification[];
  frames: Frame[];
}

type Entry =
  | { at: number; tokens: number; block: CitableBlock }
  | { at: number; tokens: number; clarification: SliceClarification };

export function sliceContext(title: string, slice: NotesSlice): string {
  const screens = slice.frames.map(
    (frame, index) => `Image ${index + 1} : écran à ${frame.at.toFixed(1)} secondes`,
  );
  return JSON.stringify({
    title,
    transcript: slice.blocks,
    clarifications: slice.clarifications,
    ...(screens.length ? { screens } : {}),
  });
}

function entriesOf(meeting: Meeting): Entry[] {
  const blocks = citableBlocks(meeting.transcript).map((block): Entry => {
    return { at: block.start, tokens: estimateTokens(`${JSON.stringify(block)},`), block };
  });
  const clarifications = meeting.clarifications.map((item): Entry => {
    const clarification = { id: `clarification:${item.id}`, at: item.at, text: item.text };
    return {
      at: item.at,
      tokens: estimateTokens(`${JSON.stringify(clarification)},`),
      clarification,
    };
  });
  // Blocks come first at equal times: a slice should start with something to cite.
  return [...blocks, ...clarifications].sort((a, b) => a.at - b.at);
}

function pack(entries: Entry[], budget: number): Entry[][] {
  const groups: Entry[][] = [];
  let used = 0;
  for (const entry of entries) {
    const open = groups[groups.length - 1];
    if (open && used + entry.tokens <= budget) {
      open.push(entry);
      used += entry.tokens;
      continue;
    }
    groups.push([entry]);
    used = entry.tokens;
  }
  return groups;
}

function evenly<T>(items: T[], count: number): T[] {
  return Array.from(
    { length: count },
    (_unused, index) => items[Math.floor(((index + 0.5) * items.length) / count)],
  ).flatMap((item) => (item === undefined ? [] : [item]));
}

function sliceOf(group: Entry[]): NotesSlice {
  return {
    blocks: group.flatMap((entry) => ('block' in entry ? [entry.block] : [])),
    clarifications: group.flatMap((entry) =>
      'clarification' in entry ? [entry.clarification] : [],
    ),
    frames: [],
  };
}

/**
 * Splits a meeting into slices that each fit the model window, instruction and frames included.
 * Room for one frame is kept in every slice of a meeting that has frames; a slice with spare room
 * takes more, up to MAX_FRAMES_PER_CALL.
 */
export function planSlices(meeting: Meeting, instructionTokens: number): NotesSlice[] {
  const reserved = meeting.frames.length ? FRAME_TOKENS : 0;
  const wrapper = estimateTokens(sliceContext(meeting.title, sliceOf([])));
  const budget = PROMPT_BUDGET - instructionTokens - wrapper - reserved;
  const groups = pack(entriesOf(meeting), budget);
  const starts = groups.map((group, index) => (index === 0 ? -Infinity : (group[0]?.at ?? 0)));
  return (groups.length ? groups : [[]]).map((group, index) => {
    const slice = sliceOf(group);
    const end = starts[index + 1] ?? Infinity;
    const inRange = meeting.frames.filter(
      (frame) => frame.at >= (starts[index] ?? -Infinity) && frame.at < end,
    );
    const room =
      PROMPT_BUDGET - instructionTokens - estimateTokens(sliceContext(meeting.title, slice));
    const count = Math.min(inRange.length, MAX_FRAMES_PER_CALL, Math.floor(room / FRAME_TOKENS));
    return { ...slice, frames: evenly(inRange, count) };
  });
}
