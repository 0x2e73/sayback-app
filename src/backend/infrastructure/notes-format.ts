// Caps enforced by the grammar of the answer: a 4B model asked to merge many items otherwise rambles
// until the output cap cuts its JSON (observed: a merge of 7 partial notes ran to 900 tokens).
// Sized so that the largest possible answer stays near OUTPUT_TOKENS at the measured 3.4 chars/token.
export const NOTE_LIMITS = { summary: 400, items: 4, itemText: 120, sourceIds: 3 } as const;

const item = {
  type: 'object',
  properties: {
    text: { type: 'string', maxLength: NOTE_LIMITS.itemText },
    sourceIds: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: NOTE_LIMITS.sourceIds,
    },
  },
  required: ['text', 'sourceIds'],
} as const;
const list = { type: 'array', items: item, maxItems: NOTE_LIMITS.items } as const;

// Plain `format: 'json'` let qwen3.5:4b invent its own item keys (`id`, `sourceText`): the schema pins them.
export const notesFormat = {
  type: 'object',
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: NOTE_LIMITS.summary },
    keyPoints: list,
    decisions: list,
    actions: list,
    questions: list,
  },
  required: ['summary', 'keyPoints', 'decisions', 'actions', 'questions'],
} as const;
