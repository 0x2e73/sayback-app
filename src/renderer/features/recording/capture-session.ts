import type { CaptureSource, DesktopApi, Meeting } from '../../../shared/contracts';
import { unwrap } from '../../../shared/contracts';
import { CaptureFrames } from './capture-frames';
import { MAX_RECORDING_SECONDS } from './recording-limit';
import { RecordingWriter } from './recording-writer';
import { stopRecorder } from './stop-recorder';

import {
  openCaptureResources,
  type CaptureResources,
  type CaptureOptions,
} from './capture-resources';
export type { CaptureOptions } from './capture-resources';

export class CaptureSession {
  private readonly writer: RecordingWriter;
  private videoRecorder?: MediaRecorder;
  private audioRecorder?: MediaRecorder;
  private readonly started = performance.now();
  private pausedAt = 0;
  private pausedDuration = 0;
  private readonly pauseListeners = new Set<() => void>();
  private readonly sourceListeners = new Set<() => void>();
  private readonly frames: CaptureFrames;
  private audioIndex = 0;
  private videoIndex = 0;
  private rotation = Promise.resolve();
  private rotationTimer?: ReturnType<typeof setInterval>;
  private limitTimer?: ReturnType<typeof setTimeout>;
  private stopPromise?: Promise<Meeting>;
  private switching?: Promise<void>;
  private currentSource?: CaptureSource;
  private sourceChanges = 0;
  readonly analyser: AnalyserNode;

  private constructor(
    readonly meeting: Meeting,
    api: DesktopApi,
    private readonly resources: CaptureResources,
    private readonly options: CaptureOptions,
  ) {
    this.writer = new RecordingWriter(api, meeting.id, options.onFailure);
    this.analyser = resources.analyser;
    this.currentSource = options.source;
    this.frames = new CaptureFrames({
      paused: () => this.paused,
      stopped: () => this.stopPromise !== undefined,
      elapsed: () => this.elapsed,
      store: (index, at, jpeg) => this.writer.append('frame', index, at, 0, jpeg),
      preview: (jpeg) => api.sendPreview(jpeg),
    });
  }

  static async start(
    api: DesktopApi,
    title: string,
    options: CaptureOptions,
  ): Promise<CaptureSession> {
    const resources = await openCaptureResources(options, api);
    let meeting: Meeting | undefined;
    try {
      meeting = unwrap(await api.createMeeting(title));
      const capture = new CaptureSession(meeting, api, resources, options);
      capture.startAudio();
      if (resources.display) capture.startVideo(resources.display);
      capture.scheduleAudioRotation();
      capture.armLimit();
      return capture;
    } catch (error) {
      await resources.dispose();
      if (meeting) await api.finishMeeting(meeting.id, 0);
      throw error;
    }
  }

  private scheduleAudioRotation() {
    this.rotationTimer = setInterval(() => {
      if (this.paused || this.stopPromise) return;
      this.rotation = this.rotation
        .then(async () => {
          if (this.stopPromise) return;
          await stopRecorder(this.audioRecorder);
          this.startAudio();
        })
        .catch((error: unknown) => {
          this.options.onFailure(
            error instanceof Error ? error : new Error('Capture interrompue.'),
          );
        });
    }, 60_000);
  }

  private armLimit() {
    clearTimeout(this.limitTimer);
    if (this.paused || this.stopPromise) return;
    const remaining = Math.max(0, MAX_RECORDING_SECONDS - this.elapsed) * 1000;
    this.limitTimer = setTimeout(() => this.options.onEnded(), remaining);
  }
  get paused(): boolean {
    return this.pausedAt > 0;
  }
  get audioSources(): { microphone: boolean; systemAudio: boolean } {
    return { microphone: this.options.microphone, systemAudio: this.options.systemAudio };
  }
  get displayStream(): MediaStream | undefined {
    return this.resources.display;
  }
  get source(): CaptureSource | undefined {
    return this.currentSource;
  }
  /** Moves on at each switch of the shared screen or window, wherever it was asked. */
  get sourceVersion(): number {
    return this.sourceChanges;
  }
  get elapsed(): number {
    return ((this.pausedAt || performance.now()) - this.started - this.pausedDuration) / 1000;
  }
  private startAudio() {
    const at = this.elapsed;
    const index = this.audioIndex++;
    const recorder = new MediaRecorder(this.resources.audio, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 64_000,
    });
    recorder.ondataavailable = (event) =>
      this.writer.append('audio', index, at, this.elapsed - at, event.data);
    recorder.onerror = () =>
      this.options.onFailure(new Error('La capture audio a été interrompue.'));
    recorder.start();
    this.audioRecorder = recorder;
    if (this.paused) recorder.pause();
  }
  private startVideo(display: MediaStream) {
    this.videoRecorder = new MediaRecorder(
      new MediaStream([...display.getVideoTracks(), ...this.resources.audio.getAudioTracks()]),
      {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: 1_200_000,
        audioBitsPerSecond: 64_000,
      },
    );
    this.videoRecorder.ondataavailable = (event) =>
      this.writer.append('video', this.videoIndex++, this.elapsed, 1, event.data);
    this.videoRecorder.onerror = () =>
      this.options.onFailure(new Error('La capture vidéo a été interrompue.'));
    this.videoRecorder.start(1000);
    display.getVideoTracks().forEach((track) => {
      track.onended = () => {
        if (!this.stopPromise) this.options.onEnded();
      };
    });
    this.frames.follow(display);
  }
  async switchSource(api: Pick<DesktopApi, 'selectSource'>, source: CaptureSource): Promise<void> {
    if (this.stopPromise) throw new Error('La réunion est en cours de clôture.');
    if (this.switching) return this.switching;
    const operation = this.replaceSource(api, source);
    this.switching = operation;
    try {
      await operation;
    } finally {
      this.switching = undefined;
    }
  }
  private async replaceSource(
    api: Pick<DesktopApi, 'selectSource'>,
    source: CaptureSource,
  ): Promise<void> {
    unwrap(await api.selectSource(source.id, this.options.systemAudio));
    const next = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 10, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: this.options.systemAudio,
    });
    try {
      if (this.stopPromise) return;
      this.validateDisplayAudio(next);
      const previous = this.resources.display;
      await stopRecorder(this.videoRecorder);
      if (this.stopPromise) return;
      this.frames.release();
      if (previous) previous.getVideoTracks().forEach((track) => (track.onended = null));
      await this.resources.replaceDisplay(next);
      this.startVideo(next);
      this.currentSource = source;
      this.sourceChanges += 1;
      this.sourceListeners.forEach((listener) => listener());
    } catch (error) {
      this.restartVideoAfterFailedSwitch();
      throw error;
    } finally {
      if (this.resources.display !== next) next.getTracks().forEach((track) => track.stop());
    }
  }
  private validateDisplayAudio(display: MediaStream) {
    if (this.options.systemAudio && !display.getAudioTracks().length) {
      throw new Error('Cette source ne fournit pas de son système. La capture actuelle continue.');
    }
  }
  private restartVideoAfterFailedSwitch() {
    if (this.videoRecorder?.state !== 'inactive' || this.stopPromise) return;
    if (this.resources.display) this.startVideo(this.resources.display);
  }
  togglePause() {
    if (this.stopPromise) return;
    if (this.paused) {
      this.pausedDuration += performance.now() - this.pausedAt;
      this.pausedAt = 0;
      if (this.audioRecorder?.state === 'paused') this.audioRecorder.resume();
      if (this.videoRecorder?.state === 'paused') this.videoRecorder.resume();
    } else {
      this.pausedAt = performance.now();
      if (this.audioRecorder?.state === 'recording') this.audioRecorder.pause();
      if (this.videoRecorder?.state === 'recording') this.videoRecorder.pause();
    }
    this.resources.live.setPaused(this.paused);
    this.armLimit();
    this.pauseListeners.forEach((listener) => listener());
  }
  /** Called on every pause and resume. Returns the unsubscribe function. */
  onPauseChange(listener: () => void): () => void {
    this.pauseListeners.add(listener);
    return () => this.pauseListeners.delete(listener);
  }
  /** Called after each switch of source. Returns the unsubscribe function. */
  onSourceChange(listener: () => void): () => void {
    this.sourceListeners.add(listener);
    return () => this.sourceListeners.delete(listener);
  }
  stop(): Promise<Meeting> {
    if (this.stopPromise) return this.stopPromise;
    clearInterval(this.rotationTimer);
    this.frames.release();
    clearTimeout(this.limitTimer);
    if (!this.pausedAt) this.pausedAt = performance.now();
    this.stopPromise = (async () => {
      try {
        await this.rotation;
        await this.switching?.catch(() => undefined);
        await Promise.all([stopRecorder(this.audioRecorder), stopRecorder(this.videoRecorder)]);
        return await this.writer.finish(this.elapsed);
      } finally {
        await this.resources.dispose();
      }
    })();
    return this.stopPromise;
  }
}
