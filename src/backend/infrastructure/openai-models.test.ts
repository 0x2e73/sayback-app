import { expect, it, vi } from 'vitest';
import { OpenAiModels } from './openai-models';

it('lists every accessible model once in alphabetical order', async () => {
  const list = vi.fn().mockResolvedValue({
    data: [{ id: 'gpt-4o' }, { id: 'whisper-1' }, { id: 'gpt-4o' }, { id: 'gpt-4.1-mini' }],
  });
  const models = new OpenAiModels(() => ({ models: { list } }));

  await expect(models.list()).resolves.toEqual(['gpt-4.1-mini', 'gpt-4o', 'whisper-1']);
  expect(list).toHaveBeenCalledOnce();
});
