import { useEffect, useState } from 'react';
import type { IslandApi } from '../../shared/contracts';
import type { IslandThumbnail } from '../../shared/island';

export type Thumbnail =
  { state: 'loading' } | { state: 'missing' } | { state: 'ready'; url: string };

function urlsOf(thumbnails: readonly IslandThumbnail[]): Map<string, string> {
  return new Map(
    thumbnails.map(({ id, jpeg }) => [
      id,
      URL.createObjectURL(new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' })),
    ]),
  );
}

/** Read once when the picker opens, never refreshed; the `blob:` URLs go with it. */
export function useScreenThumbnails(
  api: Pick<IslandApi, 'screenThumbnails'>,
): (id: string) => Thumbnail {
  const [urls, setUrls] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    let alive = true;
    let read = new Map<string, string>();
    api
      .screenThumbnails()
      .catch(() => null)
      .then((result) => {
        if (!alive) return;
        read = urlsOf(result?.ok ? result.value : []);
        setUrls(read);
      });
    return () => {
      alive = false;
      read.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [api]);

  return (id) => {
    if (!urls) return { state: 'loading' };
    const url = urls.get(id);
    return url ? { state: 'ready', url } : { state: 'missing' };
  };
}
