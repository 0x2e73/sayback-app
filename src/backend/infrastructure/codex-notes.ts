import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiMedia } from './openai-intelligence';
import { CliRefusalError } from './cli-failures';
import { cliNotesSchema } from './cli-notes-schema';
import { CliNotes, type CliInvocation, type CliJob, type CliNotesDependencies } from './cli-notes';
import { cliInstruction, cliMessage } from './cli-prompt';

// Every capability of the agent that is not "write a text" is turned off.
const disabledFeatures = [
  'shell_tool',
  'unified_exec',
  'apps',
  'plugins',
  'hooks',
  'browser_use',
  'computer_use',
  'multi_agent',
  'image_generation',
  'view_image',
  'skill_search',
] as const;

// What a run that used a tool looks like in the `--json` event stream.
const toolEvents = new Set([
  'command_execution',
  'file_change',
  'mcp_tool_call',
  'web_search',
  'collab_tool_call',
  'exec_command_begin',
  'patch_apply_begin',
  'mcp_tool_call_begin',
  'web_search_begin',
]);

export function codexArgs(job: CliJob, schemaPath: string, replyPath: string): string[] {
  return [
    'exec',
    // Even if a tool were left, nothing can be written, and no approval is ever asked.
    '--sandbox',
    'read-only',
    '-c',
    'approval_policy="never"',
    '-c',
    'web_search="disabled"',
    ...disabledFeatures.flatMap((feature) => ['--disable', feature]),
    // The user's config.toml (MCP servers, profiles, hooks) and execpolicy rules stay out.
    '--ignore-user-config',
    '--ignore-rules',
    '--ephemeral',
    '--skip-git-repo-check',
    '--color',
    'never',
    '--json',
    '-C',
    job.directory,
    '--output-schema',
    schemaPath,
    '-o',
    replyPath,
    ...(job.model ? ['-m', job.model] : []),
    ...job.frames.map((frame) => `--image=${frame.path}`),
    // The prompt comes from stdin.
    '-',
  ];
}

function typeOf(value: unknown): unknown {
  return value && typeof value === 'object' ? (value as { type?: unknown }).type : undefined;
}

function usedATool(stdout: string): boolean {
  return stdout.split('\n').some((line) => {
    try {
      const event: unknown = JSON.parse(line);
      const nested = (event as { item?: unknown; msg?: unknown } | null) ?? {};
      return [event, nested.item, nested.msg].some((part) => toolEvents.has(String(typeOf(part))));
    } catch {
      return false;
    }
  });
}

async function readReply(replyPath: string): Promise<string> {
  try {
    return await readFile(replyPath, 'utf8');
  } catch {
    return '';
  }
}

async function invocation(job: CliJob): Promise<CliInvocation> {
  const schemaPath = join(job.directory, 'notes-schema.json');
  const replyPath = join(job.directory, 'last-message.json');
  await writeFile(schemaPath, JSON.stringify(cliNotesSchema));
  return {
    args: codexArgs(job, schemaPath, replyPath),
    input: `${cliInstruction}\n\n${cliMessage(job.meeting, job.frames)}`,
    reply: async (output) => {
      // A tool call means the transcript steered the agent: the answer is not to be trusted.
      if (usedATool(output.stdout)) {
        throw new CliRefusalError('Codex a tenté d’utiliser un outil. Notes refusées.');
      }
      return readReply(replyPath);
    },
  };
}

export function codexNotes(
  model: () => string,
  media: AiMedia,
  dependencies: CliNotesDependencies,
): CliNotes {
  const tool = {
    label: 'Codex',
    login: 'codex login',
    binary: 'codex',
    sendsFrames: true,
    invocation,
  } as const;
  return new CliNotes(tool, model, media, dependencies);
}
