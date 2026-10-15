import { ChevronDown } from 'lucide-react';
import type { CaptureSource } from '../../../shared/contracts';
import { Presence } from '../../components/Presence';
import { useHeld } from '../../components/use-held';
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
      <Presence open={panel.open && sources.status === 'ready'}>
        {({ ref, state }) => (
          <div
            ref={ref}
            id={panelId}
            className="source-panel"
            data-state={state}
            data-instant={panel.instant || undefined}
          >
            <SourcePicker
              sources={sources.status === 'ready' ? sources.sources : []}
              selectedId={sourceId}
              onSelect={onSource}
              onConfirm={panel.collapse}
            />
          </div>
        )}
      </Presence>
    </>
  );
}

/**
 * Each state of the source line is a view of one cell: the one that leaves lies under the one
 * that arrives, so the skeleton turns into the real source and a refusal appears in place.
 */
export function MeetingSource(props: MeetingSourceProps) {
  const { screen, sources } = props;
  const loading = screen && sources.status === 'loading';
  const failed = screen && sources.status === 'error';
  const message = useHeld(sources.status === 'error' ? sources.message : null);
  const ready = screen && !loading && !failed;
  return (
    <div className="state-stack">
      <Presence open={!screen}>
        {({ ref, state }) => (
          <p ref={ref} className="source-line state-view caption" data-state={state}>
            Sans écran, les notes n’auront pas d’image.
          </p>
        )}
      </Presence>
      <Presence open={loading}>
        {({ ref, state }) => (
          <div ref={ref} className="state-view" data-state={state}>
            <SourceLoading />
          </div>
        )}
      </Presence>
      <Presence open={failed}>
        {({ ref, state }) => (
          <div ref={ref} className="state-view" data-state={state}>
            <Notice
              retry={props.onReload}
              action={
                <Button variant="ghost" onClick={props.onWithoutScreen}>
                  Continuer sans écran
                </Button>
              }
            >
              {message}
            </Notice>
          </div>
        )}
      </Presence>
      <Presence open={ready}>
        {({ ref, state }) => (
          <div ref={ref} className="state-view" data-state={state}>
            {sources.status === 'ready' && !sources.sources.length ? (
              <NoSource {...props} />
            ) : (
              <SourceChoice {...props} />
            )}
          </div>
        )}
      </Presence>
    </div>
  );
}
