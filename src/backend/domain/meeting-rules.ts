import type { Meeting } from './meeting';

export function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized || normalized.length > 160) {
    throw new Error('Donnez un titre de 1 à 160 caractères à cette réunion.');
  }
  return normalized;
}

export function assertRecording(meeting: Meeting): void {
  if (meeting.status !== 'recording') throw new Error('Cet enregistrement est terminé.');
}

export function assertEditable(meeting: Meeting): void {
  if (meeting.status === 'processing' || meeting.status === 'recording') {
    throw new Error('Une opération est en cours.');
  }
}

export function assertDuration(duration: number): void {
  if (!Number.isFinite(duration) || duration < 0 || duration > 7_205) {
    throw new Error('La durée de cette réunion est invalide.');
  }
}

export function validateClarification(meeting: Meeting, at: number, text: string): string {
  assertEditable(meeting);
  if (!Number.isFinite(at) || at < 0 || at > meeting.duration) {
    throw new Error('Choisissez un moment dans cette réunion.');
  }
  if (!text.trim() || text.length > 2_000) {
    throw new Error('Ajoutez une précision de 1 à 2 000 caractères.');
  }
  return text.trim();
}
