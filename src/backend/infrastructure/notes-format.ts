// Caps enforced by the grammar of the answer: a 4B model asked to merge many items otherwise rambles
// until the output cap cuts its JSON. A slice answer (map and single call) holds every list; a merge
// answer holds only summary, keyPoints and questions: decisions and actions never go through a merge.
// The prompt asks for PROMPT_ITEM_CHARS characters per item; the grammar cap is only a runaway guard.
export const PROMPT_ITEM_CHARS = 140;
export const SLICE_LIMITS = {
  summary: 350,
  keyPoints: 3,
  decisions: 4,
  actions: 4,
  questions: 3,
  itemText: 160,
  sourceIds: 2,
} as const;

export const MERGE_LIMITS = {
  summary: 500,
  keyPoints: 6,
  questions: 4,
  itemText: 160,
  sourceIds: 2,
} as const;

// A model id is short; the bound keeps a runaway string out of an error shown to the user.
const ID_MAX_LENGTH = 64;

function itemFormat(itemText: number, sourceIds: number, allowed?: string[]) {
  return {
    type: 'object',
    properties: {
      text: { type: 'string', minLength: 1, maxLength: itemText },
      sourceIds: {
        type: 'array',
        items: { type: 'string', maxLength: ID_MAX_LENGTH, ...(allowed ? { enum: allowed } : {}) },
        minItems: 1,
        maxItems: sourceIds,
      },
    },
    required: ['text', 'sourceIds'],
  } as const;
}

function listFormat(max: number, limits: { itemText: number; sourceIds: number }, ids?: string[]) {
  return {
    type: 'array',
    items: itemFormat(limits.itemText, limits.sourceIds, ids),
    maxItems: max,
  } as const;
}

// Plain `format: 'json'` let qwen3.5:4b invent its own item keys (`id`, `sourceText`): the schema pins
// them, and `enum` keeps the ids to those of the extract (proven honoured on Ollama 0.40.15).
export function sliceFormat(allowedIds?: string[]) {
  const list = (max: number) => listFormat(max, SLICE_LIMITS, allowedIds);
  return {
    type: 'object',
    properties: {
      summary: { type: 'string', minLength: 1, maxLength: SLICE_LIMITS.summary },
      keyPoints: list(SLICE_LIMITS.keyPoints),
      decisions: list(SLICE_LIMITS.decisions),
      actions: list(SLICE_LIMITS.actions),
      questions: list(SLICE_LIMITS.questions),
    },
    required: ['summary', 'keyPoints', 'decisions', 'actions', 'questions'],
  } as const;
}

export function mergeFormat(allowedIds?: string[]) {
  const list = (max: number) => listFormat(max, MERGE_LIMITS, allowedIds);
  return {
    type: 'object',
    properties: {
      summary: { type: 'string', minLength: 1, maxLength: MERGE_LIMITS.summary },
      keyPoints: list(MERGE_LIMITS.keyPoints),
      questions: list(MERGE_LIMITS.questions),
    },
    required: ['summary', 'keyPoints', 'questions'],
  } as const;
}
