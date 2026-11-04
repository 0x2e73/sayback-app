import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { SqliteMeetings } from '../infrastructure/sqlite-meetings';
import { MeetingExportFile } from '../infrastructure/meeting-export-file';
import { MeetingService } from './meetings';
import { MeetingExportService } from './meeting-export';

it('exports the persisted transcript and notes to the chosen file, including the last passage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sayback-export-'));
  const repository = new SqliteMeetings(join(root, 'meetings.sqlite'));
  try {
    const meetings = new MeetingService(repository, {
      transcribe: async () => [
        { id: '0-0', start: 0, end: 1, text: 'Début.' },
        { id: '0-1', start: 59, end: 60, text: 'Dernière phrase.', speaker: 'A' },
      ],
      summarize: async () => ({
        summary: 'Résumé IA.',
        keyPoints: [],
        decisions: [],
        actions: [],
        questions: [],
      }),
    });
    const meeting = meetings.create('Projet / été');
    meetings.addAudio(meeting.id, 0, 0, 60);
    meetings.finish(meeting.id, 60);
    await meetings.process(meeting.id);
    meetings.clarify(meeting.id, 10, 'Précision humaine.');
    const choose = vi.fn(async (name: string) => join(root, name));
    const exports = new MeetingExportService(meetings, new MeetingExportFile(choose));
    for (const kind of ['complete', 'transcript', 'notes'] as const) {
      expect(await exports.save(meeting.id, kind)).toBe(true);
      const name = choose.mock.calls.at(-1)![0];
      expect(name).not.toContain('/');
      const content = await readFile(join(root, name), 'utf8');
      expect(content).toContain('# Projet / été');
      if (kind !== 'notes')
        expect(content).toContain('[00:59] Intervenant A (partie 1) : Dernière phrase.');
      else expect(content).not.toContain('Dernière phrase.');
      if (kind !== 'transcript') {
        expect(content).toContain('Résumé IA.');
        expect(content).toContain('Précision humaine.');
      } else expect(content).not.toContain('Résumé IA.');
    }
    expect(
      await new MeetingExportService(meetings, new MeetingExportFile(async () => null)).save(
        meeting.id,
        'complete',
      ),
    ).toBe(false);
    await expect(
      new MeetingExportService(
        meetings,
        new MeetingExportFile(async () => join(root, 'missing', 'file.md')),
      ).save(meeting.id, 'complete'),
    ).rejects.toThrow(/emplacement/);
    const empty = meetings.create('Vide');
    await expect(exports.save(empty.id, 'complete')).rejects.toThrow(/cours/);
    meetings.finish(empty.id, 0);
    await expect(exports.save(empty.id, 'complete')).rejects.toThrow(/Aucun contenu/);
  } finally {
    repository.close();
    await rm(root, { recursive: true, force: true });
  }
});
