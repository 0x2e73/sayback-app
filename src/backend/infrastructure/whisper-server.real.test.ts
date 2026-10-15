import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LiveAvailability } from '../../shared/live';
import { liveWhisperModel, whisperModelFolders } from './local-setup';
import { WhisperServer } from './whisper-server';
import { trustedWhisperServer } from './whisper-server-binary';
import { whisperServerHealthy } from './whisper-server-client';
import { createPidFile, createServerRecorder } from './whisper-server-pid';
import {
  freeLoopbackPort,
  loopbackListeners,
  requestToken,
  spawnQuiet,
} from './whisper-server-process';

// Needs the Homebrew whisper.cpp and a model: `SAYBACK_REAL_WHISPER=1 npx vitest run <file>`.
const binary = trustedWhisperServer();
const model = liveWhisperModel('', whisperModelFolders(homedir()));
const enabled = process.env.SAYBACK_REAL_WHISPER === '1' && Boolean(binary && model);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let folder = '';
const intruders: ChildProcess[] = [];
const supervisors: WhisperServer[] = [];

afterEach(async () => {
  for (const intruder of intruders.splice(0)) intruder.kill('SIGKILL');
  await Promise.all(supervisors.splice(0).map((server) => server.stop()));
  if (folder) rmSync(folder, { recursive: true, force: true });
});

function supervise(port: () => Promise<number>) {
  folder = mkdtempSync(join(tmpdir(), 'sayback-real-'));
  const states: string[] = [];
  const server = new WhisperServer({
    spawn: spawnQuiet,
    freePort: port,
    token: requestToken,
    healthy: (base, signal) => whisperServerHealthy(base, signal),
    listeners: loopbackListeners,
    pids: createServerRecorder(createPidFile(join(folder, 'live-engine.pid'))),
    wait: sleep,
    now: () => Date.now(),
    onAvailability: (next: LiveAvailability) =>
      states.push(next.state === 'unavailable' ? next.reason : next.state),
  });
  supervisors.push(server);
  return { server, states };
}

/** A second whisper-server on the same port: macOS lets both listen. */
function intrude(port: number): void {
  const args = ['-m', model, '--host', '127.0.0.1', '--port', String(port)];
  intruders.push(spawn(binary!, [...args, '--request-path', '/intruder'], { stdio: 'ignore' }));
}

async function until(condition: () => boolean, ms = 30_000): Promise<void> {
  for (const deadline = Date.now() + ms; !condition() && Date.now() < deadline;) await sleep(50);
}

describe.runIf(enabled)('real whisper-server', () => {
  it('gives the server up when a second listener appears on its port', async () => {
    let chosen = 0;
    const { server, states } = supervise(async () => (chosen = await freeLoopbackPort()));
    server.start(binary!, model);
    await until(() => states.includes('ready'));

    intrude(chosen);
    await until(() => states.includes('port-conflict'), 10_000);

    expect(states).toEqual(['starting', 'ready', 'port-conflict']);
    expect(await server.verifiedBaseUrl()).toBeNull();
  }, 60_000);

  it('never becomes ready on a port another process already listens on', async () => {
    const port = await freeLoopbackPort();
    intrude(port);
    await sleep(1_500);
    const { server, states } = supervise(async () => port);

    server.start(binary!, model);
    await until(() => states.includes('port-conflict') || states.includes('ready'));

    expect(states).toEqual(['starting', 'port-conflict']);
  }, 60_000);
});
