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
  let heading = 'Espace de travail';
  if (props.section === 'settings') heading = 'Préférences';
  if (props.recording) heading = 'Réunion en cours';

  return (
    <div className="app-shell">
      <Sidebar
        section={props.section}
        count={props.count}
        locked={props.recording}
        onNavigate={props.onNavigate}
      />
      <main className="main-content">
        <header className="topbar">
          <span>{heading}</span>
          <span className="topbar-note">
            <span className="status-dot" />
            En local
          </span>
        </header>
        <div className="page-content">{props.children}</div>
        <footer className="workspace-footer">
          Un peu moins à retenir. Un peu plus à partager.<span>SayBack</span>
        </footer>
      </main>
    </div>
  );
}
