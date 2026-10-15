import { vi } from 'vitest';

/** jsdom has no `blob:` URLs nor image decoding: numbered URLs, and a decode that resolves. */
export function stubImageUrls() {
  let next = 0;
  const create = vi.fn(() => `blob:frame-${++next}`);
  const revoke = vi.fn();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  const decode = vi.fn(async () => undefined);
  HTMLImageElement.prototype.decode = decode;
  return { create, revoke, decode };
}
