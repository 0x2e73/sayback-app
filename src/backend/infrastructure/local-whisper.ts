import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { AudioChunk, Segment } from '../../shared/contracts';
import type { AiMedia } from './openai-intelligence';

const execute = promisify(execFile);
const whisperSchema = z.object({
  transcription: z.array(
    z.object({
      offsets: z.object({ from: z.number().min(0), to: z.number().min(0) }),
      text: z.string(),
    }),
  ),
});

export function locateBinary(name: string): string | undefined {
  const paths = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    // A relative entry would resolve against whatever folder the app was started from.
    ...(process.env.PATH ?? '').split(':').filter((entry) => isAbsolute(entry)),
  ];
  return paths.map((path) => join(path, name)).find((path) => existsSync(path));
}

function binary(name: string): string {
  const found = locateBinary(name);
  if (found) return found;
  throw new Error(
    name === 'whisper-cli'
      ? 'Whisper local est absent. Installez whisper.cpp avant de lancer l’analyse.'
      : 'ffmpeg est absent. Installez-le pour convertir l’audio localement.',
  );
}

export function parseWhisperSegments(output: unknown, chunk: AudioChunk): Segment[] {
  const result = whisperSchema.parse(output);
  return result.transcription
    .filter((item) => item.text.trim() && item.offsets.from / 1_000 < chunk.duration)
    .map((item, index) => {
      const start = item.offsets.from / 1_000;
      const end = item.offsets.to / 1_000;
      return {
        id: `${chunk.index}-${index}`,
        start: chunk.start + start,
        end: chunk.start + Math.min(chunk.duration, Math.max(start, end)),
        text: item.text.trim(),
      };
    });
}

export class LocalWhisper {
  constructor(
    private readonly media: AiMedia,
    private readonly modelPath: () => string,
  ) {}

  async transcribe(meetingId: string, chunk: AudioChunk): Promise<Segment[]> {
    const model = this.modelPath();
    if (!model || !existsSync(model) || !statSync(model).isFile()) {
      throw new Error('Choisissez un fichier de modèle Whisper valide dans les paramètres.');
    }
    const ffmpeg = binary('ffmpeg');
    const whisper = binary('whisper-cli');
    const temporary = await mkdtemp(join(tmpdir(), 'sayback-whisper-'));
    const input = join(temporary, 'audio.webm');
    const wav = join(temporary, 'audio.wav');
    const output = join(temporary, 'transcript');
    try {
      await writeFile(input, await this.media.readAudio(meetingId, chunk.index));
      await execute(
        ffmpeg,
        [
          '-loglevel',
          'error',
          '-y',
          '-i',
          input,
          '-ar',
          '16000',
          '-ac',
          '1',
          '-c:a',
          'pcm_s16le',
          wav,
        ],
        { timeout: 30_000 },
      );
      await execute(whisper, ['-m', model, '-f', wav, '-l', 'auto', '-oj', '-of', output, '-np'], {
        timeout: 600_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const json = JSON.parse(await readFile(`${output}.json`, 'utf8')) as unknown;
      return parseWhisperSegments(json, chunk);
    } catch {
      throw new Error('La transcription locale a échoué. Vérifiez Whisper et le modèle choisi.');
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}
