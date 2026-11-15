import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Meeting, NoteItem, Notes } from '../../shared/contracts';
import { cliDefaultModel } from '../../shared/cli-notes';
import type { AiMedia } from './openai-intelligence';
import { cliCall } from './cli-call';
import {
  brokenInstall,
  CliRefusalError,
  CliReportedError,
  explainError,
  explainOutput,
  looksBroken,
  notInstalled,
  type CliLabels,
} from './cli-failures';
import { restoreSigils, type SavedFrame } from './cli-prompt';
import type { CliOutput, CliRunner } from './cli-runner';
import { parseGroundedNotes, selectedFrames, UngroundedNotesError } from './notes-context';

export interface CliNotesDependencies {
  runner: CliRunner;
  locate(binary: string): string | undefined;
  environment: NodeJS.ProcessEnv;
  /** The parent of the per-run working folders: `<userData>/cli-runs`, wiped at start and close. */
  tempRoot: string;
  /** Aborted when the app quits: the running process is stopped. */
  signal?: AbortSignal;
}

export interface CliJob {
  meeting: Meeting;
  /** Empty for the CLI's own default. */
  model: string;
  /** Empty folder owned by this run; it is deleted afterwards. */
  directory: string;
  frames: SavedFrame[];
}

export interface CliInvocation {
  args: string[];
  input: string;
  /** The text of the answer; throws `CliReportedError` when the CLI says it failed. */
  reply(output: CliOutput): Promise<string>;
}

export interface CliTool extends CliLabels {
  binary: 'claude' | 'codex';
  /** Whether the frames can be attached as files. Otherwise only the text is sent. */
  sendsFrames: boolean;
  /** Added to the minimal environment: switches off what the client does before the model runs. */
  environment?: Readonly<Record<string, string>>;
  invocation(job: CliJob): Promise<CliInvocation>;
  /**
   * What the CLI itself says went wrong, for a run that exited with an error: its stderr and the
   * messages it flagged as errors. Never the content of the model's answer.
   */
  errorText(output: CliOutput): string;
}

// Five minutes for a long transcript on a subscription model.
const timeoutMs = 300_000;

/** `default` is the CLI's own choice. A model is a word, never something that reads as an option. */
export function chosenModel(label: string, value: string): string {
  const model = value.trim();
  if (!model || model === cliDefaultModel) return '';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(model)) {
    throw new Error(`Modèle ${label} invalide.`);
  }
  return model;
}

async function saveFrames(meeting: Meeting, media: AiMedia, directory: string) {
  const saved: SavedFrame[] = [];
  for (const frame of selectedFrames(meeting)) {
    const path = join(directory, `frame-${frame.index}.jpg`);
    await writeFile(path, await media.readFrame(meeting.id, frame.index));
    saved.push({ path, at: frame.at });
  }
  return saved;
}

function restored(items: NoteItem[]): NoteItem[] {
  return items.map((item) => ({ ...item, text: restoreSigils(item.text) }));
}

function parse(text: string, meeting: Meeting, tool: CliTool): Notes {
  if (!text.trim()) throw new Error(`Réponse ${tool.label} vide. Relancez l’analyse.`);
  try {
    const notes = parseGroundedNotes(text, meeting);
    return {
      summary: restoreSigils(notes.summary),
      keyPoints: restored(notes.keyPoints),
      decisions: restored(notes.decisions),
      actions: restored(notes.actions),
      questions: restored(notes.questions),
    };
  } catch (error) {
    if (error instanceof UngroundedNotesError) throw error;
    throw new Error(`Réponse ${tool.label} incomplète. Relancez l’analyse.`);
  }
}

export class CliNotes {
  constructor(
    private readonly tool: CliTool,
    private readonly model: () => string,
    private readonly media: AiMedia,
    private readonly dependencies: CliNotesDependencies,
  ) {}

  async summarize(meeting: Meeting): Promise<Notes> {
    const { tool, dependencies } = this;
    const model = chosenModel(tool.label, this.model());
    const command = dependencies.locate(tool.binary);
    if (!command) throw new Error(notInstalled(tool));
    const directory = await mkdtemp(join(dependencies.tempRoot, 'sayback-notes-'));
    try {
      const frames = tool.sendsFrames ? await saveFrames(meeting, this.media, directory) : [];
      const invocation = await tool.invocation({ meeting, model, directory, frames });
      const output = await this.execute(command, directory, invocation);
      return parse(await this.answer(output, invocation), meeting, tool);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async execute(
    command: string,
    directory: string,
    invocation: CliInvocation,
  ): Promise<CliOutput> {
    const { dependencies } = this;
    try {
      return await dependencies.runner(
        cliCall(dependencies, command, {
          args: invocation.args,
          input: invocation.input,
          cwd: directory,
          timeoutMs,
          environment: this.tool.environment,
        }),
      );
    } catch (error) {
      throw explainError(error, this.tool);
    }
  }

  private async answer(output: CliOutput, invocation: CliInvocation): Promise<string> {
    if (output.exitCode !== 0) {
      if (looksBroken(output)) throw new Error(brokenInstall(this.tool));
      throw new Error(explainOutput(this.tool.errorText(output), this.tool));
    }
    try {
      return await invocation.reply(output);
    } catch (error) {
      if (error instanceof CliRefusalError) throw error;
      if (error instanceof CliReportedError) {
        throw new Error(explainOutput(error.message, this.tool));
      }
      throw new Error(`Réponse ${this.tool.label} incomplète. Relancez l’analyse.`);
    }
  }
}
