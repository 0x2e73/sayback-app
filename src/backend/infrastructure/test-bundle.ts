import { createHash } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_BUNDLE_ID, APP_EXECUTABLE_NAME } from '../../shared/update-channel';

// Test support: a fake `.app` with only what the update channel checks (Info.plist, executable,
// app.asar), nothing from Electron inside.

export interface FakeBundleOptions {
  asar: string;
  identifier?: string;
  executable?: string;
  /** Raw Info.plist text, instead of the generated one. */
  plist?: string;
  withExecutable?: boolean;
}

export function sha256Of(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

export function fakePlist(identifier: string, executable: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '  <dict>',
    '    <key>CFBundleExecutable</key>',
    `    <string>${executable}</string>`,
    '    <key>CFBundleIdentifier</key>',
    `    <string>${identifier}</string>`,
    '  </dict>',
    '</plist>',
    '',
  ].join('\n');
}

/** Writes the fake bundle and returns the SHA-256 of its app.asar. */
export async function writeFakeBundle(
  bundlePath: string,
  options: FakeBundleOptions,
): Promise<string> {
  const executableName = options.executable ?? APP_EXECUTABLE_NAME;
  const contents = join(bundlePath, 'Contents');
  await mkdir(join(contents, 'MacOS'), { recursive: true });
  await mkdir(join(contents, 'Resources'), { recursive: true });
  await writeFile(
    join(contents, 'Info.plist'),
    options.plist ?? fakePlist(options.identifier ?? APP_BUNDLE_ID, executableName),
  );
  if (options.withExecutable !== false) {
    const executable = join(contents, 'MacOS', executableName);
    await writeFile(executable, '#!/bin/sh\nexit 0\n');
    await chmod(executable, 0o755);
  }
  await writeFile(join(contents, 'Resources', 'app.asar'), options.asar);
  return sha256Of(options.asar);
}
