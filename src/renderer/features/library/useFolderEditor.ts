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
  const submitting = useRef(false);

  function startCreate(): void {
    setEditingId('new');
    setName('');
  }

  function startRename(folder: Folder): void {
    setEditingId(folder.id);
    setName(folder.name);
  }

  async function submit(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed || submitting.current) return;
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
    name,
    busy,
    setName,
    startCreate,
    startRename,
    cancel: () => setEditingId(null),
    submit,
  };
}
