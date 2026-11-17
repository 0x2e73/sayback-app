import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Capture } from './local-signing';
import {
  FILE_PROGRAM,
  carriesEntitlements,
  deepestFirst,
  listMachO,
  machOPaths,
  nestedBundles,
} from './mach-o';

// `file` is simulated (an OS boundary); the folder walk is real.

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-mach-o-')));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** `file -0 -N`: Mach-O for the paths that end with one of `machO`, data otherwise. */
function fakeFile(machO: readonly string[]) {
  const seen: (readonly string[])[] = [];
  const capture: Capture = (command, args) => {
    if (command !== FILE_PROGRAM) return Promise.reject(new Error(command));
    seen.push(args);
    const files = args.slice(args.indexOf('--') + 1);
    const kind = (path: string) =>
      machO.some((end) => path.endsWith(end))
        ? 'Mach-O 64-bit dynamically linked shared library arm64'
        : 'data';
    return Promise.resolve(files.map((path) => `${path}\0: ${kind(path)}\n`).join(''));
  };
  return { capture, seen };
}

describe('machOPaths', () => {
  it('garde les Mach-O, fins ou universels, et ignore les lignes de suite', () => {
    const output = [
      '/a/ShipIt\0: Mach-O universal binary with 2 architectures: [x86_64:Mach-O 64-bit executable x86_64',
      '- Mach-O 64-bit executable x86_64] [arm64]',
      '/a/libffmpeg.dylib\0: Mach-O 64-bit dynamically linked shared library arm64',
      '/a/Info.plist\0: XML 1.0 document text, ASCII text',
      '/a/fake Mach-O.txt\0: ASCII text',
      '',
    ].join('\n');
    expect(machOPaths(output)).toEqual(['/a/ShipIt', '/a/libffmpeg.dylib']);
  });

  it('sortie vide : aucun Mach-O', () => {
    expect(machOPaths('')).toEqual([]);
  });
});

describe('listMachO', () => {
  it('reconnaît le code par `file`, pas par le nom, et ignore les liens symboliques', async () => {
    const versions = join(root, 'Squirrel.framework', 'Versions');
    await mkdir(join(versions, 'A', 'Resources'), { recursive: true });
    await writeFile(join(versions, 'A', 'Resources', 'ShipIt'), 'binaire');
    await writeFile(join(versions, 'A', 'Resources', 'Info.plist'), '<plist/>');
    await symlink('A', join(versions, 'Current'));
    await symlink('Versions/Current/Resources', join(root, 'Squirrel.framework', 'Resources'));
    const { capture, seen } = fakeFile(['ShipIt']);
    expect(await listMachO(root, capture)).toEqual([join(versions, 'A', 'Resources', 'ShipIt')]);
    expect(seen[0]?.filter((arg) => arg.includes('Current'))).toEqual([]);
  });

  it('dossier vide : `file` n’est pas lancé', async () => {
    const { capture, seen } = fakeFile([]);
    expect(await listMachO(root, capture)).toEqual([]);
    expect(seen).toEqual([]);
  });

  it('dossier absent : échoue au lieu de ne rien signer', async () => {
    await expect(listMachO(join(root, 'absent'), fakeFile([]).capture)).rejects.toThrow();
  });
});

describe('nestedBundles', () => {
  it('trouve les .app et .framework imbriqués', async () => {
    const helper = join(root, 'Contents', 'Frameworks', 'SayBack Helper (GPU).app');
    const framework = join(root, 'Contents', 'Frameworks', 'Electron Framework.framework');
    await mkdir(helper, { recursive: true });
    await mkdir(framework, { recursive: true });
    await mkdir(join(root, 'Contents', 'Resources', 'fr.lproj'), { recursive: true });
    expect((await nestedBundles(root)).sort()).toEqual([framework, helper].sort());
  });
});

describe('deepestFirst', () => {
  it('le code contenu passe avant le paquet qui le contient', () => {
    const app = '/x/SayBack.app/Contents/Frameworks/SayBack Helper.app';
    const executable = `${app}/Contents/MacOS/SayBack Helper`;
    const dylib =
      '/x/SayBack.app/Contents/Frameworks/E.framework/Versions/A/Libraries/libffmpeg.dylib';
    expect(deepestFirst([app, executable, dylib])).toEqual([dylib, executable, app]);
  });
});

describe('carriesEntitlements', () => {
  it.each([
    ['/x/SayBack.app', true],
    ['/x/SayBack.app/Contents/Frameworks/SayBack Helper (Renderer).app', true],
    ['/x/SayBack.app/Contents/MacOS/SayBack', true],
    ['/x/SayBack.app/Contents/Frameworks/E.framework/Versions/A/E', false],
    ['/x/SayBack.app/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt', false],
    ['/x/SayBack.app/Contents/Frameworks/E.framework/Versions/A/Libraries/libffmpeg.dylib', false],
  ])('%s : %s', (path, expected) => {
    expect(carriesEntitlements(path)).toBe(expected);
  });
});
