import { dialog } from 'electron';
import { MeetingExportFile } from '../backend/infrastructure/meeting-export-file';

export function createExportDestination(): MeetingExportFile {
  return new MeetingExportFile(async (filename) => {
    const result = await dialog.showSaveDialog({
      title: 'Exporter la réunion',
      defaultPath: filename,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    return result.canceled ? null : (result.filePath ?? null);
  });
}
