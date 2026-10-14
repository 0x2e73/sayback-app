import type { FormEvent, KeyboardEvent } from 'react';

interface FolderNameFieldProps {
  name: string;
  busy: boolean;
  onName(name: string): void;
  onSave(): void;
  onCancel(): void;
}

// Enter saves, Escape cancels. Leaving a filled field keeps it: committing on blur would
// also fire when the field unmounts after Enter, and create the folder twice.
export function FolderNameField({ name, busy, onName, onSave, onCancel }: FolderNameFieldProps) {
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSave();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onCancel();
  }

  return (
    <form className="folder-name-field" onSubmit={submit}>
      <input
        autoFocus
        className="field-control"
        aria-label="Nom du dossier"
        placeholder="Nom du dossier"
        maxLength={80}
        value={name}
        readOnly={busy}
        onChange={(event) => onName(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!name.trim()) onCancel();
        }}
      />
    </form>
  );
}
