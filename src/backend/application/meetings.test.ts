import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MeetingService } from './meetings';
import { SqliteMeetings } from '../infrastructure/sqlite-meetings';
import type { Intelligence } from './ports';
import type { Notes } from '../../shared/contracts';

const notes: Notes = {
  summary: 'Réunion produit',
  keyPoints: [{ text: 'Simplifier le formulaire', sourceIds: ['0-0'] }],
  decisions: [],
  actions: [],
  questions: [],
};
let path: string;
let repository: SqliteMeetings;
let service: MeetingService;
let ai: Intelligence;
beforeEach(() => {
  path = mkdtempSync(join(tmpdir(), 'voice-meets-'));
  repository = new SqliteMeetings(join(path, 'meetings.sqlite'));
  ai = {
    transcribe: async () => [{ id: '0-0', start: 0, end: 3, text: 'Simplifions le formulaire.' }],
    summarize: async () => notes,
  };
  service = new MeetingService(repository, ai);
});
afterEach(() => {
  repository.close();
  rmSync(path, { recursive: true, force: true });
});

function recorded() {
  const meeting = service.create('  Revue produit  ');
  service.addAudio(meeting.id, 0, 0, 12);
  return service.finish(meeting.id, 12);
}

describe('Meeting lifecycle', () => {
  it('persists a trimmed title across database reopen', () => {
    const meeting = service.create('  Revue produit  ');
    repository.close();
    repository = new SqliteMeetings(join(path, 'meetings.sqlite'));
    expect(repository.get(meeting.id)?.title).toBe('Revue produit');
    expect(repository.list()).toHaveLength(1);
  });
  it('rejects a blank title', () => {
    expect(() => service.create('  ')).toThrow(/titre/i);
  });
  it('keeps a recording retryable when transcription fails', async () => {
    const meeting = recorded();
    ai.transcribe = async () => {
      throw new Error('Connexion interrompue');
    };
    await expect(service.process(meeting.id)).rejects.toThrow('Connexion interrompue');
    expect(service.get(meeting.id)).toMatchObject({ status: 'error', audioChunks: [{ index: 0 }] });
  });
  it('checkpoints transcription so summary retries do not transcribe again', async () => {
    const meeting = recorded();
    ai.summarize = async () => {
      throw new Error('Serveur indisponible');
    };
    await expect(service.process(meeting.id)).rejects.toThrow();
    ai.transcribe = async () => {
      throw new Error('Must reuse saved transcript');
    };
    ai.summarize = async () => notes;
    const result = await service.process(meeting.id);
    expect(result.status).toBe('ready');
    expect(result.transcript[0]?.text).toBe('Simplifions le formulaire.');
    expect(result.notes).toEqual(notes);
  });
  it('transcribes long recordings in bounded parallel batches', async () => {
    const meeting = service.create('Réunion longue');
    for (let index = 0; index < 4; index += 1) service.addAudio(meeting.id, index, index * 60, 60);
    service.finish(meeting.id, 240);
    let active = 0;
    let maximum = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    ai.transcribe = async (_id, chunk) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await gate;
      active -= 1;
      return [{ id: `${chunk.index}-0`, start: chunk.start, end: chunk.start + 1, text: 'Oui' }];
    };
    const processing = service.process(meeting.id);
    expect(active).toBe(3);
    release();
    await processing;
    expect(maximum).toBe(3);
    expect(service.get(meeting.id).transcript).toHaveLength(4);
  });
  it('preserves source text and human clarification during regeneration', async () => {
    const meeting = recorded();
    await service.process(meeting.id);
    service.clarify(meeting.id, 2, 'Le formulaire de contact.');
    ai.summarize = async (input) => ({ ...notes, summary: input.clarifications[0]?.text ?? '' });
    const result = await service.process(meeting.id);
    expect(result.notes?.summary).toBe('Le formulaire de contact.');
    expect(result.transcript[0]?.text).toBe('Simplifions le formulaire.');
    expect(result.clarifications[0]?.at).toBe(2);
  });
  it('rejects clarification timestamps outside the session', () => {
    const meeting = recorded();
    expect(() => service.clarify(meeting.id, 99, 'Texte')).toThrow(/moment/i);
  });
  it('refuses concurrent analysis and recording mutation during processing', async () => {
    const meeting = recorded();
    let release!: () => void;
    ai.summarize = async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return notes;
    };
    const first = service.process(meeting.id);
    await expect(service.process(meeting.id)).rejects.toThrow(/cours/i);
    expect(() => service.clarify(meeting.id, 1, 'Texte')).toThrow(/cours/i);
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    await first;
  });
  it('recovers an interrupted recording without discarding saved audio', () => {
    const meeting = service.create('Interrompue');
    service.addAudio(meeting.id, 0, 0, 60);
    service.recover();
    expect(service.get(meeting.id)).toMatchObject({ status: 'recorded', duration: 60 });
  });
  it('rejects an analysis without audio', async () => {
    const meeting = service.create('Vide');
    service.finish(meeting.id, 0);
    await expect(service.process(meeting.id)).rejects.toThrow(/audio/i);
  });
});
