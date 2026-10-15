// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureFrames, jpegFrame, PREVIEW, type FrameSink } from './capture-frames';

const drawn: { width: number; height: number }[] = [];

function sizedVideo(width: number, height: number) {
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(width);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(height);
}

beforeEach(() => {
  vi.useFakeTimers();
  drawn.length = 0;
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  const context = {
    drawImage: (_video: unknown, _x: number, _y: number, width: number, height: number) =>
      drawn.push({ width, height }),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    `data:image/jpeg;base64,${btoa('\xff\xd8\xff')}`,
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function sink(overrides: Partial<FrameSink> = {}) {
  return {
    paused: () => false,
    stopped: () => false,
    elapsed: () => 42,
    store: vi.fn(),
    preview: vi.fn(),
    ...overrides,
  } satisfies FrameSink;
}

describe('jpegFrame', () => {
  it('downscales the frame to the width asked, keeping its ratio, as JPEG bytes', () => {
    sizedVideo(1920, 1080);
    const frame = jpegFrame(document.createElement('video'), PREVIEW.width, PREVIEW.quality);
    expect(drawn).toEqual([{ width: 276, height: 155 }]);
    expect(frame).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.6);
  });

  it('never enlarges a small frame, and has nothing before the first one', () => {
    sizedVideo(200, 100);
    jpegFrame(document.createElement('video'), PREVIEW.width, PREVIEW.quality);
    expect(drawn).toEqual([{ width: 200, height: 100 }]);
    sizedVideo(0, 0);
    expect(jpegFrame(document.createElement('video'), 276, 0.6)).toBeNull();
  });
});

describe('CaptureFrames', () => {
  const display = {} as MediaStream;

  it('sends a preview every second and keeps a still once playing, then every 30 s', async () => {
    sizedVideo(1280, 800);
    const target = sink();
    new CaptureFrames(target).follow(display);
    await vi.advanceTimersByTimeAsync(0);
    expect(target.store).toHaveBeenCalledExactlyOnceWith(0, 42, expect.any(Blob));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(target.preview).toHaveBeenCalledTimes(3);
    expect(target.preview).toHaveBeenLastCalledWith(new Uint8Array([0xff, 0xd8, 0xff]));
    await vi.advanceTimersByTimeAsync(27_000);
    expect(target.store).toHaveBeenLastCalledWith(1, 42, expect.any(Blob));
  });

  it('sends nothing while paused or closing, and stops once released', async () => {
    sizedVideo(1280, 800);
    let paused = true;
    const target = sink({ paused: () => paused });
    const frames = new CaptureFrames(target);
    frames.follow(display);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(target.preview).not.toHaveBeenCalled();
    expect(target.store).not.toHaveBeenCalled();
    paused = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(target.preview).toHaveBeenCalledOnce();
    frames.release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(target.preview).toHaveBeenCalledOnce();
  });

  it('keeps recording when the preview cannot be sent', async () => {
    sizedVideo(1280, 800);
    const preview = vi.fn(() => {
      throw new Error('no island');
    });
    new CaptureFrames(sink({ preview })).follow(display);
    await expect(vi.advanceTimersByTimeAsync(2_000)).resolves.not.toThrow();
    expect(preview).toHaveBeenCalledTimes(2);
  });
});
