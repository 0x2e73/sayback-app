import { describe, expect, it, vi } from 'vitest';
import type { Meeting } from '../../shared/contracts';
import { AnthropicNotes } from './anthropic-notes';
import { GeminiIntelligence } from './gemini-intelligence';
import { CompatibleNotes } from './compatible-notes';

const meeting: Meeting = {
  id: 'meeting',
  title: 'Revue produit',
  createdAt: '',
  status: 'recorded',
  duration: 30,
  hasVideo: true,
  audioChunks: [],
  frames: [{ index: 0, at: 5 }],
  transcript: [{ id: '0-0', start: 0, end: 4, text: 'Gardons mardi.' }],
  notes: null,
  clarifications: [],
  error: null,
};
const notes = {
  summary: 'La date reste mardi.',
  keyPoints: [{ text: 'Lancement mardi', sourceIds: ['0-0'] }],
  decisions: [],
  actions: [],
  questions: [],
};
const media = {
  readAudio: async () => Buffer.from('audio'),
  readFrame: async () => Buffer.from('image'),
};

function answering(payload: unknown) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(payload) }] })),
  );
}

describe('Claude notes', () => {
  it('sends transcript and images with the personal key and validates citations', async () => {
    const request = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      expect(options?.headers).toMatchObject({ 'x-api-key': 'sk-ant-private' });
      const body = JSON.parse(String(options?.body)) as { messages: Array<{ content: unknown }> };
      expect(JSON.stringify(body.messages)).toContain('Gardons mardi.');
      expect(JSON.stringify(body.messages)).toContain('image/jpeg');
      return new Response(
        JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(notes) }] }),
      );
    });
    const provider = new AnthropicNotes(
      () => 'sk-ant-private',
      () => 'claude-model',
      media,
      request as typeof fetch,
    );
    expect(await provider.summarize(meeting)).toEqual(notes);
    expect(request).toHaveBeenCalledOnce();
  });

  it('drops an invented citation instead of losing the whole report', async () => {
    const provider = new AnthropicNotes(
      () => 'key',
      () => 'claude-model',
      media,
      answering({
        ...notes,
        decisions: [{ text: 'Invention', sourceIds: ['missing'] }],
      }) as typeof fetch,
    );

    const result = await provider.summarize(meeting);

    expect(result.decisions).toEqual([]);
    expect(result.keyPoints).toEqual(notes.keyPoints);
    expect(result.summary).toBe(notes.summary);
  });

  it('names the invented ids when nothing at all is cited correctly', async () => {
    const provider = new AnthropicNotes(
      () => 'key',
      () => 'claude-model',
      media,
      answering({
        summary: 'Résumé.',
        keyPoints: [{ text: 'Invention', sourceIds: ['missing'] }],
        decisions: [],
        actions: [],
        questions: [],
      }) as typeof fetch,
    );

    await expect(provider.summarize(meeting)).rejects.toThrow(/missing/);
  });
});

it('uses the Gemini key, transcript and screen frames for grounded notes', async () => {
  const request = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
    expect(options?.headers).toMatchObject({ 'x-goog-api-key': 'gemini-private' });
    expect(String(options?.body)).toContain('image/jpeg');
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(notes) }] } }] }),
    );
  });
  const provider = new GeminiIntelligence(
    () => 'gemini-private',
    () => 'gemini-2.5-flash',
    media,
    request as typeof fetch,
  );
  expect(await provider.summarize(meeting)).toEqual(notes);
});

it('maps Gemini audio timestamps to the original meeting', async () => {
  const request = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: JSON.stringify({ segments: [{ start: 1, end: 3, text: 'Bonjour.' }] }) },
                ],
              },
            },
          ],
        }),
      ),
  );
  const provider = new GeminiIntelligence(
    () => 'key',
    () => 'gemini-2.5-flash',
    media,
    request as typeof fetch,
  );
  expect(
    await provider.transcribe(meeting.id, { index: 2, start: 60, duration: 30, transcript: null }),
  ).toEqual([{ id: '2-0', start: 61, end: 63, text: 'Bonjour.' }]);
});

it('uses a user-selected compatible endpoint and validates note sources', async () => {
  const request = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(options?.headers).toMatchObject({ authorization: 'Bearer private-key' });
    expect(String(options?.body)).toContain('image_url');
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(notes) } }] }),
    );
  });
  const provider = new CompatibleNotes(
    () => 'https://openrouter.ai/api/v1',
    () => 'private-key',
    () => 'openai/gpt-4o',
    media,
    request as typeof fetch,
  );
  expect(await provider.summarize(meeting)).toEqual(notes);
});

it('uses a local compatible server without an API key', async () => {
  const request = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
    expect(options?.headers).not.toHaveProperty('authorization');
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(notes) } }] }),
    );
  });
  const provider = new CompatibleNotes(
    () => 'http://127.0.0.1:1234/v1',
    () => '',
    () => 'local-model',
    media,
    request as typeof fetch,
  );
  expect(await provider.summarize(meeting)).toEqual(notes);
});
