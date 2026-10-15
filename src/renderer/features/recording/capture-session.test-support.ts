import { vi } from 'vitest';

// Test-only fakes of the browser capture: streams, recorders and displays.
export const displayTracks: Array<{ stop: () => void; onended: (() => void) | null }> = [];

export class FakeStream {
  constructor(private readonly tracks: unknown[]) {}
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks.filter((track) => 'onended' in (track as object));
  }
  getAudioTracks() {
    return this.tracks.filter((track) => !('onended' in (track as object)));
  }
}

export class FakeRecorder {
  static made: FakeRecorder[] = [];
  state = 'inactive';
  ondataavailable?: (event: BlobEvent) => void;
  onerror?: () => void;
  private onStop?: () => void;
  constructor(readonly stream: MediaStream) {
    FakeRecorder.made.push(this);
  }
  start() {
    this.state = 'recording';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  addEventListener(event: string, listener: () => void) {
    if (event === 'stop') this.onStop = listener;
  }
  stop() {
    this.state = 'inactive';
    this.onStop?.();
  }
}

export function display() {
  const track = { stop: vi.fn(), onended: null as (() => void) | null };
  displayTracks.push(track);
  return new FakeStream([track]) as unknown as MediaStream;
}
