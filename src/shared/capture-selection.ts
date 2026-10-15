import type { CaptureSource } from './contracts';

export interface SourceToggles {
  microphone: boolean;
  systemAudio: boolean;
  screen: boolean;
}
export type SourceKey = keyof SourceToggles;

const months = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « Réunion du 5 mars, 9 h 05 » : le premier du mois s'écrit « 1er ». */
export function defaultMeetingTitle(date: Date): string {
  const day = date.getDate() === 1 ? '1er' : String(date.getDate());
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `Réunion du ${day} ${months[date.getMonth()]}, ${date.getHours()} h ${minutes}`;
}

/**
 * The system audio only exists attached to the screen capture. `changed` names the toggle the
 * user just flipped: asking for the system audio brings the screen back, anything else drops it.
 */
export function normalizeSelection(selection: SourceToggles, changed?: SourceKey): SourceToggles {
  if (!selection.systemAudio || selection.screen) return selection;
  if (changed === 'systemAudio') return { ...selection, screen: true };
  return { ...selection, systemAudio: false };
}

export function hasAudioSource(selection: SourceToggles): boolean {
  return selection.microphone || (selection.screen && selection.systemAudio);
}

type SourceRef = Pick<CaptureSource, 'id' | 'primary'>;

const isScreen = (source: SourceRef) => source.id.startsWith('screen:');

/** The remembered screen if it still exists, else the main one, else any screen, else any source. */
export function defaultScreenId(sources: readonly SourceRef[], rememberedId?: string): string {
  const screens = sources.filter(isScreen);
  const remembered = screens.find((source) => source.id === rememberedId);
  const main = screens.find((source) => source.primary);
  return (remembered ?? main ?? screens[0] ?? sources[0])?.id ?? '';
}
