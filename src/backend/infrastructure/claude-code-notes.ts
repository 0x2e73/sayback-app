import { z } from 'zod';
import type { AiMedia } from './openai-intelligence';
import { CliReportedError } from './cli-failures';
import { cliNotesSchema } from './cli-notes-schema';
import { CliNotes, type CliInvocation, type CliJob, type CliNotesDependencies } from './cli-notes';
import { cliInstruction, cliMessage } from './cli-prompt';
import type { CliOutput } from './cli-runner';

const resultSchema = z.object({
  type: z.literal('result'),
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
});

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

function readReply(output: CliOutput): string {
  const result = events(output.stdout)
    .flatMap((event) => {
      const parsed = resultSchema.safeParse(event);
      return parsed.success ? [parsed.data] : [];
    })
    .pop();
  if (!result) throw new Error('No result event.');
  if (result.is_error) throw new CliReportedError(result.result ?? '');
  if (result.structured_output && typeof result.structured_output === 'object') {
    return JSON.stringify(result.structured_output);
  }
  return result.result ?? '';
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
    label: 'Claude Code',
    login: 'claude',
    binary: 'claude',
    // The CLI takes an image only through a tool it cannot use here: the text goes alone.
    sendsFrames: false,
    invocation,
  } as const;
  return new CliNotes(tool, model, media, dependencies);
}
