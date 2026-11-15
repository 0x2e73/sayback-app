import { z } from 'zod';
import type { AiMedia } from './openai-intelligence';
import { CliRefusalError, CliReportedError, toolRefused } from './cli-failures';
import { cliNotesSchema } from './cli-notes-schema';
import { CliNotes, type CliInvocation, type CliJob, type CliNotesDependencies } from './cli-notes';
import { cliInstruction, cliMessage } from './cli-prompt';
import type { CliOutput } from './cli-runner';

const label = 'Claude Code';

const resultSchema = z.object({
  type: z.literal('result'),
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  permission_denials: z.array(z.unknown()).optional(),
});

// The client expands `@path` and attachments itself, before the model runs and whatever `--tools`
// says: without these two switches a transcript could make it read a local file.
const clientDoors = {
  CLAUDE_CODE_DISABLE_FILE_MENTIONS: '1',
  CLAUDE_CODE_DISABLE_ATTACHMENTS: '1',
} as const;

// Every switch below closes one door of an agent that would otherwise read the transcript as orders.
export function claudeArgs(model: string): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(cliNotesSchema),
    // No built-in tool at all: nothing to run, read, write or fetch.
    '--tools',
    '',
    // No MCP server: none is passed and the others are ignored.
    '--strict-mcp-config',
    // Without CLAUDE.md, skills, plugins, hooks, custom agents and commands of the user.
    '--safe-mode',
    '--setting-sources',
    '',
    '--disable-slash-commands',
    '--no-chrome',
    // Nothing is kept on disk, and a request for permission is refused instead of asked.
    '--no-session-persistence',
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    '--system-prompt',
    cliInstruction,
    ...(model ? ['--model', model] : []),
  ];
}

function events(stdout: string): unknown[] {
  const parsed: unknown = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function lastResult(stdout: string) {
  return events(stdout)
    .flatMap((event) => {
      const parsed = resultSchema.safeParse(event);
      return parsed.success ? [parsed.data] : [];
    })
    .pop();
}

function readReply(output: CliOutput): string {
  const result = lastResult(output.stdout);
  if (!result) throw new Error('No result event.');
  if (result.is_error) throw new CliReportedError(result.result ?? '');
  // Every tool is off: a denied permission means the transcript steered the agent. (`num_turns` is
  // not checked: an answer shaped by `--json-schema` takes two turns by itself.)
  if (result.permission_denials?.length) throw new CliRefusalError(toolRefused({ label }));
  if (result.structured_output && typeof result.structured_output === 'object') {
    return JSON.stringify(result.structured_output);
  }
  return result.result ?? '';
}

/** The stderr, and the result only when Claude flags it as an error: never the model's answer. */
function errorText(output: CliOutput): string {
  try {
    const result = lastResult(output.stdout);
    return `${result?.is_error ? (result.result ?? '') : ''}\n${output.stderr}`;
  } catch {
    return output.stderr;
  }
}

async function invocation(job: CliJob): Promise<CliInvocation> {
  return {
    args: claudeArgs(job.model),
    input: cliMessage(job.meeting, []),
    reply: async (output) => readReply(output),
  };
}

export function claudeCodeNotes(
  model: () => string,
  media: AiMedia,
  dependencies: CliNotesDependencies,
): CliNotes {
  const tool = {
    label,
    binary: 'claude',
    environment: clientDoors,
    errorText,
    // The CLI takes an image only through a tool it cannot use here: the text goes alone.
    sendsFrames: false,
    invocation,
  } as const;
  return new CliNotes(tool, model, media, dependencies);
}
