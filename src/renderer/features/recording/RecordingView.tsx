import { chronoLabel } from '../../../shared/format';
import type { DesktopApi } from '../../../shared/contracts';
import { Button, LevelMeter } from '../../components/ui';
import type { CaptureSession } from './capture-session';
import { RecordingActions } from './RecordingActions';
import { RecordingFailure } from './RecordingFailure';
import { RECORDING_LIMIT_NOTE } from './recording-limit';
import { RecordingPreview } from './RecordingPreview';
import { RecordingSourceDialog } from './RecordingSourceDialog';
import { RecordingStatus, type RecordingPhase } from './RecordingStatus';
import { SilenceNotice } from './SilenceNotice';
import { useCapturePaused } from './use-capture-paused';
import { useRecordingClock } from './use-recording-clock';
import { useRecordingFeed } from './use-recording-feed';
import { useRecordingSource } from './use-recording-source';

interface RecordingViewProps {
  capture: CaptureSession;
  api: DesktopApi;
  onStop(): void;
  stopping: boolean;
  failed: boolean;
  onOpenInterrupted(): void;
}

function phaseOf(failed: boolean, stopping: boolean, paused: boolean): RecordingPhase {
  if (failed) return 'failed';
  if (stopping) return 'stopping';
  return paused ? 'paused' : 'recording';
}

export function RecordingView({
  capture,
  api,
  onStop,
  stopping,
  failed,
  onOpenInterrupted,
}: RecordingViewProps) {
  const paused = useCapturePaused(capture);
  const elapsed = useRecordingClock(capture, onStop);
  const source = useRecordingSource(api, capture);
  const feed = useRecordingFeed(api, capture);
  const phase = phaseOf(failed, stopping, paused);
  return (
    <div className="recording-view">
      <header className="recording-header">
        <RecordingStatus phase={phase} />
        <h1>{capture.meeting.title}</h1>
      </header>
      <div className="recording-time" role="timer" aria-label="Durée de la réunion">
        {chronoLabel(elapsed)}
      </div>
      <LevelMeter feed={feed} bars={24} className="level-meter-large" />
      {phase === 'recording' && <SilenceNotice feed={feed} />}
      {stopping && <div className="finalizing-line" aria-hidden="true" />}
      {failed && <RecordingFailure opening={stopping} onOpen={onOpenInterrupted} />}
      {capture.displayStream && !failed && (
        <div className="recording-source">
          <RecordingPreview capture={capture} version={source.previewVersion} />
          <Button variant="secondary" disabled={stopping} onClick={() => void source.openPicker()}>
            Changer d’écran ou de fenêtre
          </Button>
        </div>
      )}
      {!failed && (
        <footer className="recording-footer">
          <RecordingActions
            paused={paused}
            stopping={stopping}
            onTogglePause={() => capture.togglePause()}
            onStop={onStop}
          />
          <p className="caption">{RECORDING_LIMIT_NOTE}</p>
        </footer>
      )}
      {source.open && <RecordingSourceDialog source={source} />}
    </div>
  );
}
