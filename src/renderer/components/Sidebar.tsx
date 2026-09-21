import { LibraryBig, LockKeyhole, Settings2 } from 'lucide-react';
import logo from '../assets/sayback-mark.svg';

export type WorkspaceSection = 'library' | 'settings';
interface SidebarProps {
  section: WorkspaceSection;
  count: number;
  locked: boolean;
  onNavigate(section: WorkspaceSection): void;
}

function LocalStorageCard() {
  return (
    <div className="sidebar-bottom">
      <div className="local-card">
        <span className="local-icon">
          <LockKeyhole size={17} />
        </span>
        <div>
          <strong>Votre mémoire, chez vous.</strong>
          <p>Vos réunions sont sauvegardées sur cet ordinateur.</p>
        </div>
      </div>
      <div className="version">
        <span className="status-dot" />
        Espace local<span>v0.1</span>
      </div>
    </div>
  );
}

export function Sidebar({ section, count, locked, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <img src={logo} alt="" />
        </span>
        <span>
          Say<span className="brand-light">Back</span>
          <span className="brand-dot">.</span>
        </span>
      </div>
      <div className="workspace-label">Votre espace personnel</div>
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
      <LocalStorageCard />
    </aside>
  );
}
