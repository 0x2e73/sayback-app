import { timeLabel } from '../../../shared/format';
import { useEffect, useState } from 'react';
import { Pause, Play, Square, AudioLines } from 'lucide-react';
import type { DesktopApi } from '../../../shared/contracts';
import { Button, LevelMeter } from '../../components/ui';
import type { CaptureSession } from './capture-session';
import { RecordingPreview } from './RecordingPreview';
import { RecordingSourceDialog } from './RecordingSourceDialog';
import { useRecordingFeed } from './use-recording-feed';
import { useRecordingSource } from './use-recording-source';

export function RecordingView({
  capture,
  api,
  onStop,
  stopping,
}: {
  capture: CaptureSession;
  api: DesktopApi;
  onStop(): void;
  stopping: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(capture.paused);
  const source = useRecordingSource(api, capture);
  const feed = useRecordingFeed(api, capture);
  // A pause may come from the menu bar or the island: the label follows the session.
  useEffect(() => {
    setPaused(capture.paused);
    return capture.onPauseChange(() => setPaused(capture.paused));
  }, [capture]);
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(capture.elapsed);
      if (capture.elapsed >= 7200) onStop();
    }, 200);
    return () => clearInterval(timer);
  }, [capture, onStop]);
  return (
    <div className="recording-view">
      <span className={`recording-pill ${paused ? 'is-paused' : ''}`}>
        <span />
        {paused ? 'En pause' : 'Enregistrement en cours'}
      </span>
      <h1>{capture.meeting.title}</h1>
      <p>Restez dans la conversation. On garde le fil.</p>
      {capture.displayStream && (
        <div className="recording-source">
          <RecordingPreview capture={capture} version={source.previewVersion} />
          <Button variant="secondary" disabled={stopping} onClick={() => void source.openPicker()}>
            Changer d’écran ou de fenêtre
          </Button>
        </div>
      )}
      <LevelMeter feed={feed} bars={24} className="level-meter-large" />
      <div className="recording-time">{timeLabel(elapsed)}</div>
      <span className="caption">
        <AudioLines size={14} />
        Audio et écran sauvegardés ici. L’analyse ne démarre qu’après l’arrêt.
      </span>
      <div className="recording-actions">
        <Button variant="secondary" disabled={stopping} onClick={() => capture.togglePause()}>
          {paused ? <Play size={16} /> : <Pause size={16} />}
          {paused ? 'Reprendre' : 'Pause'}
        </Button>
        <Button onClick={onStop} busy={stopping}>
          <Square size={14} fill="currentColor" />
          Terminer la réunion
        </Button>
      </div>
      <p className="caption">
        Vérifiez que le niveau audio réagit quand vous parlez.
        <br />
        Avec un casque, vous limitez l’écho entre le micro et le son système.
      </p>
      {source.open && <RecordingSourceDialog source={source} />}
    </div>
  );
}
