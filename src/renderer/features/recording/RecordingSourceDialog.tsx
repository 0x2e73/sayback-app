import { Button, Dialog, Notice, Skeleton } from '../../components/ui';
import { SourcePicker } from './SourcePicker';
import type { useRecordingSource } from './use-recording-source';

interface RecordingSourceDialogProps {
  source: ReturnType<typeof useRecordingSource>;
}

function SourcesLoading() {
  return (
    <div className="recording-source-loading" role="status">
      <span className="sr-only">Recherche des écrans et fenêtres…</span>
      <Skeleton variant="block" />
      <Skeleton />
      <Skeleton short />
    </div>
  );
}

export function RecordingSourceDialog({ source }: RecordingSourceDialogProps) {
  return (
    <Dialog
      title="Changer la source capturée"
      busy={source.switching}
      onClose={source.closePicker}
      footer={
        <>
          <Button variant="ghost" disabled={source.switching} onClick={source.closePicker}>
            Annuler
          </Button>
          <Button
            disabled={!source.selectedId || source.loading}
            busy={source.switching}
            onClick={() => void source.switchSource()}
          >
            Utiliser cette source
          </Button>
        </>
      }
    >
      <div className="recording-source-dialog">
        <p className="caption">La réunion et le son continuent pendant le changement.</p>
        {source.error && <Notice>{source.error}</Notice>}
        {source.loading && <SourcesLoading />}
        {!source.loading && source.sources.length > 0 && (
          <SourcePicker
            sources={source.sources}
            selectedId={source.selectedId}
            onSelect={source.setSelectedId}
          />
        )}
        {!source.loading && !source.sources.length && <p>Aucune source disponible.</p>}
      </div>
    </Dialog>
  );
}
