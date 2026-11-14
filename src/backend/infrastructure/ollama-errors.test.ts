import { describe, expect, it } from 'vitest';
import { echoNotes, fakeOllama, meetingOf } from './ollama-fake.test-support';
import { OllamaNotes } from './ollama-notes';

const media = {
  readAudio: async () => Buffer.from('audio'),
  readFrame: async () => Buffer.from('image'),
};

function summarize(request: typeof fetch, blocks = 3) {
  return new OllamaNotes(() => 'qwen3.5:4b', media, request).summarize(meetingOf({ blocks }));
}

function counted(content: string, reason: string, prompt: number): Response {
  return new Response(
    JSON.stringify({
      message: { role: 'assistant', content },
      done: true,
      done_reason: reason,
      prompt_eval_count: prompt,
    }),
  );
}

function cutOff(content: string, reason: string): Response {
  return new Response(
    JSON.stringify({ message: { role: 'assistant', content }, done: true, done_reason: reason }),
  );
}

describe('Ollama notes failures', () => {
  it('names the refusal and its code when Ollama rejects the request', async () => {
    const { request } = fakeOllama(() => new Response('{}', { status: 500 }));

    await expect(summarize(request)).rejects.toThrow(/refusé la demande \(code 500\)/);
  });

  it('says the answer was cut instead of blaming the model', async () => {
    const { request } = fakeOllama(() => cutOff('{"summary": "Début', 'length'));

    const failure = summarize(request);

    await expect(failure).rejects.toThrow(/coupé sa réponse/);
    await expect(failure).rejects.not.toThrow(/modèle de vision/);
  });

  it('says the notes are unreadable when the JSON is invalid, not that the model lacks vision', async () => {
    const { request } = fakeOllama(() => cutOff('pas du json', 'stop'));

    const failure = summarize(request);

    await expect(failure).rejects.toThrow(/notes illisibles/);
    await expect(failure).rejects.not.toThrow(/modèle de vision/);
  });

  it('says the notes are unreadable when the JSON does not match the notes format', async () => {
    const { request } = fakeOllama(() => cutOff('{"summary": 3}', 'stop'));

    await expect(summarize(request)).rejects.toThrow(/notes illisibles/);
  });

  it('reports an empty answer', async () => {
    const { request } = fakeOllama(() => cutOff('', 'stop'));

    await expect(summarize(request)).rejects.toThrow(/réponse vide/);
  });

  it('reports a timeout apart from an unreachable server', async () => {
    const slow = (async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }) as typeof fetch;
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;

    await expect(summarize(slow)).rejects.toThrow(/trop de temps/);
    await expect(summarize(down)).rejects.toThrow(/inaccessible/);
  });

  it('says the part is too dense, with no retry advice, when a cut answer had no room left', async () => {
    const { request } = fakeOllama(() => counted('{"summary": "secret', 'length', 3_000));

    const failure = summarize(request);

    await expect(failure).rejects.toThrow(/trop dense pour la fenêtre/);
    await expect(failure).rejects.toThrow(/fournisseur à plus grande capacité/);
    await expect(failure).rejects.not.toThrow(/Relancez/);
    await expect(failure).rejects.not.toThrow(/secret/);
  });

  it('says the part is too dense when an unreadable answer had no room left', async () => {
    const { request } = fakeOllama(() => counted('pas du json', 'stop', 3_000));

    await expect(summarize(request)).rejects.toThrow(/trop dense pour la fenêtre/);
  });

  it('keeps an answer that ended on its own and parses, whatever the prompt cost', async () => {
    const { request } = fakeOllama((call) =>
      counted(JSON.stringify(echoNotes(call)), 'stop', 3_000),
    );

    await expect(summarize(request)).resolves.toMatchObject({ summary: 'Extrait' });
  });

  it('keeps the plain cut-answer message when the prompt left room', async () => {
    const { request } = fakeOllama(() => counted('{"summary": "Début', 'length', 2_000));

    await expect(summarize(request)).rejects.toThrow(/coupé sa réponse/);
  });

  it('keeps the error about citations that match no transcript block, without echoing ids', async () => {
    const { request } = fakeOllama(() => ({
      summary: 'Résumé.',
      keyPoints: [{ text: 'Invention', sourceIds: ['missing'] }],
      decisions: [],
      actions: [],
      questions: [],
    }));

    await expect(summarize(request)).rejects.toThrow(/aucune source réelle\. Relancez/);
    await expect(summarize(request)).rejects.not.toThrow(/missing/);
  });

  it('fails the whole analysis, with a precise cause, when one slice is cut', async () => {
    const { request, calls } = fakeOllama((call, index) =>
      index === 2 ? cutOff('{"summary"', 'length') : echoNotes(call),
    );

    await expect(summarize(request, 68)).rejects.toThrow(/coupé sa réponse/);
    expect(calls).toHaveLength(3);
  });

  it('keeps the meeting retryable: a second attempt starts from scratch', async () => {
    let failing = true;
    const { request } = fakeOllama((call) => {
      if (failing) return cutOff('', 'stop');
      return echoNotes(call);
    });
    const provider = new OllamaNotes(() => 'qwen3.5:4b', media, request);
    const meeting = meetingOf({ blocks: 68 });

    await expect(provider.summarize(meeting)).rejects.toThrow(/réponse vide/);
    failing = false;

    await expect(provider.summarize(meeting)).resolves.toMatchObject({ summary: 'Fusion' });
  });
});
