import type { CaptureSource, DesktopApi, Meeting } from '../../../shared/contracts';
import { unwrap } from '../../../shared/contracts';
import { MAX_RECORDING_SECONDS } from './recording-limit';
import { RecordingWriter } from './recording-writer';

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
  private audioIndex = 0;
  private videoIndex = 0;
  private frameIndex = 0;
  private rotation = Promise.resolve();
  private rotationTimer?: ReturnType<typeof setInterval>;
  private frameTimer?: ReturnType<typeof setInterval>;
  private limitTimer?: ReturnType<typeof setTimeout>;
  private stopPromise?: Promise<Meeting>;
  private switching?: Promise<void>;
  private preview?: HTMLVideoElement;
  private currentSource?: CaptureSource;
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
  }

  static async start(
    api: DesktopApi,
    title: string,
    options: CaptureOptions,
  ): Promise<CaptureSession> {
    const resources = await openCaptureResources(options);
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
          await this.stopRecorder(this.audioRecorder);
          this.startAudio();
        })
        .catch((error: unknown) => {
          this.options.onFailure(
            error instanceof Error ? error : new Error('Capture interrompue.'),
          );
        });
    }, 60_000);
  }

  // A timer of the capture, not of the view: a hidden window throttles its own.
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
    this.preview = document.createElement('video');
    this.preview.srcObject = display;
    this.preview.muted = true;
    void this.preview
      .play()
      .then(() => this.snapshot())
      .catch(() => undefined);
    this.frameTimer = setInterval(() => this.snapshot(), 30_000);
  }
  async switchSource(api: DesktopApi, source: CaptureSource): Promise<void> {
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
  private async replaceSource(api: DesktopApi, source: CaptureSource): Promise<void> {
    unwrap(await api.selectSource(source.id, this.options.systemAudio));
    const next = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 10, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: this.options.systemAudio,
    });
    try {
      if (this.stopPromise) return;
      this.validateDisplayAudio(next);
      const previous = this.resources.display;
      await this.stopRecorder(this.videoRecorder);
      if (this.stopPromise) return;
      clearInterval(this.frameTimer);
      if (previous) previous.getVideoTracks().forEach((track) => (track.onended = null));
      await this.resources.replaceDisplay(next);
      this.preview?.pause();
      if (this.preview) this.preview.srcObject = null;
      this.startVideo(next);
      this.currentSource = source;
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
  private snapshot() {
    if (this.paused || this.stopPromise || !this.preview?.videoWidth || this.frameIndex >= 240)
      return;
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(this.preview.videoWidth, 1280);
    canvas.height = Math.round((canvas.width * this.preview.videoHeight) / this.preview.videoWidth);
    canvas.getContext('2d')?.drawImage(this.preview, 0, 0, canvas.width, canvas.height);
    const at = this.elapsed;
    const index = this.frameIndex++;
    const data = canvas.toDataURL('image/jpeg', 0.65).split(',')[1]!;
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    this.writer.append('frame', index, at, 0, new Blob([bytes], { type: 'image/jpeg' }));
  }
  togglePause() {
    if (this.stopPromise) return;
    if (this.paused) {
      this.pausedDuration += performance.now() - this.pausedAt;
      this.pausedAt = 0;
      this.armLimit();
      if (this.audioRecorder?.state === 'paused') this.audioRecorder.resume();
      if (this.videoRecorder?.state === 'paused') this.videoRecorder.resume();
    } else {
      this.pausedAt = performance.now();
      clearTimeout(this.limitTimer);
      if (this.audioRecorder?.state === 'recording') this.audioRecorder.pause();
      if (this.videoRecorder?.state === 'recording') this.videoRecorder.pause();
    }
    this.pauseListeners.forEach((listener) => listener());
  }
  /** Called on every pause and resume. Returns the unsubscribe function. */
  onPauseChange(listener: () => void): () => void {
    this.pauseListeners.add(listener);
    return () => this.pauseListeners.delete(listener);
  }
  private stopRecorder(recorder?: MediaRecorder): Promise<void> {
    if (!recorder || recorder.state === 'inactive') return Promise.resolve();
    return new Promise((resolve) => {
      recorder.addEventListener('stop', () => resolve(), { once: true });
      recorder.stop();
    });
  }
  stop(): Promise<Meeting> {
    if (this.stopPromise) return this.stopPromise;
    clearInterval(this.rotationTimer);
    clearInterval(this.frameTimer);
    clearTimeout(this.limitTimer);
    if (!this.pausedAt) this.pausedAt = performance.now();
    this.stopPromise = (async () => {
      try {
        await this.rotation;
        await this.switching?.catch(() => undefined);
        await Promise.all([
          this.stopRecorder(this.audioRecorder),
          this.stopRecorder(this.videoRecorder),
        ]);
        return await this.writer.finish(this.elapsed);
      } finally {
        this.preview?.pause();
        if (this.preview) this.preview.srcObject = null;
        await this.resources.dispose();
      }
    })();
    return this.stopPromise;
  }
}
