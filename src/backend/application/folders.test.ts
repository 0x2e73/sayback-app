import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FolderService } from './folders';
import { MeetingService } from './meetings';
import { SqliteMeetings } from '../infrastructure/sqlite-meetings';

let root: string;
let repository: SqliteMeetings;
let folders: FolderService;
let meetings: MeetingService;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sayback-folders-'));
  repository = new SqliteMeetings(join(root, 'meetings.sqlite'));
  folders = new FolderService(repository, repository);
  meetings = new MeetingService(repository, {
    transcribe: async () => [],
    summarize: async () => {
      throw new Error('Not used');
    },
  });
});

afterEach(() => {
  repository.close();
  rmSync(root, { recursive: true, force: true });
});

it('creates, renames and persists folders with their meetings', () => {
  const folder = folders.create('Produit');
  const meeting = meetings.create('Revue');
  meetings.finish(meeting.id, 10);
  expect(folders.move(meeting.id, folder.id).folderId).toBe(folder.id);
  expect(() => folders.create('produit')).toThrow(/déjà/);
  expect(folders.rename(folder.id, 'Équipe').name).toBe('Équipe');
  repository.close();
  repository = new SqliteMeetings(join(root, 'meetings.sqlite'));
  folders = new FolderService(repository, repository);
  expect(folders.list()).toMatchObject([{ name: 'Équipe' }]);
  expect(repository.get(meeting.id)?.folderId).toBe(folder.id);
});

it('moves meetings back to the library when deleting a folder', () => {
  const folder = folders.create('Projet');
  const meeting = meetings.create('Point hebdo');
  meetings.finish(meeting.id, 10);
  folders.move(meeting.id, folder.id);
  folders.delete(folder.id);
  expect(repository.get(meeting.id)?.folderId).toBeNull();
  expect(folders.list()).toEqual([]);
});

it('refuses a move to a missing folder without changing the meeting', () => {
  const meeting = meetings.create('Point hebdo');
  expect(() => folders.move(meeting.id, 'missing')).toThrow(/introuvable/);
  expect(repository.get(meeting.id)?.folderId).toBeUndefined();
});

it('prevents moving active meetings or deleting their folder', () => {
  const folder = folders.create('En cours');
  const meeting = meetings.create('Direct');
  expect(() => folders.move(meeting.id, folder.id)).toThrow(/Attendez/);
  meetings.finish(meeting.id, 10);
  folders.move(meeting.id, folder.id);
  repository.save({ ...meetings.get(meeting.id), status: 'processing' });
  expect(() => folders.delete(folder.id)).toThrow(/Attendez/);
  expect(folders.list()).toHaveLength(1);
});
