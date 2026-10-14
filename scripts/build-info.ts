import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUILD_COMMIT_UNKNOWN,
  BUILD_INFO_FILE_NAME,
  LOCAL_UPDATE_CHANNEL_ENV,
  buildInfoSchema,
  type BuildInfo,
} from '../src/shared/update-channel.ts';

// Run by `npm run build` after electron-vite: writes the build identity to `out/build-info.json`
// (packaged in app.asar). `SAYBACK_LOCAL_UPDATE_CHANNEL=0` builds an app WITHOUT the local update
// channel; the setting is frozen in the bundle, nothing a user writes reopens it.

const ROOT = join(import.meta.dirname, '..');
const TARGET_DIR = join(ROOT, 'out');
const TARGET = join(TARGET_DIR, BUILD_INFO_FILE_NAME);

function headCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return BUILD_COMMIT_UNKNOWN;
  }
}

const pkg: unknown = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version =
  typeof pkg === 'object' && pkg !== null && 'version' in pkg ? pkg.version : undefined;

// The schema the app applies when reading: a file it would refuse is not written.
const info: BuildInfo = buildInfoSchema.parse({
  version,
  commit: headCommit(),
  builtAt: new Date().toISOString(),
  localUpdateChannel: process.env[LOCAL_UPDATE_CHANNEL_ENV] !== '0',
});

mkdirSync(TARGET_DIR, { recursive: true });
// Written next to it then renamed: an app starting in development never reads half a file.
writeFileSync(`${TARGET}.tmp`, `${JSON.stringify(info, null, 2)}\n`);
renameSync(`${TARGET}.tmp`, TARGET);
const channel = info.localUpdateChannel ? '' : ' — canal de mise à jour local désactivé';
process.stdout.write(
  `[build-info] ${info.version} ${info.commit.slice(0, 12)} ${info.builtAt}${channel}\n`,
);
