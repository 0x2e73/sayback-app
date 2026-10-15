/** Resolves once the recorder has flushed its last chunk; an idle one resolves at once. */
export function stopRecorder(recorder?: MediaRecorder): Promise<void> {
  if (!recorder || recorder.state === 'inactive') return Promise.resolve();
  return new Promise((resolve) => {
    recorder.addEventListener('stop', () => resolve(), { once: true });
    recorder.stop();
  });
}
