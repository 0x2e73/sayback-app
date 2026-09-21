import { expect, it } from 'vitest';
import { RecordingWriter, type RecordingApi } from './recording-writer';
import type { MediaUpload, Meeting } from '../../../shared/contracts';

it('flushes queued media in order before marking the meeting recorded', async () => {
  const saved: number[] = [];
  const api: RecordingApi = {
    saveMedia: async (upload: MediaUpload) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      saved.push(upload.index);
      return { ok: true, value: undefined };
    },
    finishMeeting: async () => ({
      ok: true,
      value: { status: saved.length === 2 ? 'recorded' : 'recording' } as Meeting,
    }),
  };
  const writer = new RecordingWriter(api, 'meeting');
  writer.append('video', 0, 0, 1, new Blob(['a']));
  writer.append('video', 1, 1, 1, new Blob(['b']));
  expect((await writer.finish(2)).status).toBe('recorded');
  expect(saved).toEqual([0, 1]);
});
it('reports a disk error while closing the session to preserve earlier chunks', async () => {
  let status = 'recording';
  const api: RecordingApi = {
    saveMedia: async () => ({ ok: false, error: 'Disque plein' }),
    finishMeeting: async () => {
      status = 'recorded';
      return { ok: true, value: {} as Meeting };
    },
  };
  const writer = new RecordingWriter(api, 'meeting');
  writer.append('audio', 0, 0, 1, new Blob(['audio']));
  await expect(writer.finish(1)).rejects.toThrow('Disque plein');
  expect(status).toBe('recorded');
});
