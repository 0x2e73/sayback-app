export function compatibleBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Indiquez une URL valide pour l’API compatible.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Utilisez une URL HTTPS, ou HTTP uniquement sur cet ordinateur.');
  }
  return url.toString().replace(/\/$/, '');
}

export function isLocalCompatibleUrl(value: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(compatibleBaseUrl(value)).hostname);
  } catch {
    return false;
  }
}
