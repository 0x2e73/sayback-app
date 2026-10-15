import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { LocalSetupStatus } from '../../shared/contracts';

export const defaultOllamaModel = 'gemma3:4b';

const tagsSchema = z.object({ models: z.array(z.object({ name: z.string() })) });

export function whisperModelFolders(home: string): string[] {
  return [join(home, 'Models', 'SayBack'), join(home, '.whisper-models')];
}

function isMultilingualModel(name: string): boolean {
  return /^ggml-.+\.bin$/.test(name) && !/\.en([.-]|$)/.test(name);
}

function modelsIn(folder: string): string[] {
  try {
    return readdirSync(folder).filter(isMultilingualModel).sort();
  } catch {
    return [];
  }
}

export function findWhisperModel(folders: string[]): string {
  for (const folder of folders) {
    const [model] = modelsIn(folder);
    if (model) return join(folder, model);
  }
  return '';
}

function isFile(path: string): boolean {
  return Boolean(path) && existsSync(path) && statSync(path).isFile();
}

/** The live always runs locally: the chosen model, else the first one found, else ''. */
export function liveWhisperModel(chosen: string, folders: string[]): string {
  return isFile(chosen) ? chosen : findWhisperModel(folders);
}

interface LocalSetupDependencies {
  locate(name: string): string | undefined;
  whisperModelPath(): string;
  notesModel(): string;
  request: typeof fetch;
}

export class LocalSetup {
  constructor(private readonly dependencies: LocalSetupDependencies) {}

  async check(): Promise<LocalSetupStatus> {
    const { locate, whisperModelPath, notesModel } = this.dependencies;
    const model = notesModel();
    const installed = await this.ollamaModels();
    return {
      whisperCli: Boolean(locate('whisper-cli')),
      ffmpeg: Boolean(locate('ffmpeg')),
      whisperModel: isFile(whisperModelPath()),
      ollama: installed !== null,
      notesModel: Boolean(installed?.some((name) => name === model || name === `${model}:latest`)),
      notesModelName: model,
    };
  }

  private async ollamaModels(): Promise<string[] | null> {
    try {
      const response = await this.dependencies.request('http://127.0.0.1:11434/api/tags', {
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return null;
      return tagsSchema.parse(await response.json()).models.map((model) => model.name);
    } catch {
      return null;
    }
  }
}
