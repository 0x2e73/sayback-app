import { expect, it, vi } from 'vitest';
import { ProviderModels } from './provider-models';

it('lists Claude models with the selected provider key', async () => {
  const request = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
    expect(options?.headers).toMatchObject({ 'x-api-key': 'sk-ant-private' });
    return new Response(
      JSON.stringify({ data: [{ id: 'claude-a' }, { id: 'claude-b' }], has_more: false }),
    );
  });
  const models = new ProviderModels(
    { list: async () => ['gpt-4.1-mini'] },
    () => 'sk-ant-private',
    request as typeof fetch,
  );
  expect(await models.list('anthropic')).toEqual(['claude-a', 'claude-b']);
  expect(request).toHaveBeenCalledOnce();
});

it('lists only locally installed Ollama models', async () => {
  const request = vi.fn(async (url: string | URL | Request) => {
    expect(String(url)).toBe('http://127.0.0.1:11434/api/tags');
    return new Response(
      JSON.stringify({
        models: [
          { name: 'gemma3:latest' },
          { name: 'qwen:latest' },
          { name: 'remote-alias', remote_host: 'https://ollama.com' },
        ],
      }),
    );
  });
  const models = new ProviderModels({ list: async () => [] }, () => '', request as typeof fetch);
  expect(await models.list('ollama')).toEqual(['gemma3:latest', 'qwen:latest']);
});

it('lists Gemini models capable of generateContent', async () => {
  const request = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          models: [
            { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] },
          ],
        }),
      ),
  );
  const models = new ProviderModels(
    { list: async () => [] },
    () => '',
    request as typeof fetch,
    () => 'key',
  );
  expect(await models.list('gemini')).toEqual(['gemini-2.5-flash']);
});

it('lists models from a compatible API', async () => {
  const request = vi.fn(async (url: string | URL | Request) => {
    expect(String(url)).toBe('https://openrouter.ai/api/v1/models');
    return new Response(JSON.stringify({ data: [{ id: 'vendor/model' }] }));
  });
  const models = new ProviderModels(
    { list: async () => [] },
    () => '',
    request as typeof fetch,
    () => '',
    () => ({ key: 'key', baseUrl: 'https://openrouter.ai/api/v1' }),
  );
  expect(await models.list('compatible')).toEqual(['vendor/model']);
});
