import { z } from 'zod';
import { LIVE_SAMPLE_RATE } from '../../shared/live';
import type { LiveEngine } from '../application/ports';

// Every byte read from the server is bounded: fifteen seconds with word timings is about 10 KB.
export const MAX_INFERENCE_BYTES = 128 * 1024;
const MAX_HEALTH_BYTES = 1024;
export const DECODE_TIMEOUT = 30_000;
/** Above this, Whisper thinks a segment holds no speech: usually invented text on noise. */
export const MAX_NO_SPEECH = 0.6;

const inferenceSchema = z.object({
  text: z.string().max(10_000),
  segments: z
    .array(
      z.object({
        text: z.string().max(10_000),
        no_speech_prob: z.number().min(0).max(1).optional(),
      }),
    )
    .max(1_000)
    .optional(),
});

/** The text of the segments Whisper believes are speech. */
export function speechOf(answer: z.infer<typeof inferenceSchema>): string {
  if (!answer.segments) return answer.text;
  return answer.segments
    .filter((segment) => (segment.no_speech_prob ?? 0) <= MAX_NO_SPEECH)
    .map((segment) => segment.text)
    .join('');
}
const healthSchema = z.object({ status: z.literal('ok') });

/** 16-bit mono WAV in memory: the live path writes no audio to disk. */
export function wavFromPcm(
  samples: Int16Array,
  sampleRate = LIVE_SAMPLE_RATE,
): Uint8Array<ArrayBuffer> {
  const dataBytes = samples.length * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, dataBytes, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return bytes;
}

/** The body as text, abandoned as soon as it goes beyond `maxBytes`. */
export async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) {
    await response.body?.cancel();
    throw new Error('Réponse du moteur live trop longue.');
  }
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    total += read.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Réponse du moteur live trop longue.');
    }
    chunks.push(read.value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * The base URL carries the secret request path: it never appears in an error, a log or a
 * message to a window.
 */
export class WhisperServerClient implements LiveEngine {
  /** `baseUrl` checks again, before each request, that the port is held by our server alone. */
  constructor(
    private readonly baseUrl: () => Promise<string | null>,
    private readonly request: typeof fetch = fetch,
  ) {}

  async transcribe(samples: Int16Array, signal: AbortSignal): Promise<string> {
    const base = await this.baseUrl();
    if (!base) throw new Error('Le moteur live n’est pas prêt.');
    if (signal.aborted) throw new Error('Énoncé abandonné.');
    const form = new FormData();
    form.append('file', new Blob([wavFromPcm(samples)], { type: 'audio/wav' }), 'live.wav');
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0');
    const response = await this.send(`${base}/inference`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.any([signal, AbortSignal.timeout(DECODE_TIMEOUT)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Le moteur live a refusé l’énoncé.');
    }
    const body = await readBounded(response, MAX_INFERENCE_BYTES);
    return speechOf(inferenceSchema.parse(JSON.parse(body)));
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.request(url, { ...init, redirect: 'error' });
    } catch {
      // The original error may quote the URL, and so the token.
      throw new Error('Le moteur live ne répond pas.');
    }
  }
}

/** True once the server has loaded its model and answers on the secret path. */
export async function whisperServerHealthy(
  base: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await request(`${base}/health`, { signal, redirect: 'error' });
    if (!response.ok) {
      await response.body?.cancel();
      return false;
    }
    const body = await readBounded(response, MAX_HEALTH_BYTES);
    return healthSchema.safeParse(JSON.parse(body)).success;
  } catch {
    return false;
  }
}
