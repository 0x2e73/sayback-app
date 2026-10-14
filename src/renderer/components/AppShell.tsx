import type { ReactNode } from 'react';

const CARD_CONTENT_ID = 'card-content';

/** Moves the keyboard into the right card, where the recording screen lives. */
export function focusCardContent(): void {
  document.getElementById(CARD_CONTENT_ID)?.focus();
}

interface AppShellProps {
  pane: ReactNode;
  notice?: ReactNode;
  children: ReactNode;
}

export function AppShell({ pane, notice, children }: AppShellProps) {
  return (
    <div className="app-shell">
      {pane}
      <main className="main-card">
        <div className="window-band" aria-hidden="true" />
        <div className="page-content" id={CARD_CONTENT_ID} tabIndex={-1}>
          {children}
        </div>
        {notice}
      </main>
    </div>
  );
}
