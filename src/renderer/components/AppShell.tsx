import type { ReactNode } from 'react';
import { Sidebar, type WorkspaceSection } from './Sidebar';

interface AppShellProps {
  section: WorkspaceSection;
  recording: boolean;
  count: number;
  onNavigate(section: WorkspaceSection): void;
  children: ReactNode;
}

export function AppShell(props: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar
        section={props.section}
        count={props.count}
        locked={props.recording}
        onNavigate={props.onNavigate}
      />
      <main className="main-card">
        <div className="window-band" aria-hidden="true" />
        <div className="page-content">{props.children}</div>
      </main>
    </div>
  );
}
