import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { findBuiltApp } from './built-app.ts';
import {
  SIGNING_IDENTITY_ENV,
  resolveIdentity,
  signBundle,
  signingIdentityName,
  type SigningIo,
} from './local-signing.ts';

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

async function main(): Promise<void> {
  if (process.platform !== 'darwin') {
    io.log('hors macOS : rien à signer');
    return;
  }
  // Read before looking for the bundle: without an identity, nothing here needs `dist/`.
  const name = signingIdentityName(process.env);
  if (name === null) {
    io.log(`${SIGNING_IDENTITY_ENV} absente : signature ad hoc conservée`);
    return;
  }
  const identity = await resolveIdentity(name, io.capture);
  await signBundle(await findBuiltApp(ROOT), identity, io);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[signature] ÉCHEC — ${message}\n`);
  process.exitCode = 1;
}
