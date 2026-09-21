import type { FolderRepository, MeetingRepository } from '../application/ports';
import type { Meeting } from '../../shared/contracts';
import type { Folder } from '../domain/folder';
import { DatabaseSync } from 'node:sqlite';

export class SqliteMeetings implements MeetingRepository, FolderRepository {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL)',
    );
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, created_at TEXT NOT NULL)',
    );
  }
  list(): Meeting[] {
    return this.db
      .prepare('SELECT data FROM meetings ORDER BY created_at DESC')
      .all()
      .map((row) => JSON.parse(String(row.data)) as Meeting);
  }
  get(id: string): Meeting | undefined {
    const row = this.db.prepare('SELECT data FROM meetings WHERE id = ?').get(id);
    return row ? (JSON.parse(String(row.data)) as Meeting) : undefined;
  }
  save(meeting: Meeting): void {
    this.db
      .prepare(
        'INSERT INTO meetings (id, created_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      )
      .run(meeting.id, meeting.createdAt, JSON.stringify(meeting));
  }
  delete(id: string): void {
    this.db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
  }
  listFolders(): Folder[] {
    return this.db
      .prepare('SELECT id, name, created_at FROM folders ORDER BY created_at ASC')
      .all()
      .map((row) => ({
        id: String(row.id),
        name: String(row.name),
        createdAt: String(row.created_at),
      }));
  }
  getFolder(id: string): Folder | undefined {
    const row = this.db.prepare('SELECT id, name, created_at FROM folders WHERE id = ?').get(id);
    return row
      ? { id: String(row.id), name: String(row.name), createdAt: String(row.created_at) }
      : undefined;
  }
  saveFolder(folder: Folder): void {
    this.db
      .prepare(
        'INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name',
      )
      .run(folder.id, folder.name, folder.createdAt);
  }
  deleteFolder(id: string): void {
    this.db.exec('BEGIN');
    try {
      const affected = this.list().filter((meeting) => meeting.folderId === id);
      for (const meeting of affected) this.save({ ...meeting, folderId: null });
      this.db.prepare('DELETE FROM folders WHERE id = ?').run(id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close(): void {
    this.db.close();
  }
}
