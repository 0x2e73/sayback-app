import type { RecordingState } from '../shared/recording-state';

export interface MenuBarActions {
  newRecording(): void;
  stopRecording(): void;
  open(): void;
  quit(): void;
}

export interface MenuBarEntry {
  label?: string;
  type?: 'separator';
  enabled?: boolean;
  click?: () => void;
}

function firstEntry(state: RecordingState, actions: MenuBarActions): MenuBarEntry {
  if (!state.recording) return { label: 'Nouvelle réunion…', click: actions.newRecording };
  if (state.stopping) return { label: 'Arrêt en cours…', enabled: false };
  return { label: 'Arrêter l’enregistrement', click: actions.stopRecording };
}

export function menuBarTemplate(state: RecordingState, actions: MenuBarActions): MenuBarEntry[] {
  return [
    firstEntry(state, actions),
    { label: 'Ouvrir SayBack', click: actions.open },
    { type: 'separator' },
    { label: 'Quitter SayBack', click: actions.quit },
  ];
}
