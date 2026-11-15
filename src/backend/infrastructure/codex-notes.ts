import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiMedia } from './openai-intelligence';
import { CliRefusalError, CliReportedError, toolRefused } from './cli-failures';
import { inspectStream } from './codex-events';
import { cliNotesSchema } from './cli-notes-schema';
import { CliNotes, type CliInvocation, type CliJob, type CliNotesDependencies } from './cli-notes';
import { cliInstruction, cliMessage } from './cli-prompt';
import type { CliOutput } from './cli-runner';

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
  'tool_suggest',
  'skill_mcp_dependency_install',
  'browser_use_external',
  'browser_use_full_cdp_access',
] as const;

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

async function readReply(replyPath: string): Promise<string> {
  try {
    return await readFile(replyPath, 'utf8');
  } catch {
    return '';
  }
}

function failuresOf(output: CliOutput): string {
  const stream = inspectStream(output.stdout);
  return [...stream.fatal, ...stream.warnings].join('\n');
}

const tool = {
  label: 'Codex',
  binary: 'codex',
  sendsFrames: true,
  errorText: (output: CliOutput) => `${failuresOf(output)}\n${output.stderr}`,
  invocation,
} as const;

async function invocation(job: CliJob): Promise<CliInvocation> {
  const schemaPath = join(job.directory, 'notes-schema.json');
  const replyPath = join(job.directory, 'last-message.json');
  await writeFile(schemaPath, JSON.stringify(cliNotesSchema));
  return {
    args: codexArgs(job, schemaPath, replyPath),
    input: `${cliInstruction}\n\n${cliMessage(job.meeting, job.frames)}`,
    reply: async (output) => {
      // A tool call, or a stream that is not a text-only run, means the transcript steered the
      // agent: the answer is not to be trusted.
      const stream = inspectStream(output.stdout);
      if (stream.refused) throw new CliRefusalError(toolRefused(tool));
      const text = await readReply(replyPath);
      // One completed turn with an answer outlives an `error` event (a reconnect, say).
      if (stream.completed === 1 && !stream.fatal.length && text.trim()) return text;
      const failures = [...stream.fatal, ...stream.warnings];
      if (failures.length) throw new CliReportedError(failures.join('\n'));
      if (stream.completed !== 1) throw new Error('The turn did not complete exactly once.');
      return text;
    },
  };
}

export function codexNotes(
  model: () => string,
  media: AiMedia,
  dependencies: CliNotesDependencies,
): CliNotes {
  return new CliNotes(tool, model, media, dependencies);
}
