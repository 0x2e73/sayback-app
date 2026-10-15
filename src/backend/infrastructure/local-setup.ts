import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
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

// The first field of a whisper.cpp model: "ggml" read as a little-endian 32-bit number.
const GGML_MAGIC = [0x6c, 0x6d, 0x67, 0x67];

function startsWithMagic(path: string): boolean {
  const head = new Uint8Array(GGML_MAGIC.length);
  const descriptor = openSync(path, 'r');
  try {
    readSync(descriptor, head, 0, head.length, 0);
  } finally {
    closeSync(descriptor);
  }
  return GGML_MAGIC.every((byte, index) => head[index] === byte);
}

/** An absolute `ggml-*.bin` regular file that starts like a whisper.cpp model. */
export function isGgmlModel(path: string): boolean {
  if (!isAbsolute(path) || !/^ggml-.+\.bin$/.test(basename(path))) return false;
  try {
    return isFile(path) && startsWithMagic(path);
  } catch {
    return false;
  }
}

/** The live always runs locally: the chosen model, else the first one found, if it is valid. */
export function liveWhisperModel(chosen: string, folders: string[]): string {
  if (isGgmlModel(chosen)) return chosen;
  const found = findWhisperModel(folders);
  return isGgmlModel(found) ? found : '';
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
