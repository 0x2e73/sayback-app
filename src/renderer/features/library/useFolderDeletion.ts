import { useState } from 'react';
import type { Folder } from '../../../shared/contracts';

export function useFolderDeletion(onDelete: (id: string) => Promise<boolean>) {
  const [confirming, setConfirming] = useState<Folder | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirm(folder: Folder): Promise<void> {
    setDeleting(true);
    try {
      await onDelete(folder.id);
    } finally {
      setDeleting(false);
      setConfirming(null);
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
