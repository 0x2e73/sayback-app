import { describe, expect, it } from 'vitest';
import { CONTEXT_TOKENS, OUTPUT_TOKENS, PROMPT_BUDGET, estimateTokens } from './ollama-budget';

describe('estimateTokens', () => {
  it('counts digits and CJK characters as one token each', () => {
    expect(estimateTokens('2026')).toBe(4);
    expect(estimateTokens('会议决定下周发布')).toBe(8);
  });

  it('counts other text at 2.5 characters per token', () => {
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('budget', () => {
  it('leaves the window minus the output cap and the request overhead for the prompt', () => {
    expect(PROMPT_BUDGET).toBeLessThan(CONTEXT_TOKENS - OUTPUT_TOKENS);
    expect(PROMPT_BUDGET).toBe(2796);
  });
});
