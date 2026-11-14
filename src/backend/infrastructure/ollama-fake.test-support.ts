import { vi } from 'vitest';
import { OllamaNotes } from './ollama-notes';
import { planSlices } from './notes-slicing';
import { estimateTokens } from './ollama-budget';
import type { Meeting, Notes } from '../../shared/contracts';
import { type Condensed, partialInstruction, reduceInstruction } from './notes-reduce';

const sentence =
  'Le comité valide le calendrier de livraison, puis la direction confirme le budget prévu pour le troisième trimestre. ';

/** Realistic French of exactly `chars` characters (the sizing tests must not use filler such as 'x'). */
export function frenchText(chars: number): string {
  return sentence.repeat(Math.ceil(chars / sentence.length)).slice(0, chars);
}

interface MeetingShape {
  blocks: number;
  frames?: number;
  blockChars?: number;
  clarifications?: Meeting['clarifications'];
}

/** A meeting of `blocks` transcript blocks (one per 45 s, ids `<n>-0`) and evenly spread frames. */
export function meetingOf(shape: MeetingShape): Meeting {
  const text = 'Nous validons le budget avant la fin du mois. '
    .repeat(Math.ceil((shape.blockChars ?? 600) / 46))
    .slice(0, shape.blockChars ?? 600);
  const duration = shape.blocks * 45;
  const frames = shape.frames ?? 0;
  return {
    id: 'meeting',
    title: 'Revue produit',
    createdAt: '',
    status: 'recorded',
    duration,
    hasVideo: frames > 0,
    audioChunks: [],
    frames: Array.from({ length: frames }, (_unused, index) => ({
      index,
      at: Math.round(((index + 0.5) * duration) / frames),
    })),
    transcript: Array.from({ length: shape.blocks }, (_unused, index) => ({
      id: `${index}-0`,
      start: index * 45,
      end: index * 45 + 40,
      text,
    })),
    notes: null,
    clarifications: shape.clarifications ?? [],
    error: null,
  };
}

export type CallKind = 'single' | 'map' | 'reduce';

export interface ChatCall {
  kind: CallKind;
  system: string;
  user: string;
  images: string[];
  body: Record<string, unknown>;
}

type Reply = Notes | Condensed | Response | string;

function kindOf(system: string): CallKind {
  if (system === partialInstruction) return 'map';
  if (system === reduceInstruction) return 'reduce';
  return 'single';
}

function parseCall(body: Record<string, unknown>): ChatCall {
  const messages = body.messages as Array<{ role: string; content: string; images?: string[] }>;
  const system = messages.find((message) => message.role === 'system')?.content ?? '';
  const user = messages.find((message) => message.role === 'user');
  return {
    kind: kindOf(system),
    system,
    user: user?.content ?? '',
    images: user?.images ?? [],
    body,
  };
}

/**
 * A slice cites its first and last block, decides on its first and acts on both. A merge keeps the
 * first key point of its first part and the last key point of its last.
 */
export function echoNotes(call: ChatCall): Notes | Condensed {
  if (call.kind === 'reduce') {
    const partials = (JSON.parse(call.user) as { partials: Condensed[] }).partials;
    const first = partials[0]?.keyPoints[0];
    const last = partials[partials.length - 1]?.keyPoints.at(-1);
    return {
      summary: 'Fusion',
      keyPoints: [first, last].flatMap((item) => (item ? [item] : [])),
      questions: [],
    };
  }
  const ids = (JSON.parse(call.user) as { transcript: Array<{ id: string }> }).transcript.map(
    (block) => block.id,
  );
  const head = ids[0] ?? '';
  const tail = ids[ids.length - 1] ?? '';
  return {
    summary: 'Extrait',
    keyPoints: [
      { text: `Début ${head}`, sourceIds: [head] },
      { text: `Fin ${tail}`, sourceIds: [tail] },
    ],
    decisions: [{ text: `Décision ${head}`, sourceIds: [head] }],
    actions: [
      { text: `Action ${head}`, sourceIds: [head] },
      { text: `Action ${tail}`, sourceIds: [tail] },
    ],
    questions: [],
  };
}

function toResponse(reply: Reply): Response {
  if (reply instanceof Response) return reply;
  const content = typeof reply === 'string' ? reply : JSON.stringify(reply);
  return new Response(JSON.stringify({ message: { role: 'assistant', content }, done: true }));
}

/** A fake Ollama: `/api/show` answers `capabilities`, `/api/chat` answers `reply(call)`. */
export function fakeOllama(
  reply: (call: ChatCall, index: number) => Reply = echoNotes,
  capabilities: string[] = ['completion', 'vision'],
) {
  const calls: ChatCall[] = [];
  const request = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    if (String(url).endsWith('/api/show')) {
      return new Response(JSON.stringify({ capabilities }));
    }
    const call = parseCall(JSON.parse(String(options?.body)) as Record<string, unknown>);
    calls.push(call);
    return toResponse(reply(call, calls.length - 1));
  });
  return { request: request as typeof fetch, calls, spy: request };
}

const media = {
  readAudio: async () => Buffer.from('audio'),
  readFrame: async () => Buffer.from('image'),
};

export function providerOver(
  request: typeof fetch,
  model = 'qwen3.5:4b',
  warn?: (message: string) => void,
): OllamaNotes {
  return new OllamaNotes(() => model, media, request, warn);
}
export function ids(notes: Notes): string[] {
  return [notes.keyPoints, notes.decisions, notes.actions, notes.questions]
    .flat()
    .flatMap((item) => item.sourceIds);
}
export function sliceIds(call: ChatCall): string[] {
  const context = JSON.parse(call.user) as { transcript: Array<{ id: string }> };
  return context.transcript.map((block) => block.id);
}
export function callOf(calls: ChatCall[], kind: ChatCall['kind']): ChatCall {
  const call = calls.find((candidate) => candidate.kind === kind);
  if (!call) throw new Error(`no ${kind} call`);
  return call;
}

// A block that is the first or last of no slice: the fake model never cites it.
export function uncitedBlock(blocks: number): string {
  const meeting = meetingOf({ blocks });
  const cited = new Set(
    planSlices(meeting, estimateTokens(partialInstruction)).flatMap((slice) => [
      slice.blocks[0]?.id,
      slice.blocks.at(-1)?.id,
    ]),
  );
  const id = meeting.transcript
    .map((segment) => segment.id)
    .find((candidate) => !cited.has(candidate));
  if (!id) throw new Error('every block is cited');
  return id;
}
