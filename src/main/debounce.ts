export interface Debounced {
  call(): void;
  cancel(): void;
}

/** Runs `action` once a burst of calls has been quiet for `delay` ms. */
export function debounce(action: () => void, delay: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    call() {
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        action();
      }, delay);
    },
    cancel,
  };
}
