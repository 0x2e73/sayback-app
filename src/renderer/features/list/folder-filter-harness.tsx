import { useState } from 'react';
import { vi } from 'vitest';
import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import type { Folder, Meeting } from '../../../shared/contracts';
import { FolderFilter } from './FolderFilter';
import { ALL_MEETINGS, resolveScope, type FolderScope } from './list-filter';
import type { FolderActions } from './use-folders';

export const acme: Folder = { id: 'folder', name: 'Acme', createdAt: '' };
export function actionsWith(overrides: Partial<FolderActions> = {}): FolderActions {
  return {
    create: vi.fn(async () => null),
    rename: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    move: vi.fn(async () => true),
    ...overrides,
  };
}

interface HarnessProps {
  folders: Folder[];
  meetings?: Meeting[];
  actions: FolderActions;
}

export function Harness({ folders, meetings = [], actions }: HarnessProps) {
  const [scope, setScope] = useState<FolderScope>(ALL_MEETINGS);
  return (
    <FolderFilter
      folders={folders}
      meetings={meetings}
      scope={resolveScope(scope, folders)}
      locked={false}
      actions={actions}
      onScope={setScope}
    />
  );
}

export async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name }));
  await user.click(screen.getByRole('button', { name }));
}
