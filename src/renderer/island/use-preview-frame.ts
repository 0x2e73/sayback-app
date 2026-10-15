import { useEffect, useRef, useState } from 'react';
import type { IslandApi } from '../../shared/contracts';

/** Past this without a frame, the preview says there is none, unless the recording is paused. */
export const FRAME_WAIT = 3_000;

export type PreviewFrame =
  { state: 'waiting' } | { state: 'none' } | { state: 'shown'; url: string };

interface Shown {
  /** The screen or window captured when the frame arrived. */
  source: string;
  url: string;
}

/** The frame whose wait ran out, or none yet for that source. */
interface Expired {
  source: string;
  url: string | null;
}

function jpegUrl(jpeg: Uint8Array): string {
  return URL.createObjectURL(new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }));
}

/**
 * The preview of the capture, about once a second. A frame is decoded before it replaces the
 * one shown, whose `blob:` URL is then revoked; a frame of another source is never shown.
 */
function useDecodedFrames(api: Pick<IslandApi, 'onPreview'>, source: string): Shown | null {
  const [shown, setShown] = useState<Shown | null>(null);
  const currentSource = useRef(source);
  const shownUrl = useRef<string | null>(null);

  useEffect(() => {
    currentSource.current = source;
  }, [source]);

  useEffect(() => {
    let alive = true;
    let received = 0;
    let latest = 0;
    const stop = api.onPreview((jpeg) => {
      const order = ++received;
      const frame: Shown = { source: currentSource.current, url: jpegUrl(jpeg) };
      const image = new Image();
      image.src = frame.url;
      image.decode().then(
        () => {
          if (!alive || order < latest) return URL.revokeObjectURL(frame.url);
          latest = order;
          const previous = shownUrl.current;
          shownUrl.current = frame.url;
          setShown(frame);
          if (previous) URL.revokeObjectURL(previous);
        },
        () => URL.revokeObjectURL(frame.url),
      );
    });
    return () => {
      alive = false;
      stop();
      if (shownUrl.current) URL.revokeObjectURL(shownUrl.current);
      shownUrl.current = null;
    };
  }, [api]);

  return shown;
}

/** Paused, the last frame stays as it is; without any, the icon. */
export function usePreviewFrame(
  api: Pick<IslandApi, 'onPreview'>,
  source: string,
  paused: boolean,
  /** Folded, main sends no frame: the wait does not count. */
  expanded: boolean,
): PreviewFrame {
  const shown = useDecodedFrames(api, source);
  const [expired, setExpired] = useState<Expired | null>(null);
  const url = shown?.source === source ? shown.url : null;

  // Restarted by every frame, every new source and every opening; a pause or a fold stops it.
  useEffect(() => {
    if (paused || !expanded) return;
    const timer = setTimeout(() => setExpired({ source, url }), FRAME_WAIT);
    return () => clearTimeout(timer);
  }, [source, url, paused, expanded]);

  const stale = expired?.source === source && expired.url === url;
  if (url && (paused || !stale)) return { state: 'shown', url };
  return paused || stale ? { state: 'none' } : { state: 'waiting' };
}
