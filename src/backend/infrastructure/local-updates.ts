import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  UPDATES_DIR_NAME,
  buildInfoSchema,
  type BuildInfo,
  type UpdateManifest,
} from '../../shared/update-channel';
import type { InstallTarget, UpdatePorts } from '../application/update-ports';
import { createChannelReader } from './update-channel-reader';
import {
  describeInstallCommand,
  installArgs,
  launchDetached,
  writeInstallScript,
  type InstallPlan,
} from './update-install';
import {
  DITTO_PROGRAM,
  INSTALL_SCRIPT_NAME,
  INSTALL_SHELL,
  OPEN_PROGRAM,
} from './update-install-script';
import { resolveInstallTarget } from './update-target';
import { appendLogLine } from './safe-files';

/** The script waits this long for the app to end before giving up without touching anything. */
export const UPDATE_WAIT_SECONDS = 60;
const BUILD_INFO_MAX_BYTES = 16 * 1024;
const UPDATE_LOG_MAX_BYTES = 256 * 1024;

export interface LocalUpdateOptions {
  /** `appData/SayBack`: holds `updates/` and `logs/update.log`, whatever the data folder is. */
  channelRoot: string;
  /** `out/build-info.json`, inside app.asar once packaged. */
  buildInfoPath: string;
  /** `app.getPath('exe')`: the running bundle is derived from it. */
  exePath: string;
  uid?: number;
  pid?: number;
  waitSeconds?: number;
  openProgram?: string;
  dittoProgram?: string;
  launch?: (program: string, args: readonly string[]) => Promise<void>;
}

/** The build identity, or `null` when absent, oversized or of another shape. */
export async function readBuildInfo(path: string): Promise<BuildInfo | null> {
  try {
    // `stat` then `readFile`: both read inside app.asar (Electron) as on disk.
    if ((await stat(path)).size > BUILD_INFO_MAX_BYTES) return null;
    const parsed = buildInfoSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type LocalPorts = Pick<
  UpdatePorts,
  'loadBuildInfo' | 'channel' | 'locateTarget' | 'launchInstall' | 'log'
>;

/** The filesystem side of the update service. */
export function localUpdatePorts(options: LocalUpdateOptions): LocalPorts {
  const uid = options.uid ?? process.getuid?.() ?? -1;
  const updatesDir = join(options.channelRoot, UPDATES_DIR_NAME);
  const logPath = join(options.channelRoot, 'logs', 'update.log');
  const launch = options.launch ?? launchDetached;
  const appendLog = (line: string) => appendLogLine(logPath, line, UPDATE_LOG_MAX_BYTES);

  async function launchInstall(manifest: UpdateManifest, target: InstallTarget): Promise<void> {
    const plan: InstallPlan = {
      pid: options.pid ?? process.pid,
      stagedPath: join(updatesDir, manifest.bundle),
      targetPath: target.bundlePath,
      sha256: manifest.sha256,
      logPath,
      waitSeconds: options.waitSeconds ?? UPDATE_WAIT_SECONDS,
      openProgram: options.openProgram ?? OPEN_PROGRAM,
      dittoProgram: options.dittoProgram ?? DITTO_PROGRAM,
    };
    const scriptPath = join(updatesDir, INSTALL_SCRIPT_NAME);
    const args = installArgs(plan);
    await writeInstallScript(scriptPath);
    const command = describeInstallCommand(scriptPath, plan);
    await appendLog(
      `${new Date().toISOString()} [app] installation de ${manifest.version} (${manifest.commit}) : ${command}\n`,
    );
    await launch(INSTALL_SHELL, [scriptPath, ...args]);
  }

  return {
    loadBuildInfo: () => readBuildInfo(options.buildInfoPath),
    channel: createChannelReader({ updatesDir, uid }),
    locateTarget: () => resolveInstallTarget({ exePath: options.exePath, uid, updatesDir }),
    launchInstall,
    log: (message) => {
      appendLog(`${new Date().toISOString()} [app] ${message}\n`).catch(() => undefined);
    },
  };
}
