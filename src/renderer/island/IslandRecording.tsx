import type { IslandApi } from '../../shared/contracts';
import type { IslandRequest, IslandScreen } from '../../shared/island';
import type { RecordingState } from '../../shared/recording-state';
import { LevelMeter } from '../components/ui';
import { IslandOpen } from './IslandOpen';
import { PickerSwap } from './PickerSwap';
import { RecordingScene } from './RecordingScene';
import { ScreenPicker } from './ScreenPicker';
import { ScreenSwitchControl } from './ScreenSwitchControl';
import { useChrono, type Clock } from './use-island';
import { useLiveText } from './use-live-text';
import { useScreenPicker } from './use-screen-picker';
import { useScreenSwitch } from './use-screen-switch';

interface IslandRecordingProps {
  api: IslandApi;
  recording: RecordingState;
  /** The screens the capture may switch to. */
  screens: readonly IslandScreen[];
  receivedAt: number;
  expanded: boolean;
  now: Clock;
  onRequest(request: IslandRequest): void;
}

/** The wings around the notch, and the panel they open into. */
export function IslandRecording(props: IslandRecordingProps) {
  const { api, recording, screens, expanded } = props;
  const chrono = useChrono(recording, props.receivedAt, props.now);
  const paused = recording.recording && recording.paused;
  const stopping = recording.recording && recording.stopping;
  const source = recording.recording ? recording.sourceId : undefined;
  const live = useLiveText(api);
  const switching = useScreenSwitch(api, source);
  const offered = source !== undefined && screens.length >= 2;
  // Folding the island, stopping the recording or a screen going closes the picker.
  const picker = useScreenPicker({
    active: expanded && !stopping && offered,
    current: source ?? null,
    onPick: switching.pick,
  });
  return (
    <>
      <div className="island-compact" aria-hidden="true">
        <span className="island-wing">
          <span className="island-dot" />
          <LevelMeter feed={api} bars={4} />
        </span>
        <span />
        <span className="island-wing island-wing-end">
          <span className="island-chrono island-chrono-compact">{chrono}</span>
        </span>
      </div>
      <IslandOpen
        expanded={expanded}
        chrono={chrono}
        paused={paused}
        stopping={stopping}
        onRequest={props.onRequest}
        scene={
          <PickerSwap
            open={picker.open}
            instant={picker.instant}
            base={
              <RecordingScene
                api={api}
                source={source}
                live={live}
                paused={paused}
                expanded={expanded}
              />
            }
            picker={
              <ScreenPicker
                api={api}
                screens={screens}
                checked={picker.checked}
                disabled={stopping || switching.pending}
                keyboard={false}
                onPick={picker.pick}
                onBack={picker.close}
              />
            }
          />
        }
        switchControl={
          <ScreenSwitchControl
            offered={offered}
            open={picker.open}
            failed={switching.failed}
            disabled={stopping || switching.pending}
            onToggle={() => picker.toggle()}
          />
        }
      />
    </>
  );
}
