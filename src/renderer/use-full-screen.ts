import { useEffect } from 'react';
import type { DesktopApi } from '../shared/contracts';

function markFullScreen(fullScreen: boolean): void {
  document.documentElement.toggleAttribute('data-fullscreen', fullScreen);
}

export function useFullScreen(api: Pick<DesktopApi, 'isFullScreen' | 'onFullScreenChange'>): void {
  useEffect(() => {
    let mounted = true;
    // An event is newer than the answer to a question asked before it.
    let eventSeen = false;
    const stop = api.onFullScreenChange((fullScreen) => {
      eventSeen = true;
      markFullScreen(fullScreen);
    });
    void api
      .isFullScreen()
      .then((result) => {
        if (mounted && !eventSeen && result.ok) markFullScreen(result.value);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      stop();
    };
  }, [api]);
}
