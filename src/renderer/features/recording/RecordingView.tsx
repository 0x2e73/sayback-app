import { timeLabel } from '../../../shared/format';
import { useEffect, useState } from 'react';
import { Pause, Play, Square, AudioLines } from 'lucide-react';
import type { DesktopApi } from '../../../shared/contracts';
import { Button } from '../../components/ui';
import type { CaptureSession } from './capture-session';
import { RecordingPreview } from './RecordingPreview';
import { RecordingSourceDialog } from './RecordingSourceDialog';
import { useRecordingSource } from './use-recording-source';

function AudioWaveform({ level }: { level: number }) {
  return (
    <div className="waveform" aria-label="Niveau audio">
      {Array.from({ length: 37 }, (_, index) => (
        <span
          key={index}
          style={{
            height: `${8 + level * 160 * (0.35 + Math.abs(Math.sin(index * 1.8)) * 0.65)}px`,
          }}
        />
      ))}
    </div>
  );
}

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
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState(0);
  const source = useRecordingSource(api, capture);
  useEffect(() => {
    const data = new Uint8Array(capture.analyser.frequencyBinCount);
    const timer = setInterval(() => {
      setElapsed(capture.elapsed);
      capture.analyser.getByteFrequencyData(data);
      setLevel(
        capture.paused ? 0 : data.reduce((sum, value) => sum + value, 0) / data.length / 255,
      );
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
      <AudioWaveform level={level} />
      <div className="recording-time">{timeLabel(elapsed)}</div>
      <span className="caption">
        <AudioLines size={14} />
        Audio et écran sauvegardés ici. L’analyse ne démarre qu’après l’arrêt.
      </span>
      <div className="recording-actions">
        <Button
          variant="secondary"
          disabled={stopping}
          onClick={() => {
            capture.togglePause();
            setPaused(capture.paused);
          }}
        >
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
