import { fileURLToPath } from 'node:url';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

// The dev server needs its socket; the packaged island page connects to nothing.
const islandCspForBuild: Plugin = {
  name: 'island-csp-without-dev-socket',
  apply: 'build',
  transformIndexHtml: {
    order: 'pre',
    handler: (html, context) =>
      context.filename.endsWith('island.html') ? html.replace(' ws://localhost:*', '') : html,
  },
};

// One preload and one page per window: the main window and the island under the notch.
export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: path('./src/preload/index.ts'),
          island: path('./src/preload/island.ts'),
        },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [react(), islandCspForBuild],
    build: {
      rollupOptions: {
        input: {
          index: path('./src/renderer/index.html'),
          island: path('./src/renderer/island.html'),
        },
      },
    },
  },
});
