import type { MediaUpload } from '../../shared/contracts';
import type { MeetingService } from './meetings';
import { assertEditable, assertRecording } from '../domain/meeting-rules';

export interface RecordingStorage {
  save(upload: MediaUpload): Promise<void>;
  delete(id: string): Promise<void>;
}

export class RecordingService {
  private queue = Promise.resolve();

  constructor(
    private readonly meetings: MeetingService,
    private readonly storage: RecordingStorage,
  ) {}

  save(upload: MediaUpload): Promise<void> {
    const next = this.queue.then(() => this.persist(upload));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async persist(upload: MediaUpload): Promise<void> {
    const { meetingId, kind, index, at, duration } = upload;
    assertRecording(this.meetings.get(meetingId));
    await this.storage.save(upload);
    if (kind === 'audio') this.meetings.addAudio(meetingId, index, at, duration);
    if (kind === 'frame') this.meetings.addFrame(meetingId, index, at);
    if (kind === 'video') this.meetings.markVideo(meetingId);
  }

  async remove(id: string): Promise<void> {
    const meeting = this.meetings.get(id);
    assertEditable(meeting);
    await this.storage.delete(id);
    this.meetings.delete(id);
  }
}
