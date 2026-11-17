import { extractFile } from '@electron/asar';
import { execFile, spawn, type ExecFileException } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { BUILD_INFO_FILE_NAME } from '../src/shared/update-channel.ts';
import { SigningError, signingIdentityName } from './local-signing.ts';
import { publicationCommands, runPublicRelease, type PublicReleaseIo } from './public-release.ts';
import type { CommandResult } from './release-proof.ts';
import { ReleaseError } from './update-publish.ts';

// `npm run release`: a notarized dmg of the current commit, proven, with its checksum. Publishes
// nothing; prints the commands that tag and draft the GitHub release.

const ROOT = join(import.meta.dirname, '..');
const execute = promisify(execFile);
// codesign --timestamp and stapler reach Apple; notarytool has its own --timeout.
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const options = { maxBuffer: 16 * 1024 * 1024, timeout: COMMAND_TIMEOUT_MS };

/** A command that could not start (ENOENT…) or was killed counts as a failure too. */
function exitCode(error: ExecFileException | null): number {
  if (error === null) return 0;
  return typeof error.code === 'number' ? error.code : 1;
}

function inspect(command: string, args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolveResult) => {
    execFile(command, [...args], options, (error, stdout, stderr) => {
      resolveResult({ code: exitCode(error), stdout, stderr });
    });
  });
}

const io: PublicReleaseIo = {
  run: (command, args, cwd, env) =>
    new Promise<number>((resolveCode) => {
      const child = spawn(command, [...args], {
        cwd,
        stdio: 'inherit',
        env: { ...process.env, ...env },
      });
      child.on('error', (error) => {
        process.stderr.write(`[release] ${command} : ${error.message}\n`);
        resolveCode(127);
      });
      child.on('exit', (code) => resolveCode(code ?? 1));
    }),
  capture: async (command, args, cwd) =>
    (await execute(command, [...args], { cwd, ...options })).stdout,
  inspect,
  log: (line) => {
    process.stdout.write(`[release] ${line}\n`);
  },
};

function describeFailure(error: unknown): string {
  if (error instanceof ReleaseError || error instanceof SigningError) return error.message;
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

try {
  if (process.platform !== 'darwin')
    throw new ReleaseError('une version publique se construit sur macOS');
  const result = await runPublicRelease({
    repoRoot: ROOT,
    io,
    identityName: signingIdentityName(process.env),
    readBuildInfo: (asar) =>
      Promise.resolve(
        JSON.parse(extractFile(asar, `out/${BUILD_INFO_FILE_NAME}`).toString('utf8')),
      ),
  });
  const next = publicationCommands(result).map((line) => `  ${line}`);
  process.stdout.write(
    `[release] OK — ${result.dmg}\nBrouillon, puis porte de test (compte macOS neuf, dmg téléchargé du brouillon) avant « Publier » :\n${next.join('\n')}\n`,
  );
} catch (error) {
  process.stderr.write(`[release] ÉCHEC — ${describeFailure(error)}\n`);
  process.exitCode = 1;
}
