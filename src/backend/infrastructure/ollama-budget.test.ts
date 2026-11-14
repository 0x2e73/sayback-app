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

describe('estimateTokens on dense scripts', () => {
  it.each([
    ['Arabic', 'مرحبا بكم'],
    ['Cyrillic', 'Привет всем'],
    ['Greek', 'Γεια σας'],
    ['Thai', 'สวัสดีครับ'],
    ['Devanagari', 'नमस्ते दुनिया'],
    ['Hangul', '안녕하세요'],
    ['Kana', 'こんにちは'],
    ['Han', '会议决定'],
  ])('counts every %s letter as one token', (_script, text) => {
    const letters = [...text].filter((char) => /[\p{L}\p{M}]/u.test(char)).length;

    expect(estimateTokens(text)).toBeGreaterThanOrEqual(letters);
  });

  it('keeps Latin text, accents included, at 2.5 characters per token', () => {
    expect(estimateTokens('réunion élargie')).toBe(Math.ceil(15 / 2.5));
  });
});

describe('budget', () => {
  it('leaves the window minus the output cap and the request overhead for the prompt', () => {
    expect(PROMPT_BUDGET).toBeLessThan(CONTEXT_TOKENS - OUTPUT_TOKENS);
    expect(PROMPT_BUDGET).toBe(2796);
  });
});
