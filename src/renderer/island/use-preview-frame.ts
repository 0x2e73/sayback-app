import { useEffect, useRef, useState } from 'react';
import type { IslandApi } from '../../shared/contracts';

/** Past this without a frame, the preview says there is none instead of loading. */
export const FIRST_FRAME_WAIT = 3_000;

export type PreviewFrame =
  { state: 'waiting' } | { state: 'none' } | { state: 'shown'; url: string };

interface Shown {
  /** The screen or window captured when the frame arrived. */
  source: string;
  url: string;
}

function jpegUrl(jpeg: Uint8Array): string {
  return URL.createObjectURL(new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }));
}

/**
 * The preview of the capture, about once a second. A frame is decoded before it replaces the
 * one shown, then the old `blob:` URL is revoked; a frame of another source is never shown.
 */
export function usePreviewFrame(api: Pick<IslandApi, 'onPreview'>, source: string): PreviewFrame {
  const [shown, setShown] = useState<Shown | null>(null);
  const [expired, setExpired] = useState<string | null>(null);
  const currentSource = useRef(source);

  useEffect(() => {
    currentSource.current = source;
    const timer = setTimeout(() => setExpired(source), FIRST_FRAME_WAIT);
    return () => clearTimeout(timer);
  }, [source]);

  useEffect(() => {
    let alive = true;
    let sent = 0;
    let latest = 0;
    const stop = api.onPreview((jpeg) => {
      const order = ++sent;
      const url = jpegUrl(jpeg);
      const image = new Image();
      image.src = url;
      image.decode().then(
        () => {
          if (!alive || order < latest) return URL.revokeObjectURL(url);
          latest = order;
          setShown({ source: currentSource.current, url });
        },
        () => URL.revokeObjectURL(url),
      );
    });
    return () => {
      alive = false;
      stop();
    };
  }, [api]);

  // Revoked once the next frame is drawn, or when the preview goes.
  const url = shown?.url;
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  if (shown?.source === source) return { state: 'shown', url: shown.url };
  return expired === source ? { state: 'none' } : { state: 'waiting' };
}
