import { expect, it } from 'vitest';
import { compatibleBaseUrl, isLocalCompatibleUrl } from './compatible-url';

it('allows HTTPS providers and local development endpoints', () => {
  expect(compatibleBaseUrl('https://openrouter.ai/api/v1/')).toBe('https://openrouter.ai/api/v1');
  expect(compatibleBaseUrl('http://127.0.0.1:1234/v1')).toBe('http://127.0.0.1:1234/v1');
  expect(isLocalCompatibleUrl('http://localhost:1234/v1')).toBe(true);
  expect(isLocalCompatibleUrl('https://openrouter.ai/api/v1')).toBe(false);
});

it('rejects insecure remote endpoints and embedded credentials', () => {
  expect(() => compatibleBaseUrl('http://api.example.com/v1')).toThrow(/HTTPS/);
  expect(() => compatibleBaseUrl('https://user:secret@api.example.com/v1')).toThrow(/HTTPS/);
});
