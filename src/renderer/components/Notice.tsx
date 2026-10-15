import type { ReactNode } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { Button } from './Button';
import { Presence } from './Presence';
import type { PresenceBinding } from './use-presence';

interface NoticeProps {
  children: ReactNode;
  tone?: 'danger' | 'warning' | 'info';
  retry?: () => void;
  action?: ReactNode;
  floating?: boolean;
  presence?: PresenceBinding;
}

export function Notice({
  children,
  tone = 'danger',
  retry,
  action,
  floating = false,
  presence,
}: NoticeProps) {
  const Icon = tone === 'info' ? Info : AlertCircle;
  return (
    <div
      className={`notice notice-${tone}${floating ? ' notice-floating' : ''}`}
      ref={presence?.ref}
      data-state={presence?.state}
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

interface FloatingNoticeProps extends Omit<NoticeProps, 'floating' | 'presence'> {
  open: boolean;
}

/** The notice over the card: it rises in and leaves in a fade. */
export function FloatingNotice({ open, ...props }: FloatingNoticeProps) {
  return (
    <Presence open={open}>
      {(presence) => <Notice {...props} floating presence={presence} />}
    </Presence>
  );
}
