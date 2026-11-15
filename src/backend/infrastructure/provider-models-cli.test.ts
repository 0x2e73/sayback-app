import { expect, it, vi } from 'vitest';
import { ProviderModels } from './provider-models';

it('asks the installed CLI for the models of Claude Code and Codex, never the network', async () => {
  const request = vi.fn();
  const cli = { models: vi.fn(async (provider: string) => ['default', `${provider}-model`]) };
  const models = new ProviderModels(
    { list: async () => [] },
    () => '',
    request as unknown as typeof fetch,
    () => '',
    undefined,
    cli,
  );

  expect(await models.list('claude-code')).toEqual(['default', 'claude-code-model']);
  expect(await models.list('codex')).toEqual(['default', 'codex-model']);
  expect(request).not.toHaveBeenCalled();
});
