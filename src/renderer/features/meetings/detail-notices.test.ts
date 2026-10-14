import { describe, expect, it } from 'vitest';
import { detailNotices } from './detail-notices';

const reason = 'Aucune parole détectée dans cet enregistrement.';
const settingsError = 'Configurez la transcription et le compte rendu dans les paramètres.';
const band = {
  key: 'analysis',
  tone: 'warning',
  message: 'L’analyse n’a pas abouti.',
  detail: reason,
  retry: true,
};

describe('detailNotices', () => {
  it('shows nothing for a quiet meeting', () => {
    expect(detailNotices({ status: 'ready', error: null }, '', false)).toEqual([]);
  });

  it('reports a failed action', () => {
    expect(detailNotices({ status: 'recorded', error: null }, settingsError, false)).toEqual([
      { key: 'action', tone: 'danger', message: settingsError, detail: null, retry: false },
    ]);
  });

  it('turns a failed analysis into one amber band with its reason and a retry', () => {
    expect(detailNotices({ status: 'error', error: reason }, '', false)).toEqual([band]);
  });

  it('says a failed retry once', () => {
    expect(detailNotices({ status: 'error', error: reason }, reason, false)).toEqual([band]);
  });

  it('keeps a different action error next to the band', () => {
    expect(detailNotices({ status: 'error', error: reason }, settingsError, false)).toEqual([
      { key: 'action', tone: 'danger', message: settingsError, detail: null, retry: false },
      band,
    ]);
  });

  it('keeps the message of an interrupted session', () => {
    const error = 'Session interrompue. Les fichiers sauvegardés sont conservés.';
    expect(detailNotices({ status: 'recorded', error }, '', false)).toEqual([
      { key: 'meeting', tone: 'warning', message: error, detail: null, retry: false },
    ]);
  });

  it('says nothing about the last failure while the analysis runs again', () => {
    expect(detailNotices({ status: 'error', error: reason }, '', true)).toEqual([]);
  });
});
