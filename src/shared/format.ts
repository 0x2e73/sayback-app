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

/** Recording timer: mm:ss, then h:mm:ss from the first hour. */
export function chronoLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = (total % 60).toString().padStart(2, '0');
  if (hours === 0) return `${minutes.toString().padStart(2, '0')}:${rest}`;
  return `${hours}:${minutes.toString().padStart(2, '0')}:${rest}`;
}
