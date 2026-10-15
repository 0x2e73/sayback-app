import { Mic, MicOff, Monitor, MonitorOff, Volume2, VolumeX, type LucideIcon } from 'lucide-react';
import type { SourceKey, SourceToggles } from '../../../shared/capture-selection';
import { Chip } from '../../components/ui';

interface ChipSpec {
  key: SourceKey;
  label: string;
  on: LucideIcon;
  off: LucideIcon;
}

const CHIPS: readonly ChipSpec[] = [
  { key: 'microphone', label: 'Microphone', on: Mic, off: MicOff },
  { key: 'systemAudio', label: 'Son du système', on: Volume2, off: VolumeX },
  { key: 'screen', label: 'Écran', on: Monitor, off: MonitorOff },
];

interface SourceChipsProps {
  selection: SourceToggles;
  /** The system refuses the microphone: nothing the chip does could change that. */
  microphoneBlocked: boolean;
  /** A start is under way: the sources are locked. */
  disabled?: boolean;
  /** The island has no room for the legend: it stays for assistive technologies. */
  legendHidden?: boolean;
  onToggle(key: SourceKey): void;
}

export function SourceChips(props: SourceChipsProps) {
  const { selection, microphoneBlocked, disabled = false, onToggle } = props;
  return (
    <fieldset className="source-chips" disabled={disabled}>
      <legend className={props.legendHidden ? 'sr-only' : undefined}>Sources</legend>
      <div className="source-chips-row">
        {CHIPS.map(({ key, label, on, off }) => {
          const Icon = selection[key] ? on : off;
          return (
            <Chip
              key={key}
              size="md"
              pressed={selection[key]}
              disabled={key === 'microphone' && microphoneBlocked}
              onClick={() => onToggle(key)}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </Chip>
          );
        })}
      </div>
    </fieldset>
  );
}
