import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { findBuiltApp } from './built-app.ts';

// `npm run dist`, after `npm run package`: on macOS, the dmg is made from the bundle already built
// and signed by `local-signing-cli.ts`, so it keeps the signature that macOS permissions follow.
// electron-builder does not sign it again (`mac.identity: null`). Elsewhere, a regular build.

const ROOT = join(import.meta.dirname, '..');
const run = promisify(execFile);

async function main(): Promise<void> {
  const args =
    process.platform === 'darwin'
      ? ['electron-builder', '--mac', 'dmg', '--prepackaged', await findBuiltApp(ROOT)]
      : ['electron-builder'];
  const { stdout, stderr } = await run('npx', [...args, '--publish', 'never'], {
    cwd: ROOT,
    maxBuffer: 16 * 1024 * 1024,
  });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[dist] ÉCHEC — ${message}\n`);
  process.exitCode = 1;
}
