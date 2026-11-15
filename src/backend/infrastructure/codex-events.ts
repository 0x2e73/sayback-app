import { z } from 'zod';

// The whole `--json` stream of a run that only wrote a text: lifecycle events, and items that are a
// message, some reasoning or a plan. Anything else (a command, a file read, a tool that a later
// catalog adds) is a sign that the transcript steered the agent.
const lifecycle = new Set(['thread.started', 'turn.started', 'turn.completed']);
const itemEvents = new Set(['item.started', 'item.updated', 'item.completed']);
const textItems = new Set(['agent_message', 'reasoning', 'todo_list']);
const failures = new Set(['turn.failed', 'error']);

const eventSchema = z.object({
  type: z.string(),
  item: z.object({ type: z.string().optional() }).optional(),
  message: z.string().optional(),
  error: z.union([z.string(), z.object({ message: z.string().optional() })]).optional(),
});
type CodexEvent = z.infer<typeof eventSchema>;

function parseLine(line: string): CodexEvent | undefined {
  try {
    const parsed = eventSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function lines(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function accepted(event: CodexEvent): boolean {
  if (lifecycle.has(event.type) || failures.has(event.type)) return true;
  return itemEvents.has(event.type) && textItems.has(event.item?.type ?? '');
}

function failureText(event: CodexEvent): string {
  if (!failures.has(event.type)) return '';
  const { error } = event;
  return event.message ?? (typeof error === 'string' ? error : (error?.message ?? ''));
}

export interface StreamReport {
  /** Something other than a text was done, or the stream is not what a text-only run prints. */
  refused: boolean;
  /** The messages of the `error` and `turn.failed` events: what the CLI says went wrong. */
  failures: string[];
}

/** Fails closed: an unknown event or item type, or a line that is not JSON, refuses the notes. */
export function inspectStream(stdout: string): StreamReport {
  const events = lines(stdout).map(parseLine);
  return {
    refused: events.some((event) => !event || !accepted(event)),
    failures: events.flatMap((event) => (event ? [failureText(event)] : [])).filter(Boolean),
  };
}
