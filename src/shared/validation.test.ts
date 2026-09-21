import { describe, expect, it } from 'vitest';
import { setupGuideSchema, validateMedia } from './validation';

const upload = {
  meetingId: '92d679f6-f90c-41b4-9b3b-7c27b6cc8771',
  kind: 'audio',
  index: 0,
  at: 0,
  duration: 10,
  bytes: new ArrayBuffer(20),
};
describe('Media boundary', () => {
  it('accepts bounded media owned by a session ID', () => {
    expect(validateMedia(upload)).toMatchObject({ kind: 'audio', index: 0 });
  });
  it('rejects traversal and arbitrary media kinds', () => {
    expect(() => validateMedia({ ...upload, meetingId: '../../secrets' })).toThrow();
    expect(() => validateMedia({ ...upload, kind: 'config' })).toThrow();
  });
  it('rejects invalid timestamps and oversized audio chunks', () => {
    expect(() => validateMedia({ ...upload, at: -1 })).toThrow();
    expect(() => validateMedia({ ...upload, bytes: new ArrayBuffer(26 * 1024 * 1024) })).toThrow();
  });
});

it('only opens the known setup guides', () => {
  expect(setupGuideSchema.parse('ollama')).toBe('ollama');
  expect(() => setupGuideSchema.parse('https://example.com')).toThrow();
});
