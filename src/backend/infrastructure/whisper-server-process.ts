import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import type { ServerProcess } from './whisper-server';

/**
 * No output is read: the server prints nothing the live needs, and an unread pipe would fill.
 * Nothing logs the arguments, which hold the token.
 */
export function spawnQuiet(binary: string, args: string[]): ServerProcess {
  return spawn(binary, args, { stdio: 'ignore' });
}

/** A port free on the loopback right now; the health check on the secret path confirms it. */
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
