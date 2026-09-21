import type { MediaUpload } from '../../shared/contracts';
import { mkdir, appendFile, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { idSchema, validateMedia } from '../../shared/validation';
export class MediaFiles {
  private readonly videoIndexes = new Map<string, number>();
  constructor(private readonly root: string) {}
  private directory(id: string): string {
    return join(this.root, idSchema.parse(id));
  }
  async save(input: MediaUpload): Promise<void> {
    const upload = validateMedia(input);
    const directory = this.directory(upload.meetingId);
    await mkdir(directory, { recursive: true });
    if (upload.kind === 'video') {
      const next = this.videoIndexes.get(upload.meetingId) ?? 0;
      if (upload.index !== next)
        throw new Error('Les segments vidéo doivent être enregistrés dans l’ordre.');
      const path = this.videoPath(upload.meetingId);
      if (upload.index === 0) await writeFile(path, Buffer.from(upload.bytes), { flag: 'wx' });
      else await appendFile(path, Buffer.from(upload.bytes));
      this.videoIndexes.set(upload.meetingId, next + 1);
    } else {
      await writeFile(
        join(
          directory,
          `${upload.kind}-${upload.index}.${upload.kind === 'audio' ? 'webm' : 'jpg'}`,
        ),
        Buffer.from(upload.bytes),
        { flag: 'wx' },
      );
    }
  }
  readAudio(id: string, index: number): Promise<Buffer> {
    return readFile(this.audioPath(id, index));
  }
  audioPath(id: string, index: number): string {
    if (!Number.isInteger(index) || index < 0) throw new Error('Segment audio invalide.');
    return join(this.directory(id), `audio-${index}.webm`);
  }
  readFrame(id: string, index: number): Promise<Buffer> {
    return readFile(join(this.directory(id), `frame-${index}.jpg`));
  }
  videoPath(id: string): string {
    return join(this.directory(id), 'video.webm');
  }
  async delete(id: string): Promise<void> {
    await rm(this.directory(id), { recursive: true, force: true });
    this.videoIndexes.delete(id);
  }
}
