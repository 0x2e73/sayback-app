import { useState, type FormEvent } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { Button } from '../../components/ui';

interface ClarificationFormProps {
  duration: number;
  at: number;
  disabled: boolean;
  saving: boolean;
  onTime(at: number): void;
  onSubmit(at: number, text: string): Promise<boolean>;
}

export function ClarificationForm(props: ClarificationFormProps) {
  const [text, setText] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const saved = await props.onSubmit(props.at, text);
    if (saved) setText('');
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="clarification-form">
      <h3>
        <MessageSquarePlus size={17} />
        Apporter une précision
      </h3>
      <p className="caption">
        Un « ça » un peu flou ? Revenez au passage et expliquez ce qu’il désigne.
      </p>
      <label className="field">
        Moment (secondes)
        <input
          type="number"
          min={0}
          max={props.duration}
          step="0.1"
          value={Number(props.at.toFixed(1))}
          onChange={(event) => props.onTime(Number(event.target.value))}
        />
      </label>
      <label className="field">
        Votre précision
        <textarea
          rows={3}
          maxLength={2000}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ex. On parle du bouton Exporter…"
        />
      </label>
      <Button
        variant="secondary"
        type="submit"
        busy={props.saving}
        disabled={props.disabled || !text.trim()}
      >
        Ajouter la précision
      </Button>
    </form>
  );
}
