import { ChevronDown } from 'lucide-react';
import type { CaptureSource } from '../../../shared/contracts';
import { Button, Notice, Skeleton } from '../../components/ui';
import { SourcePicker } from './SourcePicker';
import { SourceThumb } from './SourceOption';
import type { SourcesState } from './use-capture-sources';
import type { SourcePanel } from './use-source-panel';

interface MeetingSourceProps {
  screen: boolean;
  sources: SourcesState;
  source?: CaptureSource;
  sourceId: string;
  panel: SourcePanel;
  onSource(id: string): void;
  onReload(): void;
  onWithoutScreen(): void;
}

function SourceLoading() {
  return (
    <div className="source-summary" role="status">
      <span className="sr-only">Recherche des écrans et fenêtres…</span>
      <Skeleton variant="block" />
      <span className="source-summary-text">
        <Skeleton />
        <Skeleton short />
      </span>
    </div>
  );
}

function NoSource({
  onReload,
  onWithoutScreen,
}: Pick<MeetingSourceProps, 'onReload' | 'onWithoutScreen'>) {
  return (
    <div className="source-summary">
      <span className="source-summary-text">
        <strong>Aucun écran ni fenêtre détectés.</strong>
      </span>
      <Button variant="secondary" onClick={onReload}>
        Actualiser
      </Button>
      <Button variant="ghost" onClick={onWithoutScreen}>
        Continuer sans écran
      </Button>
    </div>
  );
}

function SourceChoice({ source, sources, sourceId, panel, onSource }: MeetingSourceProps) {
  const panelId = 'new-meeting-sources';
  return (
    <>
      <div className="source-summary">
        {source && <SourceThumb source={source} layout="row" />}
        <span className="source-summary-text">
          <strong title={source?.name}>{source?.name}</strong>
          <span className="caption">Illustre vos notes</span>
        </span>
        <Button
          ref={panel.trigger}
          variant="ghost"
          aria-expanded={panel.open}
          aria-controls={panelId}
          onClick={panel.toggle}
        >
          Changer
          <ChevronDown size={16} className="source-chevron" aria-hidden="true" />
        </Button>
      </div>
      {panel.open && sources.status === 'ready' && (
        <div id={panelId} className="source-panel" data-instant={panel.instant || undefined}>
          <SourcePicker
            sources={sources.sources}
            selectedId={sourceId}
            onSelect={onSource}
            onConfirm={panel.collapse}
          />
        </div>
      )}
    </>
  );
}

export function MeetingSource(props: MeetingSourceProps) {
  const { screen, sources } = props;
  if (!screen) {
    return <p className="source-line caption">Sans écran, les notes n’auront pas d’image.</p>;
  }
  if (sources.status === 'loading') return <SourceLoading />;
  if (sources.status === 'error') {
    return (
      <Notice
        retry={props.onReload}
        action={
          <Button variant="ghost" onClick={props.onWithoutScreen}>
            Continuer sans écran
          </Button>
        }
      >
        {sources.message}
      </Notice>
    );
  }
  if (!sources.sources.length) return <NoSource {...props} />;
  return <SourceChoice {...props} />;
}
