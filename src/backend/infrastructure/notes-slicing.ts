import type { Meeting } from '../../shared/contracts';
import { type CitableBlock, citableBlocks } from './notes-context';
import { PROMPT_BUDGET, estimateTokens } from './ollama-budget';

export interface SliceClarification {
  id: string;
  at: number;
  text: string;
}

/** One call's worth of a meeting: consecutive blocks and the clarifications in their time span. */
export interface NotesSlice {
  blocks: CitableBlock[];
  clarifications: SliceClarification[];
}

type Entry =
  | { at: number; tokens: number; block: CitableBlock }
  | { at: number; tokens: number; clarification: SliceClarification };

export function sliceSourceIds(slice: NotesSlice): string[] {
  return [...slice.blocks.map((block) => block.id), ...slice.clarifications.map((item) => item.id)];
}

export function sliceContext(title: string, slice: NotesSlice): string {
  return JSON.stringify({
    title,
    transcript: slice.blocks,
    clarifications: slice.clarifications,
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

function sliceOf(group: Entry[]): NotesSlice {
  return {
    blocks: group.flatMap((entry) => ('block' in entry ? [entry.block] : [])),
    clarifications: group.flatMap((entry) =>
      'clarification' in entry ? [entry.clarification] : [],
    ),
  };
}

/** Splits a meeting into slices that each fit the model window, instruction included. */
export function planSlices(meeting: Meeting, instructionTokens: number): NotesSlice[] {
  const wrapper = estimateTokens(sliceContext(meeting.title, sliceOf([])));
  const budget = PROMPT_BUDGET - instructionTokens - wrapper;
  const groups = pack(entriesOf(meeting), budget);
  return (groups.length ? groups : [[]]).map(sliceOf);
}
