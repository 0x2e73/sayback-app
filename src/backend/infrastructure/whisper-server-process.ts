import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ServerProcess } from './whisper-server';

const execute = promisify(execFile);
const LSOF = '/usr/sbin/lsof';

/**
 * No output is read: the server prints nothing the live needs, and an unread pipe would fill.
 * It runs in an empty folder of its own with a minimal environment, so it inherits neither the
 * app's variables nor a working directory where it could find or leave files.
 */
export function spawnQuiet(binary: string, args: string[]): ServerProcess {
  const folder = mkdtempSync(join(tmpdir(), 'sayback-live-'));
  const child = spawn(binary, args, {
    cwd: folder,
    env: { PATH: '/usr/bin:/bin', TMPDIR: folder },
    stdio: 'ignore',
  });
  const cleanUp = () => rmSync(folder, { recursive: true, force: true });
  child.once('exit', cleanUp);
  child.once('error', cleanUp);
  return child;
}

/** A port free on the loopback right now; the listener check confirms the server holds it. */
export function freeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Aucun port local libre.'));
      });
    });
  });
}

/** Hexadecimal: safe in a URL path and in the route pattern of the server. */
export function requestToken(): string {
  return randomBytes(24).toString('hex');
}

/** The distinct PIDs of `lsof -F p` output: one `p<pid>` line per process. */
export function parseListenerPids(output: string): number[] {
  const pids = output
    .split('\n')
    .filter((line) => /^p\d+$/.test(line))
    .map((line) => Number(line.slice(1)));
  return [...new Set(pids)];
}

function nothingFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, stdout } = error as { code?: unknown; stdout?: unknown };
  return code === 1 && (stdout === '' || stdout === undefined);
}

/**
 * Every process of the user listening on the TCP port, on any address: a listener on the
 * wildcard address would share the port too. Null when lsof cannot answer.
 */
export async function loopbackListeners(port: number): Promise<number[] | null> {
  try {
    const { stdout } = await execute(LSOF, ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], {
      timeout: 2_000,
      maxBuffer: 16 * 1024,
      env: {},
    });
    return parseListenerPids(stdout);
  } catch (error) {
    // lsof exits with 1 and prints nothing when no process matches.
    return nothingFound(error) ? [] : null;
  }
}
