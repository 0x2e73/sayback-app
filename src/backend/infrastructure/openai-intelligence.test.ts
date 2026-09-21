import { describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import { OpenAiIntelligence } from './openai-intelligence';
import type { Meeting } from '../../shared/contracts';

const meeting: Meeting = {
  id: 'meeting',
  title: 'Produit',
  createdAt: '',
  status: 'recorded',
  duration: 70,
  hasVideo: true,
  audioChunks: [],
  frames: [],
  transcript: [{ id: '0-0', start: 0, end: 3, text: 'Celui-ci.' }],
  notes: null,
  clarifications: [{ id: 'c1', at: 1, text: 'Le bouton Exporter', createdAt: '' }],
  error: null,
};
const validNotes = {
  summary: 'Exporter',
  keyPoints: [{ text: 'Revoir le bouton', sourceIds: ['0-0'] }],
  decisions: [],
  actions: [],
  questions: [],
};
function adapter(response: unknown, capture?: (body: BodyInit | null | undefined) => void) {
  const client = new OpenAI({
    apiKey: 'test-key',
    maxRetries: 0,
    fetch: async (_url, init) => {
      capture?.(init?.body);
      return new Response(JSON.stringify(response), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  return new OpenAiIntelligence(
    () => client,
    { readAudio: async () => Buffer.from('audio'), readFrame: async () => Buffer.from('image') },
    () => 'gpt-4.1-mini',
  );
}
function completion(notes: unknown) {
  return { choices: [{ message: { content: JSON.stringify(notes) } }] };
}
describe('OpenAI adapter', () => {
  it('keeps speaker labels scoped to their audio chunk', async () => {
    let request: BodyInit | null | undefined;
    const ai = adapter(
      { text: 'Bonjour', segments: [{ start: 1, end: 3, text: ' Bonjour ', speaker: 'A' }] },
      (body) => {
        request = body;
      },
    );
    expect(
      await ai.transcribe('meeting', { index: 2, start: 60, duration: 10, transcript: null }),
    ).toEqual([{ id: '2-0', start: 61, end: 63, text: 'Bonjour', speaker: 'A' }]);
    expect(request).toBeInstanceOf(FormData);
    const form = request as FormData;
    expect(form.get('model')).toBe('gpt-4o-transcribe-diarize');
    expect(form.get('response_format')).toBe('diarized_json');
    expect(form.get('chunking_strategy')).toBe('auto');
  });
  it('includes human clarification and accepts only grounded notes', async () => {
    let prompt = '';
    const ai = adapter(completion(validNotes), (body) => {
      prompt = String(body);
    });
    expect(await ai.summarize(meeting)).toEqual(validNotes);
    expect(prompt).toContain('Le bouton Exporter');
    expect(prompt).toContain('Celui-ci.');
  });
  it('drops a hallucinated source ID and keeps the grounded report', async () => {
    const ai = adapter(
      completion({ ...validNotes, decisions: [{ text: 'Faux', sourceIds: ['missing'] }] }),
    );

    const result = await ai.summarize(meeting);

    expect(result.decisions).toEqual([]);
    expect(result.keyPoints).toEqual(validNotes.keyPoints);
  });
  it('rejects notes whose every citation is hallucinated', async () => {
    const ai = adapter(
      completion({
        summary: 'Résumé.',
        keyPoints: [{ text: 'Faux', sourceIds: ['missing'] }],
        decisions: [],
        actions: [],
        questions: [],
      }),
    );

    await expect(ai.summarize(meeting)).rejects.toThrow(/missing/);
  });
  it('rejects malformed structured output', async () => {
    await expect(
      adapter(completion({ summary: 'Incomplet' })).summarize(meeting),
    ).rejects.toThrow();
  });
  it('handles refusal without inventing notes', async () => {
    await expect(
      adapter({ choices: [{ message: { content: null, refusal: 'Refused' } }] }).summarize(meeting),
    ).rejects.toThrow(/notes/i);
  });
});
