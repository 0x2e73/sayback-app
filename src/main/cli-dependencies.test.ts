import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { clearCliRuns, prepareCliRuns } from './cli-dependencies';

let root = '';
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sayback-cli-runs-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it('keeps the working folders of the CLIs in the user data, private to the user', () => {
  const runs = prepareCliRuns(root);

  expect(runs).toBe(join(root, 'cli-runs'));
  expect(statSync(runs).mode & 0o777).toBe(0o700);
});

it('wipes what a crash left behind, frames included, when the app starts', () => {
  const stale = join(root, 'cli-runs', 'sayback-notes-abc');
  mkdirSync(stale, { recursive: true });
  writeFileSync(join(stale, 'frame-0.jpg'), 'screen');

  const runs = prepareCliRuns(root);

  expect(existsSync(stale)).toBe(false);
  expect(existsSync(runs)).toBe(true);
});

it('removes the whole folder when the app closes, and tolerates a second call', () => {
  const runs = prepareCliRuns(root);
  mkdirSync(join(runs, 'sayback-notes-x'));

  clearCliRuns(runs);
  clearCliRuns(runs);

  expect(existsSync(runs)).toBe(false);
});
