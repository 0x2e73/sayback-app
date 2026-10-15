/**
 * Runs once the current frame has been painted. A style changed in the same frame as the first
 * render would start from nowhere: the shell would appear open instead of growing.
 */
export function afterNextPaint(callback: () => void): () => void {
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(callback);
  });
  return () => cancelAnimationFrame(frame);
}
