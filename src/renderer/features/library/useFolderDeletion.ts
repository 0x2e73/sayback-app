import { useState } from 'react';
import type { Folder } from '../../../shared/contracts';

export function useFolderDeletion(onDelete: (id: string) => Promise<boolean>) {
  const [confirming, setConfirming] = useState<Folder | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirm(folder: Folder): Promise<boolean> {
    setDeleting(true);
    try {
      const deleted = await onDelete(folder.id);
      if (deleted) setConfirming(null);
      return deleted;
    } finally {
      setDeleting(false);
    }
  }

  return {
    confirming,
    deleting,
    request: setConfirming,
    cancel: () => setConfirming(null),
    confirm,
  };
}
