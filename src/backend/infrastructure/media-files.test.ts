import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaFiles } from './media-files';
let root: string;
let files: MediaFiles;
const id = '92d679f6-f90c-41b4-9b3b-7c27b6cc8771';
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'voice-media-'));
  files = new MediaFiles(root);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
it('appends ordered video chunks and rejects a missing preceding chunk', async () => {
  const upload = {
    meetingId: id,
    kind: 'video' as const,
    index: 0,
    at: 0,
    duration: 1,
    bytes: new Uint8Array([1, 2]).buffer,
  };
  await files.save(upload);
  await expect(files.save({ ...upload, index: 2 })).rejects.toThrow(/ordre/i);
  await files.save({ ...upload, index: 1 });
  expect(await readFile(files.videoPath(id))).toEqual(Buffer.from([1, 2, 1, 2]));
});
it('retains self-contained audio chunks across reopen and rejects overwrite', async () => {
  const upload = {
    meetingId: id,
    kind: 'audio' as const,
    index: 0,
    at: 0,
    duration: 1,
    bytes: new Uint8Array([3, 4]).buffer,
  };
  await files.save(upload);
  files = new MediaFiles(root);
  expect(await files.readAudio(id, 0)).toEqual(Buffer.from([3, 4]));
  await expect(files.save(upload)).rejects.toThrow();
});
