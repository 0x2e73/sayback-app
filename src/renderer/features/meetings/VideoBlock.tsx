import { useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { Button } from '../../components/ui';
import type { MediaElementProps } from './use-media-playback';

interface VideoBlockProps {
  mediaProps: MediaElementProps;
}

/** The footer bar drives the video; the button is the only way to fill the screen. */
export function VideoBlock({ mediaProps }: VideoBlockProps) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const sync = () => setFullscreen(document.fullscreenElement === element);
    element.addEventListener('fullscreenchange', sync);
    return () => element.removeEventListener('fullscreenchange', sync);
  }, []);

  function attach(element: HTMLVideoElement | null): void {
    video.current = element;
    mediaProps.ref(element);
  }

  function enterFullscreen(): void {
    video.current?.requestFullscreen().catch(() => undefined);
  }

  return (
    <div className="detail-video-block">
      <video className="detail-video" {...mediaProps} ref={attach} controls={fullscreen} />
      <Button
        variant="ghost"
        shape="round"
        className="detail-video-fullscreen"
        aria-label="Plein écran"
        title="Plein écran"
        onClick={enterFullscreen}
      >
        <Maximize2 size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}
