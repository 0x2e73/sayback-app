import { Button, Dialog, Notice } from '../../components/ui';
import { SourceGroup } from './CaptureSources';
import type { useRecordingSource } from './use-recording-source';

interface RecordingSourceDialogProps {
  source: ReturnType<typeof useRecordingSource>;
}

export function RecordingSourceDialog({ source }: RecordingSourceDialogProps) {
  return (
    <Dialog title="Changer la source capturée" busy={source.switching} onClose={source.closePicker}>
      <div className="recording-source-dialog">
        <p className="caption">La réunion et le son continuent pendant le changement.</p>
        {source.error && <Notice>{source.error}</Notice>}
        {source.loading ? (
          <p role="status">Recherche des écrans et fenêtres…</p>
        ) : (
          <>
            <SourceGroup
              kind="screen"
              sources={source.sources.filter((item) => item.id.startsWith('screen:'))}
              sourceId={source.selectedId}
              onSource={source.setSelectedId}
            />
            <SourceGroup
              kind="window"
              sources={source.sources.filter((item) => !item.id.startsWith('screen:'))}
              sourceId={source.selectedId}
              onSource={source.setSelectedId}
            />
            {!source.sources.length && <p>Aucune source disponible.</p>}
          </>
        )}
        <div className="recording-source-actions">
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
        </div>
      </div>
    </Dialog>
  );
}
