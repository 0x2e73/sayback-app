import { useCallback, useEffect, useState } from 'react';
import { unwrap, type DesktopApi, type Folder, type Meeting } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';

export interface FolderActions {
  create(name: string): Promise<Folder | null>;
  rename(id: string, name: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  move(meetingId: string, folderId: string | null): Promise<boolean>;
}

export function useFolders(
  api: DesktopApi,
  onMove: (meeting: Meeting) => void,
  onDelete: () => void,
) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setFolders(unwrap(await api.listFolders()));
      setError('');
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create(name: string): Promise<Folder | null> {
    try {
      const folder = unwrap(await api.createFolder(name));
      setFolders((current) => [...current, folder]);
      setError('');
      return folder;
    } catch (failure) {
      setError(errorMessage(failure));
      return null;
    }
  }

  async function rename(id: string, name: string): Promise<boolean> {
    try {
      const updated = unwrap(await api.renameFolder(id, name));
      setFolders((current) => current.map((folder) => (folder.id === id ? updated : folder)));
      setError('');
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      unwrap(await api.deleteFolder(id));
      setFolders((current) => current.filter((folder) => folder.id !== id));
      onDelete();
      setError('');
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    }
  }

  async function move(meetingId: string, folderId: string | null): Promise<boolean> {
    try {
      onMove(unwrap(await api.moveMeeting(meetingId, folderId)));
      setError('');
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    }
  }

  return { folders, error, refresh, create, rename, remove, move };
}
