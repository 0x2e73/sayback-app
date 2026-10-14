import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
}

export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className="empty-message">
      <p className="empty-message-title">{title}</p>
      {children}
    </div>
  );
}
