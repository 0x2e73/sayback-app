import { execFile, spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { packagedChannelRoot } from '../src/shared/update-channel.ts';
import {
  RELEASE_USAGE,
  ReleaseError,
  parseReleaseArgs,
  runRelease,
  type ReleaseIo,
  type ReleaseOptions,
} from './update-release.ts';

// `npm run update:publish`: publishes the current commit to the local update channel. The running
// app sees it on its next return to the foreground (or within five minutes) and offers to install.

const ROOT = join(import.meta.dirname, '..');
const capture = promisify(execFile);
const interruption = new AbortController();

const io: ReleaseIo = {
  run: (command, args, cwd, env) =>
    new Promise<number>((resolveCode) => {
      const child = spawn(command, [...args], {
        cwd,
        stdio: 'inherit',
        env: { ...process.env, ...env },
        // An interruption stops the running command too.
        signal: interruption.signal,
      });
      child.on('error', (error) => {
        process.stderr.write(`[update] ${command} : ${error.message}\n`);
        resolveCode(127);
      });
      child.on('exit', (code) => resolveCode(code ?? 1));
    }),
  capture: async (command, args, cwd) =>
    (await capture(command, [...args], { cwd, maxBuffer: 16 * 1024 * 1024 })).stdout,
  log: (line) => {
    process.stdout.write(`[update] ${line}\n`);
  },
};

// ⌃C, SIGTERM, SIGHUP: nothing more starts, and the script goes on to clean its copy.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    process.stderr.write(`[update] ${signal} : arrêt et nettoyage de la copie…\n`);
    interruption.abort();
  });
}

function parseOrExit(): ReleaseOptions {
  try {
    return parseReleaseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[update] ${message}\n\n${RELEASE_USAGE}\n`);
    process.exit(2);
  }
}

function describeFailure(error: unknown): string {
  if (error instanceof ReleaseError) return error.message;
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

const options = parseOrExit();
try {
  const channelRoot =
    options.channelRoot === undefined
      ? packagedChannelRoot(homedir())
      : resolve(options.channelRoot);
  const context = { repoRoot: ROOT, channelRoot, io, signal: interruption.signal };
  const { manifest, alreadyPublished } = await runRelease(options, context);
  process.stdout.write(
    alreadyPublished
      ? `[update] ATTENTION — le commit ${manifest.commit.slice(0, 12)} était déjà publié : une app construite depuis ce commit ne proposera rien. Committez une modification, puis republiez.\n`
      : '[update] OK — SayBack proposera la mise à jour à son prochain retour au premier plan.\n',
  );
} catch (error) {
  process.stderr.write(`[update] ÉCHEC — ${describeFailure(error)}\n`);
  process.exitCode = 1;
}
