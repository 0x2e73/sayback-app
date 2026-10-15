import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildProblems } from './build-output.ts';

// Run by `npm run build` last: fails the build when a page or a preload is missing from `out/`.

const ROOT = join(import.meta.dirname, '..');

function read(path: string): string | null {
  try {
    return readFileSync(join(ROOT, path), 'utf8');
  } catch {
    return null;
  }
}

const problems = buildProblems(read);
if (problems.length > 0) {
  process.stderr.write(`[build-output] ${problems.join('\n[build-output] ')}\n`);
  process.exit(1);
}
process.stdout.write('[build-output] deux pages et deux preloads présents\n');
