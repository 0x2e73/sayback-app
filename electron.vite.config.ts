import { fileURLToPath } from 'node:url';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

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
    plugins: [react()],
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
