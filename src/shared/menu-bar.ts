import { z } from 'zod';

export const recordingAnnouncementSchema = z.discriminatedUnion('recording', [
  z.object({ recording: z.literal(false) }),
  z.object({ recording: z.literal(true), startedAt: z.iso.datetime() }),
]);

/** What the page tells the main process about the recording in progress. */
export type RecordingAnnouncement =
  { recording: false; startedAt?: undefined } | { recording: true; startedAt: string };
