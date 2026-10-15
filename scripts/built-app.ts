import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_BUNDLE_NAME } from '../src/shared/update-channel.ts';
import { ReleaseError } from './update-publish.ts';

/** Output folders to look in: this machine's architecture first, then any other `mac…`. */
function outputOrder(outputs: readonly string[]): string[] {
  const preferred = `mac-${process.arch}`;
  const others = outputs.filter((name) => name.startsWith('mac') && name !== preferred).sort();
  return outputs.includes(preferred) ? [preferred, ...others] : others;
}

/** The bundle electron-builder built in `tree`: `SayBack.app` in `dist/mac-<arch>`. */
export async function findBuiltApp(tree: string): Promise<string> {
  const distDir = join(tree, 'dist');
  const outputs = await readdir(distDir).catch((): string[] => []);
  for (const name of outputOrder(outputs)) {
    const candidate = join(distDir, name, APP_BUNDLE_NAME);
    const found = await stat(candidate).then(
      (info) => info.isDirectory(),
      () => false,
    );
    if (found) return candidate;
  }
  throw new ReleaseError(`aucun ${APP_BUNDLE_NAME} dans ${distDir}`);
}
