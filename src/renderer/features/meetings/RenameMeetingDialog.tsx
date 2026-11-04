import { useRef } from 'react';
import { Button, Dialog, Notice } from '../../components/ui';
import type { useMeetingTitle } from './use-meeting-title';

export function RenameMeetingDialog({ actions }: { actions: ReturnType<typeof useMeetingTitle> }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      title="Renommer la réunion"
      open={actions.open}
      busy={actions.busy}
      onClose={actions.close}
      initialFocus={input}
      footer={
        <>
          <Button variant="secondary" onClick={actions.close} disabled={actions.busy}>
            Annuler
          </Button>
          <Button
            type="submit"
            form="rename-meeting"
            disabled={!actions.changed}
            busy={actions.busy}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <form
        id="rename-meeting"
        onSubmit={(event) => {
          event.preventDefault();
          void actions.save();
        }}
      >
        {actions.error && <Notice>{actions.error}</Notice>}
        <label className="field">
          Titre de la réunion
          <input
            ref={input}
            value={actions.title}
            maxLength={160}
            required
            disabled={actions.busy}
            onChange={(event) => actions.setTitle(event.target.value)}
            onFocus={(event) => event.target.select()}
          />
        </label>
      </form>
    </Dialog>
  );
}
