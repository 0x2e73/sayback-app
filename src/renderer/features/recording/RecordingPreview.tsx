import { useEffect, useRef } from 'react';
import type { CaptureSession } from './capture-session';

interface RecordingPreviewProps {
  capture: CaptureSession;
  version: number;
}

export function RecordingPreview({ capture, version }: RecordingPreviewProps) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = capture.displayStream ?? null;
    return () => {
      element.srcObject = null;
    };
  }, [capture, version]);

  return (
    <section className="recording-preview" aria-label="Aperçu de la capture">
      <video ref={video} autoPlay muted playsInline aria-label="Aperçu en direct" />
      <div className="recording-preview-caption">
        <span className="recording-preview-live">En direct</span>
        <span>{capture.source?.name ?? 'Écran partagé'}</span>
      </div>
    </section>
  );
}
