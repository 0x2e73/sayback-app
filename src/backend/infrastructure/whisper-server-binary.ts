import { accessSync, constants, realpathSync, statSync } from 'node:fs';

/** Where Homebrew links the server; `PATH` is never searched. */
export const WHISPER_SERVER_LINKS = [
  '/opt/homebrew/bin/whisper-server',
  '/usr/local/bin/whisper-server',
];
// The formula and its Cellar folder are `whisper.cpp`; `whisper-cpp` is its alias.
export const WHISPER_CELLARS = [
  '/opt/homebrew/Cellar/whisper.cpp/',
  '/opt/homebrew/Cellar/whisper-cpp/',
  '/usr/local/Cellar/whisper.cpp/',
  '/usr/local/Cellar/whisper-cpp/',
];

function isExecutableFile(path: string): boolean {
  if (!statSync(path).isFile()) return false;
  accessSync(path, constants.X_OK);
  return true;
}

/**
 * The real path of the Homebrew `whisper-server`, only when it resolves inside a whisper.cpp
 * Cellar and is a regular executable file. The resolved path is what gets spawned, so the link
 * cannot be swapped between the check and the launch.
 */
export function trustedWhisperServer(
  links: readonly string[] = WHISPER_SERVER_LINKS,
  cellars: readonly string[] = WHISPER_CELLARS,
): string | undefined {
  for (const link of links) {
    try {
      const real = realpathSync(link);
      if (cellars.some((cellar) => real.startsWith(cellar)) && isExecutableFile(real)) return real;
    } catch {
      // Missing, unreadable or not executable: try the next prefix.
    }
  }
  return undefined;
}
