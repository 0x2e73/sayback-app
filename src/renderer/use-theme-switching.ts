import { useEffect } from 'react';

const SWITCHING = 'data-theme-switching';

/**
 * The native material changes at once, so colour transitions must not lag behind it:
 * the root carries `data-theme-switching` for two frames after each change of scheme.
 */
export function useThemeSwitching(): void {
  useEffect(() => {
    // jsdom has no matchMedia.
    if (typeof window.matchMedia !== 'function') return;
    const root = document.documentElement;
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    let pending = 0;
    const settle = (framesLeft: number) => {
      if (framesLeft === 0) {
        root.removeAttribute(SWITCHING);
        return;
      }
      pending = requestAnimationFrame(() => settle(framesLeft - 1));
    };
    const freeze = () => {
      cancelAnimationFrame(pending);
      root.setAttribute(SWITCHING, '');
      settle(2);
    };
    scheme.addEventListener('change', freeze);
    return () => {
      scheme.removeEventListener('change', freeze);
      cancelAnimationFrame(pending);
      root.removeAttribute(SWITCHING);
    };
  }, []);
}
