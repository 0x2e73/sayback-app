import { describe, expect, it } from 'vitest';
import { isNewer } from './update';

const current = { commit: 'a'.repeat(40), builtAt: '2026-10-13T10:00:00.000Z' };
const otherCommit = 'b'.repeat(40);

describe('isNewer', () => {
  it('il faut les deux : un autre commit ET une date de construction plus récente', () => {
    expect(isNewer({ commit: otherCommit, builtAt: '2026-10-13T12:00:00.000Z' }, current)).toBe(
      true,
    );
    expect(isNewer({ commit: current.commit, builtAt: '2026-10-13T12:00:00.000Z' }, current)).toBe(
      false,
    );
    expect(isNewer({ commit: otherCommit, builtAt: '2026-10-13T08:00:00.000Z' }, current)).toBe(
      false,
    );
    expect(isNewer({ commit: otherCommit, builtAt: current.builtAt }, current)).toBe(false);
  });

  it('une date illisible du build en cours ne rend pas tout « plus récent »', () => {
    const unreadable = { commit: current.commit, builtAt: 'inconnue' };
    expect(isNewer({ commit: otherCommit, builtAt: '2026-10-13T12:00:00.000Z' }, unreadable)).toBe(
      false,
    );
  });
});
