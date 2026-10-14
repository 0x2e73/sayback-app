import type { ReactNode } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { Button } from './Button';

interface NoticeProps {
  children: ReactNode;
  tone?: 'danger' | 'warning' | 'info';
  retry?: () => void;
  action?: ReactNode;
  floating?: boolean;
}

export function Notice({
  children,
  tone = 'danger',
  retry,
  action,
  floating = false,
}: NoticeProps) {
  const Icon = tone === 'info' ? Info : AlertCircle;
  return (
    <div
      className={`notice notice-${tone}${floating ? ' notice-floating' : ''}`}
      role={tone === 'info' ? 'status' : 'alert'}
    >
      <Icon size={17} aria-hidden="true" />
      <span>{children}</span>
      {retry && (
        <Button variant="ghost" onClick={retry}>
          Réessayer
        </Button>
      )}
      {action}
    </div>
  );
}
