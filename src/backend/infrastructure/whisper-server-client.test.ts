import { describe, expect, it, vi } from 'vitest';
import {
  MAX_INFERENCE_BYTES,
  WhisperServerClient,
  wavFromPcm,
  whisperServerHealthy,
} from './whisper-server-client';

const BASE = 'http://127.0.0.1:50123/secret-token';
const never = new AbortController().signal;

function answering(response: Response) {
  return vi.fn<typeof fetch>(async () => response);
}

/** A body sent in pieces, without a length announced first. */
function streamed(chunks: number, size: number): Response & { cancelled: () => void } {
  let sent = 0;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent === chunks) return controller.close();
      sent += 1;
      controller.enqueue(new Uint8Array(size).fill(32));
    },
    cancel,
  });
  return Object.assign(new Response(body), { cancelled: cancel });
}

describe('wav from pcm', () => {
  it('wraps 16 kHz mono samples in a 44-byte header', () => {
    const wav = wavFromPcm(Int16Array.of(1, -2, 32_767));
    const view = new DataView(wav.buffer);
    const text = (offset: number) => String.fromCharCode(...wav.subarray(offset, offset + 4));

    expect(wav).toHaveLength(50);
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint32(4, true)).toBe(42);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(40, true)).toBe(6);
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)]).toEqual([
      1, -2, 32_767,
    ]);
  });
});

describe('whisper server client', () => {
  it('posts the utterance as a WAV file and returns the text', async () => {
    const request = answering(Response.json({ text: ' Bonjour.\n' }));
    const client = new WhisperServerClient(async () => BASE, request);

    const text = await client.transcribe(Int16Array.of(1, 2), never);

    const [url, init] = request.mock.calls[0]!;
    const form = init?.body as FormData;
    const file = form.get('file') as File;
    expect(text).toBe(' Bonjour.\n');
    expect(url).toBe(`${BASE}/inference`);
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('error');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(file.type).toBe('audio/wav');
    expect(file.size).toBe(48);
  });

  it('drops the segments Whisper believes hold no speech', async () => {
    const answer = {
      text: ' Bonjour. Merci de votre attention.',
      segments: [
        { text: ' Bonjour.', no_speech_prob: 0.02 },
        { text: ' Merci de votre attention.', no_speech_prob: 0.91 },
        { text: ' À bientôt.' },
      ],
    };
    const client = new WhisperServerClient(async () => BASE, answering(Response.json(answer)));

    expect(await client.transcribe(Int16Array.of(1), never)).toBe(' Bonjour. À bientôt.');
  });

  it('refuses to send while the server is not ready', async () => {
    const request = answering(Response.json({ text: '' }));
    const client = new WhisperServerClient(async () => null, request);

    await expect(client.transcribe(Int16Array.of(1), never)).rejects.toThrow('pas prêt');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects an error status', async () => {
    const client = new WhisperServerClient(
      async () => BASE,
      answering(new Response('{"error":"bad"}', { status: 500 })),
    );

    await expect(client.transcribe(Int16Array.of(1), never)).rejects.toThrow('refusé');
  });

  it('rejects an answer of an unexpected shape', async () => {
    const client = new WhisperServerClient(
      async () => BASE,
      answering(Response.json({ segments: [] })),
    );

    await expect(client.transcribe(Int16Array.of(1), never)).rejects.toThrow();
  });

  it('refuses an announced body beyond the bound without reading it', async () => {
    const response = new Response('{}', {
      headers: { 'content-length': String(MAX_INFERENCE_BYTES + 1) },
    });
    const client = new WhisperServerClient(async () => BASE, answering(response));

    await expect(client.transcribe(Int16Array.of(1), never)).rejects.toThrow('trop longue');
  });

  it('stops reading a streamed body as soon as it passes the bound', async () => {
    const response = streamed(1_000, 16 * 1024);
    const client = new WhisperServerClient(async () => BASE, answering(response));

    await expect(client.transcribe(Int16Array.of(1), never)).rejects.toThrow('trop longue');
    expect(response.cancelled).toHaveBeenCalled();
  });

  it('never repeats the secret path when the connection fails', async () => {
    const request = vi.fn<typeof fetch>(async (url) => {
      throw new TypeError(`fetch failed: ${String(url)}`);
    });
    const client = new WhisperServerClient(async () => BASE, request);

    const error = await client.transcribe(Int16Array.of(1), never).catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('secret-token');
  });

  it('passes the abort of the caller to the request', async () => {
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const client = new WhisperServerClient(async () => BASE, request);

    const pending = client.transcribe(Int16Array.of(1), controller.signal);
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    controller.abort();

    await expect(pending).rejects.toThrow('ne répond pas');
  });

  it('sends nothing once aborted while the port was being checked', async () => {
    const controller = new AbortController();
    const request = answering(Response.json({ text: '' }));
    const client = new WhisperServerClient(async () => {
      controller.abort();
      return BASE;
    }, request);

    await expect(client.transcribe(Int16Array.of(1), controller.signal)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('whisper server health', () => {
  it('is healthy only on an ok status on the secret path', async () => {
    const ok = answering(Response.json({ status: 'ok' }));
    const loading = answering(Response.json({ status: 'loading model' }, { status: 503 }));
    const foreign = answering(new Response('<html></html>'));

    expect(await whisperServerHealthy(BASE, never, ok)).toBe(true);
    expect(ok.mock.calls[0]![0]).toBe(`${BASE}/health`);
    expect(await whisperServerHealthy(BASE, never, loading)).toBe(false);
    expect(await whisperServerHealthy(BASE, never, foreign)).toBe(false);
  });

  it('is unhealthy when nothing listens', async () => {
    const refused = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });

    expect(await whisperServerHealthy(BASE, never, refused)).toBe(false);
  });
});
