import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './Button';

interface NoticeProps {
  children: ReactNode;
  retry?: () => void;
}

export function Notice({ children, retry }: NoticeProps) {
  return (
    <div className="notice" role="alert">
      <AlertCircle size={17} />
      <span>{children}</span>
      {retry && (
        <Button variant="ghost" onClick={retry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
