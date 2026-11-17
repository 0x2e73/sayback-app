import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CODESIGN_PROGRAM,
  RELEASE_TEAM_ID,
  SigningError,
  assertReleaseIdentity,
  signBundleForRelease,
  type Capture,
  type SigningIo,
} from './local-signing';
import { FILE_PROGRAM } from './mach-o';

// A real folder shaped like the Electron bundle; `file` and `codesign` are simulated. What is
// checked: which identity is accepted, what is signed, in which order, with which options.

const DEVELOPER_ID = {
  name: `Developer ID Application: Jane Doe (${RELEASE_TEAM_ID})`,
  hash: 'B'.repeat(40),
};
const ENTITLEMENTS = '/repo/build/entitlements.mac.plist';
const TEAM_REQUIREMENT = `designated => identifier "ch.sayback.desktop" and anchor apple generic and certificate leaf[subject.OU] = ${RELEASE_TEAM_ID}`;

const MACH_O = [
  'Contents/MacOS/SayBack',
  'Contents/Frameworks/SayBack Helper.app/Contents/MacOS/SayBack Helper',
  'Contents/Frameworks/SayBack Helper (Renderer).app/Contents/MacOS/SayBack Helper (Renderer)',
  'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework',
  'Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib',
  'Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib',
  'Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt',
];
const OTHER_FILES = ['Contents/Info.plist', 'Contents/Resources/app.asar'];

let root: string;
let app: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-release-sign-')));
  app = join(root, 'SayBack.app');
  for (const file of [...MACH_O, ...OTHER_FILES]) {
    await mkdir(join(app, file, '..'), { recursive: true });
    await writeFile(join(app, file), file);
  }
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function fakeSystem(requirement = TEAM_REQUIREMENT) {
  const signed: (readonly string[])[] = [];
  const calls: (readonly string[])[] = [];
  const capture: Capture = (command, args) => {
    calls.push([command, ...args]);
    if (command === FILE_PROGRAM) {
      const files = args.slice(args.indexOf('--') + 1);
      const kind = (path: string) =>
        MACH_O.some((end) => path.endsWith(end)) ? 'Mach-O 64-bit executable arm64' : 'data';
      return Promise.resolve(files.map((path) => `${path}\0: ${kind(path)}\n`).join(''));
    }
    if (command === CODESIGN_PROGRAM && args[0] === '--sign') signed.push(args);
    if (command === CODESIGN_PROGRAM && args[0] === '-d') return Promise.resolve(requirement);
    return Promise.resolve('');
  };
  const io: SigningIo = { capture, log: () => undefined };
  return { io, signed, calls };
}

const target = (args: readonly string[]) => args.at(-1) ?? '';

describe('assertReleaseIdentity', () => {
  it('accepte le Developer ID de l’équipe du projet', () => {
    expect(() => {
      assertReleaseIdentity(DEVELOPER_ID.name);
    }).not.toThrow();
  });

  it.each([
    'SayBack Local Signing',
    `Apple Development: Jane Doe (${RELEASE_TEAM_ID})`,
    'Developer ID Application: Jane Doe (ZZZZZ99999)',
    `Developer ID Installer: Jane Doe (${RELEASE_TEAM_ID})`,
    '',
  ])('refuse « %s »', (name) => {
    expect(() => {
      assertReleaseIdentity(name);
    }).toThrow(SigningError);
  });
});

describe('signBundleForRelease', () => {
  it('identité refusée : rien n’est signé', async () => {
    const { io, calls } = fakeSystem();
    const local = { name: 'SayBack Local Signing', hash: 'C'.repeat(40) };
    await expect(signBundleForRelease(app, local, ENTITLEMENTS, io)).rejects.toThrow(SigningError);
    expect(calls).toEqual([]);
  });

  it('signe chaque Mach-O, ShipIt et dylibs compris, avec runtime et horodatage, sans --deep', async () => {
    const { io, signed } = fakeSystem();
    await signBundleForRelease(app, DEVELOPER_ID, ENTITLEMENTS, io);
    const targets = signed.map(target);
    for (const file of MACH_O) expect(targets).toContain(join(app, file));
    for (const file of OTHER_FILES) expect(targets).not.toContain(join(app, file));
    for (const args of signed) {
      const options = [
        '--sign',
        DEVELOPER_ID.hash,
        '--force',
        '--options',
        'runtime',
        '--timestamp',
      ];
      expect(args.slice(0, 6)).toEqual(options);
      expect(args).not.toContain('--deep');
    }
  });

  it('du plus profond vers l’app : chaque paquet après son contenu, l’app en dernier', async () => {
    const { io, signed } = fakeSystem();
    await signBundleForRelease(app, DEVELOPER_ID, ENTITLEMENTS, io);
    const order = signed.map(target);
    const at = (path: string) => order.indexOf(join(app, path));
    const helper = 'Contents/Frameworks/SayBack Helper.app';
    const framework = 'Contents/Frameworks/Electron Framework.framework';
    expect(at(`${helper}/Contents/MacOS/SayBack Helper`)).toBeLessThan(at(helper));
    expect(at(`${framework}/Versions/A/Libraries/libffmpeg.dylib`)).toBeLessThan(at(framework));
    expect(order.at(-1)).toBe(app);
  });

  it('entitlements sur l’app et ses helpers seulement', async () => {
    const { io, signed } = fakeSystem();
    await signBundleForRelease(app, DEVELOPER_ID, ENTITLEMENTS, io);
    const granted = signed.filter((args) => args.includes('--entitlements')).map(target);
    expect(granted.sort()).toEqual(
      [
        app,
        join(app, 'Contents/Frameworks/SayBack Helper.app'),
        join(app, 'Contents/Frameworks/SayBack Helper (Renderer).app'),
      ].sort(),
    );
    for (const args of signed.filter((call) => call.includes('--entitlements'))) {
      expect(args[args.indexOf('--entitlements') + 1]).toBe(ENTITLEMENTS);
    }
  });

  it('vérifie puis prouve que l’exigence désignée nomme l’équipe', async () => {
    const { io, calls } = fakeSystem();
    await signBundleForRelease(app, DEVELOPER_ID, ENTITLEMENTS, io);
    expect(calls.at(-2)).toEqual([CODESIGN_PROGRAM, '--verify', '--deep', '--strict', app]);
    expect(calls.at(-1)).toEqual([CODESIGN_PROGRAM, '-d', '-r-', app]);
  });

  it('une exigence qui ne nomme pas l’équipe fait échouer', async () => {
    const { io } = fakeSystem(`designated => cdhash H"${'d'.repeat(40)}"`);
    await expect(signBundleForRelease(app, DEVELOPER_ID, ENTITLEMENTS, io)).rejects.toThrow(
      /ne nomme pas le certificat/,
    );
  });

  it('bundle absent : échoue avant toute signature', async () => {
    const { io, signed } = fakeSystem();
    const missing = join(root, 'Absent.app');
    await expect(signBundleForRelease(missing, DEVELOPER_ID, ENTITLEMENTS, io)).rejects.toThrow();
    expect(signed).toEqual([]);
  });
});
