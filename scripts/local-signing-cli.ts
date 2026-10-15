import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { findBuiltApp } from './built-app.ts';
import { SIGNING_IDENTITY_ENV, signBundle, type SigningIo } from './local-signing.ts';

// Run after `electron-builder --dir` (`npm run package`, `npm run update:publish`): re-signs the
// built `.app` with the identity named in SAYBACK_SIGNING_IDENTITY, or leaves it ad hoc.

const ROOT = join(import.meta.dirname, '..');
const capture = promisify(execFile);

const io: SigningIo = {
  capture: async (command, args) =>
    (await capture(command, [...args], { maxBuffer: 4 * 1024 * 1024 })).stdout,
  log: (line) => {
    process.stdout.write(`[signature] ${line}\n`);
  },
};

if (process.platform !== 'darwin') {
  io.log('hors macOS : rien à signer');
} else {
  try {
    await signBundle(await findBuiltApp(ROOT), process.env[SIGNING_IDENTITY_ENV], io);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[signature] ÉCHEC — ${message}\n`);
    process.exitCode = 1;
  }
}
