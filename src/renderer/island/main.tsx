import React from 'react';
import { createRoot } from 'react-dom/client';
import type { IslandApi } from '../../shared/contracts';
import { IslandApp } from './IslandApp';
import '../styles.css';
import '../styles/shared.css';
import '../styles/chip.css';
import '../styles/source-picker.css';
import '../styles/island.css';

declare global {
  interface Window {
    sayBackIsland?: IslandApi;
  }
}

// Without its preload the page has nothing to draw: the window stays transparent.
const api = window.sayBackIsland;
if (api) {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <IslandApp api={api} />
    </React.StrictMode>,
  );
}
