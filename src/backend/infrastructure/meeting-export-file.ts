import { writeFile } from 'node:fs/promises';
import type { ExportDestination } from '../application/meeting-export';

export class MeetingExportFile implements ExportDestination {
  constructor(private readonly choosePath: (filename: string) => Promise<string | null>) {}

  async save(filename: string, content: string): Promise<boolean> {
    const path = await this.choosePath(filename);
    if (!path) return false;
    try {
      await writeFile(path, content, 'utf8');
      return true;
    } catch {
      throw new Error('Impossible d’enregistrer l’export. Choisissez un autre emplacement.');
    }
  }
}
