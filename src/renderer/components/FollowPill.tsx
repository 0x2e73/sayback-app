import { Button } from './Button';

interface FollowPillProps {
  label: string;
  onClick(): void;
}

/** Floats over a reading column to bring the reader back: « Revenir au direct », « Retour aux notes ». */
export function FollowPill({ label, onClick }: FollowPillProps) {
  return (
    <Button variant="secondary" shape="pill" className="follow-pill" onClick={onClick}>
      {label}
    </Button>
  );
}
