import { useRef, useState } from 'react';
import type { Folder } from '../../../shared/contracts';

interface FolderEditorActions {
  onCreate(name: string): Promise<Folder | null>;
  onRename(id: string, name: string): Promise<boolean>;
}

export function useFolderEditor({ onCreate, onRename }: FolderEditorActions) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  function startCreate(): void {
    setEditingId('new');
    setName('');
    setError('');
  }

  function startRename(folder: Folder): void {
    setEditingId(folder.id);
    setName(folder.name);
    setError('');
  }

  function rename(next: string): void {
    setName(next);
    setError('');
  }

  async function submit(): Promise<void> {
    const trimmed = name.trim();
    if (submitting.current) return;
    if (!trimmed) {
      setError('Donnez un nom au dossier.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const saved =
        editingId === 'new' ? await onCreate(trimmed) : await onRename(editingId!, trimmed);
      if (saved) {
        setEditingId(null);
        setName('');
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return {
    editing: editingId !== null,
    editingId,
    name,
    busy,
    error,
    setName: rename,
    startCreate,
    startRename,
    cancel: () => setEditingId(null),
    submit,
  };
}
