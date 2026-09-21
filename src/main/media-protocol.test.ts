import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteMeetings } from '../backend/infrastructure/sqlite-meetings';
import { MediaFiles } from '../backend/infrastructure/media-files';
import { MeetingService } from '../backend/application/meetings';
import { serveMedia } from './media-protocol';

let root: string;
let repository: SqliteMeetings;
let meetings: MeetingService;
let media: MediaFiles;
let id: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'voice-playback-'));
  repository = new SqliteMeetings(join(root, 'meetings.sqlite'));
  meetings = new MeetingService(repository, {
    transcribe: async () => [],
    summarize: async () => {
      throw new Error('Not used in playback tests');
    },
  });
  media = new MediaFiles(root);
  id = meetings.create('Lecture').id;
  meetings.markVideo(id);
  meetings.addAudio(id, 0, 0, 10);
  meetings.finish(id, 10);
  await mkdir(join(root, id));
  await writeFile(media.videoPath(id), '0123456789');
  await writeFile(join(root, id, 'audio-0.webm'), 'audio');
});

afterEach(async () => {
  repository.close();
  await rm(root, { recursive: true, force: true });
});

it('serves byte ranges for video seeking', async () => {
  const request = new Request(`meeting-media://local/${id}/video`, {
    headers: { Range: 'bytes=3-5' },
  });
  const response = await serveMedia(request, media, meetings);
  expect(response.status).toBe(206);
  expect(response.headers.get('content-range')).toBe('bytes 3-5/10');
  expect(await response.text()).toBe('345');
});

it('serves only audio chunks belonging to the requested meeting', async () => {
  const response = await serveMedia(
    new Request(`meeting-media://local/${id}/audio/0`),
    media,
    meetings,
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('audio');
  const missing = await serveMedia(
    new Request(`meeting-media://local/${id}/audio/99`),
    media,
    meetings,
  );
  expect(missing.status).toBe(404);
});

it('rejects requests beyond the end of a recording', async () => {
  const response = await serveMedia(
    new Request(`meeting-media://local/${id}/video`, {
      headers: { Range: 'bytes=20-' },
    }),
    media,
    meetings,
  );
  expect(response.status).toBe(416);
});
