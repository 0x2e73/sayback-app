import { useState, type FormEvent } from 'react';
import { timeLabel } from '../../../shared/format';
import { Button } from '../../components/ui';
import { parseMoment } from './moment';

interface ClarificationFormProps {
  duration: number;
  /** Playback position when the form opened. */
  at: number;
  saving: boolean;
  /** Why the last save failed: shown under the text, which stays as typed. */
  submitError: string;
  onClose(): void;
  onSubmit(at: number, text: string): Promise<boolean>;
}

const ERROR_ID = 'clarification-moment-error';

export function ClarificationForm({
  duration,
  at,
  saving,
  submitError,
  onClose,
  onSubmit,
}: ClarificationFormProps) {
  const [text, setText] = useState('');
  const [moment, setMoment] = useState(() => timeLabel(Math.min(at, duration)));
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = parseMoment(moment, duration);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (await onSubmit(parsed.seconds, text)) onClose();
  }

  return (
    <form className="clarification-form" onSubmit={(event) => void submit(event)}>
      <p className="caption">
        Un « ça » un peu flou ? Revenez au passage et expliquez ce qu’il désigne.
      </p>
      <label className="field">
        Votre précision
        <textarea
          autoFocus
          rows={3}
          maxLength={2000}
          value={text}
          placeholder="Ex. On parle du bouton Exporter…"
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {submitError && (
        <p className="field-error" role="alert">
          {submitError}
        </p>
      )}
      <label className="field clarification-moment">
        Moment
        <input
          inputMode="numeric"
          placeholder="mm:ss"
          value={moment}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          onChange={(event) => {
            setMoment(event.target.value);
            setError('');
          }}
        />
      </label>
      {error && (
        <p id={ERROR_ID} className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="clarification-actions">
        <Button variant="ghost" disabled={saving} onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" variant="secondary" busy={saving} disabled={!text.trim()}>
          Ajouter
        </Button>
      </div>
    </form>
  );
}
