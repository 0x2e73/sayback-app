import { vi } from 'vitest';
import type { Meeting, Notes } from '../../shared/contracts';
import { partialInstruction, reduceInstruction } from './notes-reduce';

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

type Reply = Notes | Response | string;

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

/** Cites the first and last block of the slice; a merge keeps the first item of its first part and the last of its last. */
export function echoNotes(call: ChatCall): Notes {
  if (call.kind === 'reduce') {
    const partials = (JSON.parse(call.user) as { partials: Notes[] }).partials;
    const first = partials[0]?.keyPoints[0];
    const last = partials[partials.length - 1]?.keyPoints.at(-1);
    return {
      summary: 'Fusion',
      keyPoints: [first, last].flatMap((item) => (item ? [item] : [])),
      decisions: [],
      actions: [],
      questions: [],
    };
  }
  const ids = (JSON.parse(call.user) as { transcript: Array<{ id: string }> }).transcript.map(
    (block) => block.id,
  );
  return {
    summary: 'Extrait',
    keyPoints: [
      { text: `Début ${ids[0]}`, sourceIds: [ids[0] ?? ''] },
      { text: `Fin ${ids[ids.length - 1]}`, sourceIds: [ids[ids.length - 1] ?? ''] },
    ],
    decisions: [],
    actions: [],
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
