// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { Result } from '../../../shared/contracts';
import { apiFor } from '../../test-api';
import { useModels } from './use-models';

it('ignores a previous provider response after a provider switch', async () => {
  const api = apiFor();
  let resolveOpenAi!: (value: Result<string[]>) => void;
  let resolveOllama!: (value: Result<string[]>) => void;
  api.listModels = (provider) =>
    new Promise((resolve) => {
      if (provider === 'openai') resolveOpenAi = resolve;
      if (provider === 'ollama') resolveOllama = resolve;
    });
  const { result } = renderHook(() => useModels(api));
  let first!: Promise<string[]>;
  let second!: Promise<string[]>;
  act(() => {
    first = result.current.load('openai');
  });
  act(() => {
    result.current.clear();
    second = result.current.load('ollama');
  });
  await act(async () => {
    resolveOllama({ ok: true, value: ['gemma3:latest'] });
    await second;
  });
  await act(async () => {
    resolveOpenAi({ ok: true, value: ['gpt-4o'] });
    await first;
  });
  expect(result.current.items).toEqual(['gemma3:latest']);
  expect(result.current.error).toBe('');
  expect(result.current.loading).toBe(false);
});
