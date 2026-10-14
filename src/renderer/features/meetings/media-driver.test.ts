import { describe, expect, it, vi, type Mock } from 'vitest';
import { MediaDriver, type MediaLike } from './media-driver';

// `ended` is widened to boolean: `satisfies` alone would pin it to the literal false.
interface FakeMedia extends MediaLike {
  ended: boolean;
  play: Mock<() => Promise<void>>;
  pause: Mock<() => void>;
  load: Mock<() => void>;
}

function fakeMedia(play: () => Promise<void> = async () => undefined): FakeMedia {
  return {
    currentTime: 0,
    ended: false,
    play: vi.fn(play),
    pause: vi.fn(),
    load: vi.fn(),
  };
}

function loadedDriver(media: MediaLike): MediaDriver {
  const driver = new MediaDriver();
  driver.attach(media);
  driver.loadedMetadata();
  return driver;
}

describe('MediaDriver', () => {
  it('seeks inside the loaded source at once', () => {
    const media = fakeMedia();
    loadedDriver(media).seek(30, true);
    expect(media.currentTime).toBe(30);
    expect(media.play).toHaveBeenCalledOnce();
  });

  it('waits for the metadata of the next source before seeking and playing', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    media.currentTime = 59;
    driver.queue(30, true);
    expect(driver.waiting).toBe(true);
    expect(media.currentTime).toBe(59);
    expect(media.play).not.toHaveBeenCalled();
    driver.loadedMetadata();
    expect(media.currentTime).toBe(30);
    expect(media.play).toHaveBeenCalledOnce();
    expect(driver.waiting).toBe(false);
  });

  it('keeps only the last target while a source loads', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    driver.queue(10, false);
    driver.seek(40, true);
    driver.loadedMetadata();
    expect(media.currentTime).toBe(40);
    expect(media.play).toHaveBeenCalledOnce();
  });

  it('keeps a seek made before the first metadata', () => {
    const media = fakeMedia();
    const driver = new MediaDriver();
    driver.attach(media);
    driver.seek(12, false);
    expect(media.currentTime).toBe(0);
    driver.loadedMetadata();
    expect(media.currentTime).toBe(12);
    expect(media.play).not.toHaveBeenCalled();
  });

  it('cancels a queued play when paused meanwhile', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    driver.queue(0, true);
    driver.setPlaying(false);
    driver.loadedMetadata();
    expect(media.play).not.toHaveBeenCalled();
  });

  it('plays and pauses the loaded source', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    driver.setPlaying(true);
    driver.setPlaying(false);
    expect(media.play).toHaveBeenCalledOnce();
    expect(media.pause).toHaveBeenCalledOnce();
  });

  it('fetches a failed source again', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    driver.failed();
    driver.retry(30, true);
    expect(media.load).toHaveBeenCalledOnce();
    driver.loadedMetadata();
    expect(media.currentTime).toBe(30);
    expect(media.play).toHaveBeenCalledOnce();
  });

  it('drops the target of a source that fails', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    driver.queue(30, true);
    driver.failed();
    expect(driver.waiting).toBe(false);
    driver.loadedMetadata();
    expect(media.currentTime).toBe(0);
  });

  it('still stops the element after React detached its ref', () => {
    const media = fakeMedia();
    const driver = new MediaDriver();
    driver.attach(media);
    driver.attach(null);
    driver.stop();
    expect(media.pause).toHaveBeenCalledOnce();
  });

  it('forgets the queued target when stopped during a load', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    driver.queue(30, true);
    driver.stop();
    expect(driver.waiting).toBe(false);
    driver.loadedMetadata();
    expect(media.currentTime).toBe(0);
    expect(media.play).not.toHaveBeenCalled();
  });

  it('ignores a play interrupted by a source change', async () => {
    const media = fakeMedia(() => Promise.reject(new DOMException('interrupted', 'AbortError')));
    loadedDriver(media).setPlaying(true);
    await Promise.resolve();
    expect(media.play).toHaveBeenCalledOnce();
  });

  it('reports the end of the element', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    expect(driver.ended).toBe(false);
    media.ended = true;
    expect(driver.ended).toBe(true);
  });
});
