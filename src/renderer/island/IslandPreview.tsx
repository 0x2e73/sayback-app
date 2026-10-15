import { Monitor } from 'lucide-react';
import type { IslandApi } from '../../shared/contracts';
import { usePreviewFrame } from './use-preview-frame';

interface IslandPreviewProps {
  api: Pick<IslandApi, 'onPreview'>;
  /** The screen or window captured: a new one starts over from the skeleton. */
  source: string;
}

/** About one frame a second, without any fade; dimmed and frozen while paused. */
export function IslandPreview({ api, source }: IslandPreviewProps) {
  const frame = usePreviewFrame(api, source);
  if (frame.state === 'waiting') {
    return <div className="island-preview skeleton" role="status" aria-label="Aperçu en attente" />;
  }
  if (frame.state === 'none') {
    return (
      <div className="island-preview" role="img" aria-label="Aucun aperçu">
        <Monitor size={20} aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="island-preview">
      <img src={frame.url} alt="Aperçu de l’écran capturé" />
    </div>
  );
}
