interface SheetWindow {
  isVisible(): boolean;
  isMinimized(): boolean;
  show(): void;
  restore(): void;
}

/** A sheet on a hidden or minimised window is never seen: the window comes forward first. */
export function revealForSheet(window: SheetWindow): void {
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
}

// Closing the window, and so quitting the app, is refused while a recording runs.
export function guardClose(
  isRecording: () => boolean,
  event: { preventDefault(): void },
  warn: () => void,
): void {
  if (!isRecording()) return;
  event.preventDefault();
  warn();
}
