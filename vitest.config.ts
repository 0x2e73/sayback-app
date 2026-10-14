import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Date groups and row dates follow local time: pin the zone so every machine runs the same cases.
process.env.TZ = 'Europe/Zurich';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/renderer/test-setup.ts'],
  },
});
