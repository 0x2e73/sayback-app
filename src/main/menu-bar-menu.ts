export interface MenuBarActions {
  newRecording(): void;
  stopRecording(): void;
  open(): void;
  quit(): void;
}

export interface MenuBarEntry {
  label?: string;
  type?: 'separator';
  click?: () => void;
}

export function menuBarTemplate(recording: boolean, actions: MenuBarActions): MenuBarEntry[] {
  const first: MenuBarEntry = recording
    ? { label: 'Arrêter l’enregistrement', click: actions.stopRecording }
    : { label: 'Nouvel enregistrement…', click: actions.newRecording };
  return [
    first,
    { label: 'Ouvrir SayBack', click: actions.open },
    { type: 'separator' },
    { label: 'Quitter SayBack', click: actions.quit },
  ];
}

// mm:ss, then h:mm:ss from the first hour.
export function chronoLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = (total % 60).toString().padStart(2, '0');
  if (hours === 0) return `${minutes.toString().padStart(2, '0')}:${rest}`;
  return `${hours}:${minutes.toString().padStart(2, '0')}:${rest}`;
}
