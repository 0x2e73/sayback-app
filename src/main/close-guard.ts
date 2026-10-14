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
