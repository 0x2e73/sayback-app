import React from 'react';
import { createRoot } from 'react-dom/client';
import type { DesktopApi } from '../shared/contracts';
import { App } from './App';
import { platformOf } from './platform';
import './styles.css';
import './styles/shared.css';
import './styles/chip.css';
import './styles/switch.css';
import './styles/skeleton.css';
import './styles/source-picker.css';
import './styles/empty-state.css';
import './styles/error-fallback.css';
import './styles/meeting-list.css';
import './styles/folder-filter.css';
import './styles/list-pane.css';
import './styles/meetings.css';
import './styles/segmented.css';
import './styles/meeting-detail.css';
import './styles/meeting-notes.css';
import './styles/playback-bar.css';
import './styles/recording.css';
import './styles/model-select.css';
import './styles/onboarding.css';

declare global {
  interface Window {
    sayBack?: DesktopApi;
  }
}
document.documentElement.dataset.platform = platformOf(navigator.platform);
const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    {window.sayBack ? (
      <App api={window.sayBack} />
    ) : (
      <div className="desktop-required">
        <div className="window-band window-band-fixed" aria-hidden="true" />
        <h1>SayBack</h1>
        <p>Ouvrez l’application desktop pour enregistrer vos réunions.</p>
        <code>npm run dev</code>
      </div>
    )}
  </React.StrictMode>,
);
