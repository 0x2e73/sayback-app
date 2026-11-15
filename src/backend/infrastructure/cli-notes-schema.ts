// Closed objects and every key required: the form both `claude --json-schema` and
// `codex --output-schema` (OpenAI structured output) accept. The citations themselves are
// checked afterwards against the transcript ids, like for every other provider.
const noteItems = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'sourceIds'],
    properties: {
      text: { type: 'string' },
      sourceIds: { type: 'array', items: { type: 'string' } },
    },
  },
} as const;

export const cliNotesSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'keyPoints', 'decisions', 'actions', 'questions'],
  properties: {
    summary: { type: 'string' },
    keyPoints: noteItems,
    decisions: noteItems,
    actions: noteItems,
    questions: noteItems,
  },
} as const;
