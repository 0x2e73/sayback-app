import { useEffect } from 'react';
import type { DesktopApi } from '../shared/contracts';

function markFullScreen(fullScreen: boolean): void {
  document.documentElement.toggleAttribute('data-fullscreen', fullScreen);
}

export function useFullScreen(api: Pick<DesktopApi, 'isFullScreen' | 'onFullScreenChange'>): void {
  useEffect(() => {
    let mounted = true;
    const stop = api.onFullScreenChange(markFullScreen);
    void api
      .isFullScreen()
      .then((result) => {
        if (mounted && result.ok) markFullScreen(result.value);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      stop();
    };
  }, [api]);
}
