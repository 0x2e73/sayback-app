import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  APP_BUNDLE_NAME,
  APP_EXECUTABLE_NAME,
  UPDATE_MANIFEST_NAME,
  UPDATES_DIR_NAME,
  type BuildInfo,
  type UpdateManifest,
} from '../../shared/update-channel';
import type { UpdateStatus } from '../domain/update';
import type { UpdatePorts } from '../application/update-ports';
import { UpdateService } from '../application/updates';
import { writeFakeBundle } from './test-bundle';
import { localUpdatePorts, type LocalUpdateOptions } from './local-updates';

// Test support for the update service: real files in a temporary folder, real channel adapters;
// only the OS boundaries (launching the script, quitting, recording state) are witnesses.

export const CURRENT: BuildInfo = {
  version: '0.1.0',
  commit: 'a'.repeat(40),
  builtAt: '2026-10-13T10:00:00.000Z',
  localUpdateChannel: true,
};
export const NEXT = {
  version: '0.1.1',
  commit: 'b'.repeat(40),
  builtAt: '2026-10-13T12:00:00.000Z',
};
export const CURRENT_INFO = {
  version: CURRENT.version,
  commit: CURRENT.commit,
  builtAt: CURRENT.builtAt,
};
export const APP_PID = 424_242;
export const OLD_ASAR = 'version en cours';
export const NEW_ASAR = 'version suivante';

export interface FixturePatch {
  ports?: Partial<UpdatePorts>;
  local?: Partial<LocalUpdateOptions>;
  pollMs?: number;
}

export interface Launch {
  program: string;
  args: readonly string[];
}

export class UpdateFixture {
  readonly published: UpdateStatus[] = [];
  readonly launches: Launch[] = [];
  quits = 0;
  recording = false;
  failNextLaunch = false;
  private readonly services: UpdateService[] = [];

  constructor(readonly root: string) {}

  get channelRoot(): string {
    return join(this.root, 'Application Support', 'SayBack');
  }
  get updatesDir(): string {
    return join(this.channelRoot, UPDATES_DIR_NAME);
  }
  get stagedPath(): string {
    return join(this.updatesDir, APP_BUNDLE_NAME);
  }
  get appsDir(): string {
    return join(this.root, "Mes apps d'été");
  }
  get runningPath(): string {
    return join(this.appsDir, APP_BUNDLE_NAME);
  }
  get buildInfoPath(): string {
    return join(this.root, 'build-info.json');
  }
  get logPath(): string {
    return join(this.channelRoot, 'logs', 'update.log');
  }

  /** Publishes like the script does: the bundle first, the manifest last. */
  async publish(asar = NEW_ASAR, patch: Partial<UpdateManifest> = {}): Promise<UpdateManifest> {
    await mkdir(this.updatesDir, { recursive: true, mode: 0o700 });
    await rm(this.stagedPath, { recursive: true, force: true });
    const sha256 = await writeFakeBundle(this.stagedPath, { asar });
    const manifest: UpdateManifest = { ...NEXT, bundle: APP_BUNDLE_NAME, sha256, ...patch };
    await writeFile(join(this.updatesDir, UPDATE_MANIFEST_NAME), JSON.stringify(manifest));
    return manifest;
  }

  create(patch: FixturePatch = {}): UpdateService {
    const local = localUpdatePorts({
      channelRoot: this.channelRoot,
      buildInfoPath: this.buildInfoPath,
      exePath: join(this.runningPath, 'Contents', 'MacOS', APP_EXECUTABLE_NAME),
      pid: APP_PID,
      launch: (program, args) => this.launch(program, args),
      ...patch.local,
    });
    const service = new UpdateService(
      {
        ...local,
        appVersion: '9.9.9-test',
        isPackaged: true,
        isRecording: () => this.recording,
        quit: () => {
          this.quits += 1;
        },
        publish: (status) => {
          this.published.push(status);
        },
        ...patch.ports,
      },
      { pollMs: patch.pollMs ?? 3_600_000 },
    );
    this.services.push(service);
    return service;
  }

  async cleanup(): Promise<void> {
    for (const service of this.services.splice(0)) await service.stop();
    await chmod(this.appsDir, 0o700).catch(() => undefined);
    await rm(this.root, { recursive: true, force: true });
  }

  private launch(program: string, args: readonly string[]): Promise<void> {
    if (this.failNextLaunch) {
      this.failNextLaunch = false;
      return Promise.reject(new Error('spawn EAGAIN'));
    }
    this.launches.push({ program, args });
    return Promise.resolve();
  }
}

export async function createUpdateFixture(): Promise<UpdateFixture> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-updates-')));
  const fixture = new UpdateFixture(root);
  await writeFakeBundle(fixture.runningPath, { asar: OLD_ASAR });
  await writeFile(fixture.buildInfoPath, JSON.stringify(CURRENT));
  return fixture;
}
