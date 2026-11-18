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
    // A shared CI runner is sometimes loaded enough to trip a timing; locally a failure stays one.
    retry: process.env.CI ? 2 : 0,
  },
});
