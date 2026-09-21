import type { LocalSetupStatus, SetupGuide } from '../../../shared/contracts';

export interface MissingItem {
  label: string;
  guide: SetupGuide;
}

export function missingItems(status: LocalSetupStatus): MissingItem[] {
  const items: MissingItem[] = [];
  if (!status.whisperCli) items.push({ label: 'whisper-cli est absent', guide: 'whisper' });
  if (!status.ffmpeg) items.push({ label: 'ffmpeg est absent', guide: 'whisper' });
  if (!status.whisperModel) {
    items.push({ label: 'Aucun modèle Whisper trouvé', guide: 'whisper' });
  }
  if (!status.ollama) {
    items.push({ label: 'Ollama n’est pas démarré', guide: 'ollama' });
    return items;
  }
  if (!status.notesModel) {
    items.push({
      label: `Le modèle ${status.notesModelName} n’est pas installé dans Ollama`,
      guide: 'ollama',
    });
  }
  return items;
}

export function guidesFor(items: MissingItem[]): SetupGuide[] {
  return [...new Set(items.map((item) => item.guide))];
}
