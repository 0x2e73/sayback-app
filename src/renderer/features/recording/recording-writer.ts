import type { DesktopApi, MediaKind, Meeting } from '../../../shared/contracts';
import { unwrap } from '../../../shared/contracts';
const MIN_AUDIO_BYTES = 1_024;

export type RecordingApi = Pick<DesktopApi, 'saveMedia' | 'finishMeeting'>;
export class RecordingWriter {
  private queue = Promise.resolve();
  private failure: Error | undefined;
  constructor(
    private readonly api: RecordingApi,
    private readonly id: string,
    private readonly onFailure?: (error: Error) => void,
  ) {}
  append(kind: MediaKind, index: number, at: number, duration: number, blob: Blob): void {
    if (!blob.size) return;
    // MediaRecorder sometimes closes an audio extract before its first frame: unplayable.
    if (kind === 'audio' && blob.size < MIN_AUDIO_BYTES) return;
    this.queue = this.queue
      .then(async () => {
        if (this.failure) return;
        unwrap(
          await this.api.saveMedia({
            meetingId: this.id,
            kind,
            index,
            at,
            duration,
            bytes: await blob.arrayBuffer(),
          }),
        );
      })
      .catch((error: unknown) => {
        this.failure = error instanceof Error ? error : new Error('Écriture interrompue.');
        this.onFailure?.(this.failure);
      });
  }
  async finish(duration: number): Promise<Meeting> {
    await this.queue;
    const meeting = unwrap(await this.api.finishMeeting(this.id, duration));
    if (this.failure) throw this.failure;
    return meeting;
  }
}
