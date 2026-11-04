export function partOf(id: string): number | null {
  const head = id.split('-')[0] ?? '';
  return /^\d+$/.test(head) ? Number(head) : null;
}
