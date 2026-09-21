import { AppWindow, Check, Mic, Monitor, Volume2, type LucideIcon } from 'lucide-react';
import type { CaptureSource } from '../../../shared/contracts';
import type { CaptureSelection } from './use-new-meeting';

interface SourceToggleProps {
  icon: LucideIcon;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}

function SourceToggle({ icon: Icon, label, checked, disabled, onChange }: SourceToggleProps) {
  return (
    <label className="source-toggle">
      <Icon size={19} />
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

interface CaptureSourcesProps {
  selection: CaptureSelection;
  sources: CaptureSource[];
  sourceId: string;
  onSelection(selection: CaptureSelection): void;
  onSource(id: string): void;
}

interface SourceGroupProps {
  kind: 'screen' | 'window';
  sources: CaptureSource[];
  sourceId: string;
  onSource(id: string): void;
}

export function SourceGroup({ kind, sources, sourceId, onSource }: SourceGroupProps) {
  if (!sources.length) return null;
  const title = kind === 'screen' ? 'Écrans' : 'Fenêtres';

  return (
    <fieldset className="capture-source-group">
      <legend>{title}</legend>
      <div className="capture-source-list">
        {sources.map((source) => (
          <label className="capture-source-row" key={source.id}>
            <input
              type="radio"
              name="capture-source"
              value={source.id}
              checked={source.id === sourceId}
              onChange={() => onSource(source.id)}
            />
            <span className="capture-source-image" aria-hidden="true">
              {source.thumbnail ? (
                <img src={source.thumbnail} alt="" />
              ) : (
                <span className="capture-source-placeholder" aria-hidden="true">
                  {kind === 'screen' ? <Monitor size={28} /> : <AppWindow size={28} />}
                </span>
              )}
            </span>
            <span className="capture-source-name" title={source.name}>
              {source.name}
            </span>
            <Check size={16} aria-hidden="true" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CaptureSources(props: CaptureSourcesProps) {
  const { selection, sources, sourceId, onSelection, onSource } = props;
  const screens = sources.filter((source) => source.id.startsWith('screen:'));
  const windows = sources.filter((source) => !source.id.startsWith('screen:'));

  return (
    <>
      <div className="source-toggles">
        <SourceToggle
          icon={Mic}
          label="Microphone"
          checked={selection.microphone}
          onChange={(microphone) => onSelection({ ...selection, microphone })}
        />
        <SourceToggle
          icon={Monitor}
          label="Écran"
          checked={selection.screen}
          onChange={(screen) => onSelection({ ...selection, screen })}
        />
        <SourceToggle
          icon={Volume2}
          label="Son système"
          checked={selection.screen && selection.systemAudio}
          disabled={!selection.screen}
          onChange={(systemAudio) => onSelection({ ...selection, systemAudio })}
        />
      </div>
      {selection.screen && (
        <div className="capture-source-picker">
          <div className="capture-source-heading">
            <strong>Choisir ce qui sera visible</strong>
            <span className="caption">Un écran entier ou une seule fenêtre.</span>
          </div>
          {sources.length ? (
            <>
              <SourceGroup
                kind="screen"
                sources={screens}
                sourceId={sourceId}
                onSource={onSource}
              />
              <SourceGroup
                kind="window"
                sources={windows}
                sourceId={sourceId}
                onSource={onSource}
              />
            </>
          ) : (
            <p className="caption">Aucun écran ou fenêtre disponible pour le moment.</p>
          )}
        </div>
      )}
    </>
  );
}
