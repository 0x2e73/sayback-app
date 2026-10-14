import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  APP_BUNDLE_NAME,
  BUILD_INFO_FILE_NAME,
  UPDATES_DIR_NAME,
  buildInfoSchema,
  type UpdateManifest,
} from '../src/shared/update-channel.ts';
import { ReleaseError, publishToChannel } from './update-publish.ts';

// Builds the current commit in a frozen copy (detached git worktree, cloned node_modules), runs
// every check there, then publishes. Stops at the first red step and names it; nothing is
// published. Uncommitted changes never go into the build.

export { ReleaseError };

const DIRTY_NOTE =
  'publié depuis un arbre de travail modifié (modifications non commitées non incluses)';

export interface ReleaseOptions {
  allowDirty: boolean;
  notes?: string;
  /** Folder that receives `updates/`, instead of the packaged app's (trials). */
  channelRoot?: string;
}

export const RELEASE_USAGE = [
  'npm run update:publish -- [--notes "<une ligne>"] [--allow-dirty] [--channel-root <dossier>]',
  '  --notes         une ligne montrée avec la mise à jour',
  '  --allow-dirty   publie le commit courant malgré des modifications non commitées (elles ne partent pas dans le build)',
  '  --channel-root  dossier qui reçoit updates/, à la place de ~/Library/Application Support/SayBack (essais)',
].join('\n');

function splitOption(arg: string): [string, string | undefined] {
  if (!arg.startsWith('--') || !arg.includes('=')) return [arg, undefined];
  const at = arg.indexOf('=');
  return [arg.slice(0, at), arg.slice(at + 1)];
}

/** Reads the command line options. Throws `ReleaseError` on an unknown option or missing value. */
export function parseReleaseArgs(argv: readonly string[]): ReleaseOptions {
  const options: ReleaseOptions = { allowDirty: false };
  const args = [...argv];
  const valueOf = (name: string, inline: string | undefined): string => {
    const value = inline ?? args.shift();
    const missing = value === undefined || value === '';
    if (missing || (inline === undefined && value.startsWith('--'))) {
      throw new ReleaseError(`${name} attend une valeur`);
    }
    return value;
  };
  for (let arg = args.shift(); arg !== undefined; arg = args.shift()) {
    const [name, inline] = splitOption(arg);
    if (name === '--allow-dirty' && inline === undefined) options.allowDirty = true;
    else if (name === '--notes') options.notes = valueOf(name, inline);
    else if (name === '--channel-root') options.channelRoot = valueOf(name, inline);
    else throw new ReleaseError(`option inconnue : ${arg}`);
  }
  return options;
}

/** The checks, in order; the first that fails stops everything. `package` builds the `.app`. */
export const RELEASE_STEPS: readonly { label: string; command: string; args: readonly string[] }[] =
  [
    { label: 'check', command: 'npm', args: ['run', 'check'] },
    { label: 'package', command: 'npx', args: ['electron-builder', '--dir', '--publish', 'never'] },
  ];

/** What `runRelease` asks of the system: replaceable in tests. */
export interface ReleaseIo {
  /** Runs a command with visible output; returns its exit code. */
  run(command: string, args: readonly string[], cwd: string): Promise<number>;
  /** Runs a command and returns its standard output; throws if it fails. */
  capture(command: string, args: readonly string[], cwd: string): Promise<string>;
  log(line: string): void;
}

export interface ReleaseContext {
  repoRoot: string;
  /** `appData/SayBack` of the packaged app. */
  channelRoot: string;
  io: ReleaseIo;
}

/** The bundle electron-builder built in the copy: `SayBack.app` in `dist/mac…`. */
async function findBuiltApp(tree: string): Promise<string> {
  const distDir = join(tree, 'dist');
  const outputs = await readdir(distDir).catch((): string[] => []);
  for (const name of outputs.filter((entry) => entry.startsWith('mac')).sort()) {
    const candidate = join(distDir, name, APP_BUNDLE_NAME);
    const found = await stat(candidate).then(
      (info) => info.isDirectory(),
      () => false,
    );
    if (found) return candidate;
  }
  throw new ReleaseError(`aucun ${APP_BUNDLE_NAME} dans ${distDir}`);
}

async function buildAndCheck(tree: string, context: ReleaseContext): Promise<void> {
  const { repoRoot, io } = context;
  // APFS clone: instant, without doubling the space node_modules takes.
  const nodeModules = ['-cR', join(repoRoot, 'node_modules'), join(tree, 'node_modules')];
  if ((await io.run('cp', nodeModules, repoRoot)) !== 0) {
    throw new ReleaseError('étape « node_modules » en échec');
  }
  for (const step of RELEASE_STEPS) {
    io.log(`étape « ${step.label} » : ${[step.command, ...step.args].join(' ')}`);
    const code = await io.run(step.command, step.args, tree);
    if (code !== 0) {
      throw new ReleaseError(
        `étape « ${step.label} » en échec (code ${String(code)}) : rien n'est publié`,
      );
    }
  }
}

async function publishBuilt(
  tree: string,
  commit: string,
  notes: string | undefined,
  context: ReleaseContext,
): Promise<UpdateManifest> {
  const appPath = await findBuiltApp(tree);
  const infoText = await readFile(join(tree, 'out', BUILD_INFO_FILE_NAME), 'utf8');
  const info = buildInfoSchema.parse(JSON.parse(infoText));
  if (info.commit !== commit) {
    throw new ReleaseError(`le paquet construit dit venir de ${info.commit}, pas de ${commit}`);
  }
  const updatesDir = join(context.channelRoot, UPDATES_DIR_NAME);
  const manifest = await publishToChannel({ appPath, updatesDir, info, notes });
  context.io.log(`publié : ${manifest.version} ${manifest.commit.slice(0, 12)} dans ${updatesDir}`);
  return manifest;
}

/** Builds the current commit in a frozen copy, checks it, publishes it. Returns the manifest. */
export async function runRelease(
  options: ReleaseOptions,
  context: ReleaseContext,
): Promise<UpdateManifest> {
  const { repoRoot, io } = context;
  const status = await io.capture('git', ['status', '--porcelain'], repoRoot);
  const dirty = status.split('\n').filter((line) => line.trim() !== '');
  if (dirty.length > 0 && !options.allowDirty) {
    throw new ReleaseError(
      `l'arbre de travail a ${String(dirty.length)} modification(s) non commitée(s) : committez d'abord, ou relancez avec --allow-dirty (elles ne partiront pas dans le build)`,
    );
  }
  const commit = (await io.capture('git', ['rev-parse', 'HEAD'], repoRoot)).trim();
  // The dirty-tree mention comes first: a long note must not cut it.
  const parts = [dirty.length > 0 ? DIRTY_NOTE : undefined, options.notes];
  const notes = parts.filter((part) => part !== undefined).join(' — ') || undefined;
  const workDir = await mkdtemp(join(tmpdir(), 'sayback-release-'));
  const tree = join(workDir, 'sayback');
  let worktreeAdded = false;
  try {
    io.log(`copie figée de ${commit.slice(0, 12)} dans ${tree}`);
    const added = await io.run('git', ['worktree', 'add', '--detach', tree, commit], repoRoot);
    if (added !== 0) throw new ReleaseError('étape « worktree » en échec');
    worktreeAdded = true;
    await buildAndCheck(tree, context);
    return await publishBuilt(tree, commit, notes, context);
  } finally {
    if (worktreeAdded) {
      await io.run('git', ['worktree', 'remove', '--force', tree], repoRoot).catch(() => 1);
    }
    await rm(workDir, { recursive: true, force: true });
  }
}
