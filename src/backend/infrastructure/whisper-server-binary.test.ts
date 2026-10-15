import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { trustedWhisperServer } from './whisper-server-binary';

let root: string;
let cellar: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'sayback-binary-')));
  cellar = join(root, 'Cellar', 'whisper.cpp');
  mkdirSync(join(cellar, '1.9.4', 'bin'), { recursive: true });
  mkdirSync(join(root, 'bin'));
  mkdirSync(join(root, 'elsewhere'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function file(path: string, mode: number): string {
  writeFileSync(path, '#!/bin/sh\n');
  chmodSync(path, mode);
  return path;
}

function link(name: string, target: string): string {
  const path = join(root, 'bin', name);
  symlinkSync(target, path);
  return path;
}

describe('trusted whisper-server', () => {
  it('resolves the Homebrew link to the executable in the Cellar', () => {
    const real = file(join(cellar, '1.9.4', 'bin', 'whisper-server'), 0o755);

    expect(trustedWhisperServer([link('whisper-server', real)], [`${cellar}/`])).toBe(real);
  });

  it('refuses a link pointing outside the Cellar', () => {
    const planted = file(join(root, 'elsewhere', 'whisper-server'), 0o755);

    expect(trustedWhisperServer([link('whisper-server', planted)], [`${cellar}/`])).toBeUndefined();
  });

  it('refuses a file that is not executable, a folder, or nothing at all', () => {
    const notExecutable = file(join(cellar, '1.9.4', 'bin', 'whisper-server'), 0o644);
    const folder = join(cellar, '1.9.4', 'folder');
    mkdirSync(folder);

    expect(trustedWhisperServer([link('a', notExecutable)], [`${cellar}/`])).toBeUndefined();
    expect(trustedWhisperServer([link('b', folder)], [`${cellar}/`])).toBeUndefined();
    expect(trustedWhisperServer([join(root, 'bin', 'missing')], [`${cellar}/`])).toBeUndefined();
  });

  it('takes the first prefix that holds a valid server', () => {
    const real = file(join(cellar, '1.9.4', 'bin', 'whisper-server'), 0o755);
    const links = [join(root, 'bin', 'missing'), link('whisper-server', real)];

    expect(trustedWhisperServer(links, [`${cellar}/`])).toBe(real);
  });
});
