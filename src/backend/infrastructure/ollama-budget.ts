// Ollama's default window, pinned on every request through options.num_ctx.
export const CONTEXT_TOKENS = 4096;
// Real answers took 170 to 650 tokens; the largest answer the grammar allows is 1105 tokens (pretty-printed, French text, measured).
export const OUTPUT_TOKENS = 1200;
// Measured on French transcript JSON: 3.08 (qwen3.5:4b) and 2.86 (gemma3:4b); rounded down.
export const CHARS_PER_TOKEN = 2.5;
// Measured chat template cost: 13 tokens; the rest is safety.
export const REQUEST_OVERHEAD_TOKENS = 100;
export const MAX_REDUCE_ROUNDS = 8;
export const REQUEST_TIMEOUT_MS = 300_000;

export const PROMPT_BUDGET = CONTEXT_TOKENS - OUTPUT_TOKENS - REQUEST_OVERHEAD_TOKENS;

// Digits and every non-Latin letter or mark (CJK, Arabic, Cyrillic, Thai, Devanagari...) cost about one
// token each (measured 1.65 characters per token on digit-heavy French, 1.74 on Chinese); whisper runs
// with `-l auto`, so the text can be in any language.
const DENSE_CHARACTER =
  /\p{Nd}|(?![\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}])[\p{L}\p{M}]/gu;

export function estimateTokens(text: string): number {
  const dense = text.match(DENSE_CHARACTER)?.length ?? 0;
  return Math.ceil((text.length - dense) / CHARS_PER_TOKEN) + dense;
}
