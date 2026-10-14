import { LibraryBig, Settings2 } from 'lucide-react';

export type WorkspaceSection = 'library' | 'settings';
interface SidebarProps {
  section: WorkspaceSection;
  count: number;
  locked: boolean;
  onNavigate(section: WorkspaceSection): void;
}

export function Sidebar({ section, count, locked, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="window-band" aria-hidden="true" />
      <nav aria-label="Navigation principale">
        <button
          className={`nav-item ${section === 'library' ? 'active' : ''}`}
          disabled={locked}
          onClick={() => onNavigate('library')}
        >
          <LibraryBig size={18} />
          Mes réunions<span className="nav-count">{count}</span>
        </button>
        <button
          className={`nav-item ${section === 'settings' ? 'active' : ''}`}
          disabled={locked}
          onClick={() => onNavigate('settings')}
        >
          <Settings2 size={18} />
          Paramètres
        </button>
      </nav>
    </aside>
  );
}
