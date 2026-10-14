import { describe, expect, it } from 'vitest';
import { LOCAL_UPDATE_CHANNEL_ENV } from '../src/shared/update-channel';
import { createBuildInfo } from './build-identity';

const base = { version: '0.1.0', commit: 'a'.repeat(40), builtAt: '2026-10-14T10:00:00.000Z' };

describe('createBuildInfo', () => {
  it('sans variable : canal local fermé', () => {
    expect(createBuildInfo({ ...base, env: {} }).localUpdateChannel).toBe(false);
  });

  it('avec la variable à 1 : canal local ouvert', () => {
    const env = { [LOCAL_UPDATE_CHANNEL_ENV]: '1' };
    expect(createBuildInfo({ ...base, env })).toEqual({ ...base, localUpdateChannel: true });
  });

  it.each(['0', 'true', 'oui', ''])('toute autre valeur (%j) le laisse fermé', (value) => {
    const env = { [LOCAL_UPDATE_CHANNEL_ENV]: value };
    expect(createBuildInfo({ ...base, env }).localUpdateChannel).toBe(false);
  });

  it('une identité que l’app refuserait n’est pas produite', () => {
    expect(() => createBuildInfo({ ...base, version: undefined, env: {} })).toThrow();
  });
});
