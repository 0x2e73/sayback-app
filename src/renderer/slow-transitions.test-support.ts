import { vi } from 'vitest';

/** Test-only: every element reports a 150 ms transition, so exits stay mounted until they end. */
export function slowTransitions(): void {
  const original = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = original(element, pseudo);
    return new Proxy(style, {
      get(target, key) {
        if (key === 'transitionDuration') return '0.15s';
        const value = Reflect.get(target, key, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  });
}
