export function timeLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const remainder = (total % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur est survenue. Réessayez.';
}
