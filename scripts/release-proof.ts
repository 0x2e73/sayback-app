import { basename, relative } from 'node:path';
import { CODESIGN_PROGRAM, type Capture } from './local-signing.ts';
import { carriesEntitlements, listMachO, nestedBundles } from './mach-o.ts';
import { ReleaseError } from './update-publish.ts';

// Proof, on the bundle a user receives, that every piece of code is signed for notarization:
// hardened runtime, secure timestamp, the project's Developer ID; entitlements on the app and its
// helpers only.

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs a command and returns its exit code and both outputs; never throws on a failure code. */
export type Inspect = (command: string, args: readonly string[]) => Promise<CommandResult>;

export interface ProofIo {
  capture: Capture;
  inspect: Inspect;
  log(line: string): void;
}

/** What is wrong with one signature, from `codesign -dvvv` (written on standard error). */
export function signatureProblems(details: string, team: string): string[] {
  const problems: string[] = [];
  const flags = /^CodeDirectory .*flags=0x[0-9a-f]+\(([^)]*)\)/m.exec(details)?.[1] ?? '';
  if (!flags.split(',').includes('runtime')) problems.push('runtime absent');
  if (!/^Timestamp=/m.test(details)) problems.push('horodatage absent');
  const authority = /^Authority=(.*)$/m.exec(details)?.[1] ?? 'aucune (ad hoc)';
  const developerId = new RegExp(`^Developer ID Application: .+ \\(${team}\\)$`);
  if (!developerId.test(authority)) problems.push(`autorité ${authority}`);
  return problems;
}

/** Keys of an entitlements plist, as `codesign -d --entitlements - --xml` prints it. */
export function entitlementKeys(xml: string): string[] {
  return [...xml.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1] ?? '').sort();
}

async function proveOne(path: string, team: string, expected: readonly string[], io: ProofIo) {
  const shown = await io.inspect(CODESIGN_PROGRAM, ['-dvvv', path]);
  const problems = shown.code === 0 ? signatureProblems(shown.stderr, team) : ['non signé'];
  const granted = await io.inspect(CODESIGN_PROGRAM, ['-d', '--entitlements', '-', '--xml', path]);
  const keys = entitlementKeys(granted.stdout);
  const wanted = carriesEntitlements(path) ? [...expected].sort() : [];
  if (keys.join(',') !== wanted.join(',')) {
    problems.push(`entitlements [${keys.join(', ')}] au lieu de [${wanted.join(', ')}]`);
  }
  return { problems, keys };
}

/**
 * Checks every Mach-O and `.app` bundle of `appPath`; throws with the full list of problems.
 * `expected`: the entitlement keys the app and its helpers must carry, exactly.
 */
export async function proveReleaseBundle(
  appPath: string,
  team: string,
  expected: readonly string[],
  io: ProofIo,
): Promise<void> {
  const apps = (await nestedBundles(appPath)).filter((path) => path.endsWith('.app'));
  const targets = [...(await listMachO(appPath, io.capture)), ...apps, appPath];
  const failures: string[] = [];
  for (const target of targets) {
    const name = relative(appPath, target) || basename(appPath);
    const { problems, keys } = await proveOne(target, team, expected, io);
    if (problems.length > 0) failures.push(`${name} : ${problems.join(', ')}`);
    else io.log(`ok ${name}${keys.length > 0 ? ` [${keys.join(', ')}]` : ''}`);
  }
  if (failures.length > 0) {
    throw new ReleaseError(`signature incomplète :\n  ${failures.join('\n  ')}`);
  }
  io.log(`${String(targets.length)} signatures prouvées : runtime, horodatage, Developer ID`);
}
