import { randomUUID } from 'node:crypto';
import type { Folder } from '../domain/folder';
import type { Meeting } from '../domain/meeting';
import type { FolderRepository, MeetingRepository } from './ports';

export class FolderService {
  constructor(
    private readonly folders: FolderRepository,
    private readonly meetings: MeetingRepository,
  ) {}

  list(): Folder[] {
    return this.folders.listFolders();
  }

  create(name: string): Folder {
    this.assertUnique(name);
    const folder = { id: randomUUID(), name, createdAt: new Date().toISOString() };
    this.folders.saveFolder(folder);
    return folder;
  }

  rename(id: string, name: string): Folder {
    const folder = this.requireFolder(id);
    this.assertUnique(name, id);
    const updated = { ...folder, name };
    this.folders.saveFolder(updated);
    return updated;
  }

  delete(id: string): void {
    this.requireFolder(id);
    if (
      this.meetings
        .list()
        .some(
          (meeting) =>
            meeting.folderId === id &&
            (meeting.status === 'recording' || meeting.status === 'processing'),
        )
    ) {
      throw new Error(
        'Attendez la fin de l’enregistrement ou de l’analyse avant de supprimer ce dossier.',
      );
    }
    this.folders.deleteFolder(id);
  }

  move(meetingId: string, folderId: string | null): Meeting {
    if (folderId) this.requireFolder(folderId);
    const meeting = this.meetings.get(meetingId);
    if (!meeting) throw new Error('Réunion introuvable.');
    if (meeting.status === 'recording' || meeting.status === 'processing') {
      throw new Error(
        'Attendez la fin de l’enregistrement ou de l’analyse avant de déplacer cette réunion.',
      );
    }
    const updated = { ...meeting, folderId };
    this.meetings.save(updated);
    return updated;
  }

  private requireFolder(id: string): Folder {
    const folder = this.folders.getFolder(id);
    if (!folder) throw new Error('Dossier introuvable.');
    return folder;
  }

  private assertUnique(name: string, exceptId?: string): void {
    if (
      this.list().some(
        (folder) =>
          folder.id !== exceptId && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      throw new Error('Un dossier porte déjà ce nom.');
    }
  }
}
