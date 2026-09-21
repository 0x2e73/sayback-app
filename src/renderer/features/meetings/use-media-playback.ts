import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { Meeting } from '../../../shared/contracts';

export interface PlayerHandle {
  seek(at: number): void;
}

export function useMediaPlayback(
  meeting: Meeting,
  onTime: (at: number) => void,
  ref: Ref<PlayerHandle>,
) {
  const player = useRef<HTMLMediaElement | null>(null);
  const pendingTime = useRef<number | null>(null);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [error, setError] = useState(false);
  const chunk = meeting.audioChunks[chunkIndex];
  const offset = meeting.hasVideo ? 0 : (chunk?.start ?? 0);

  useImperativeHandle(
    ref,
    () => ({
      seek(at) {
        if (!meeting.hasVideo) {
          const index = meeting.audioChunks.findIndex(
            (item) => at >= item.start && at < item.start + item.duration,
          );
          if (index >= 0 && index !== chunkIndex) {
            pendingTime.current = at - meeting.audioChunks[index]!.start;
            setChunkIndex(index);
            return;
          }
        }
        if (!player.current) return;
        player.current.currentTime = Math.max(0, at - offset);
        void player.current.play().catch(() => undefined);
      },
    }),
    [meeting, chunkIndex, offset],
  );

  function onLoadedMetadata() {
    if (pendingTime.current === null || !player.current) return;
    player.current.currentTime = pendingTime.current;
    pendingTime.current = null;
    void player.current.play().catch(() => undefined);
  }

  function selectChunk(index: number) {
    setChunkIndex(index);
    setError(false);
  }

  const mediaProps = {
    controls: true,
    preload: 'metadata',
    ref: (element: HTMLMediaElement | null) => {
      player.current = element;
    },
    onTimeUpdate: () => onTime(offset + (player.current?.currentTime ?? 0)),
    onLoadedMetadata,
    onError: () => setError(true),
  };
  return { mediaProps, chunk, chunkIndex, selectChunk, error };
}
