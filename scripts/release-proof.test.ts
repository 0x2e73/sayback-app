import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CODESIGN_PROGRAM, RELEASE_TEAM_ID } from './local-signing';
import { FILE_PROGRAM } from './mach-o';
import {
  entitlementKeys,
  proveReleaseBundle,
  signatureProblems,
  type CommandResult,
  type ProofIo,
} from './release-proof';

// `codesign -dvvv` details in the shape codesign prints them; the bundle folder is real.

const TEAM = RELEASE_TEAM_ID;
const JIT = 'com.apple.security.cs.allow-jit';
const MIC = 'com.apple.security.device.audio-input';

function details(options: { flags?: string; authority?: string; timestamp?: boolean } = {}) {
  return [
    'Executable=/x/SayBack.app/Contents/MacOS/SayBack',
    'Identifier=ch.sayback.desktop',
    'Format=app bundle with Mach-O thin (arm64)',
    `CodeDirectory v=20500 size=1234 flags=${options.flags ?? '0x10000(runtime)'} hashes=27+7 location=embedded`,
    `Authority=${options.authority ?? `Developer ID Application: Jane Doe (${TEAM})`}`,
    'Authority=Developer ID Certification Authority',
    'Authority=Apple Root CA',
    ...(options.timestamp === false
      ? ['Signed Time=17 Nov 2026']
      : ['Timestamp=17 Nov 2026 at 10:00:00']),
    'TeamIdentifier=AQ6TKNAF9V',
    '',
  ].join('\n');
}

const plist = (keys: readonly string[]) =>
  `<?xml version="1.0"?><plist version="1.0"><dict>${keys.map((key) => `<key>${key}</key><true/>`).join('')}</dict></plist>`;

describe('signatureProblems', () => {
  it('runtime, horodatage et Developer ID de l’équipe : rien à redire', () => {
    expect(signatureProblems(details(), TEAM)).toEqual([]);
  });

  it('runtime parmi d’autres drapeaux : accepté', () => {
    expect(signatureProblems(details({ flags: '0x10002(adhoc,runtime)' }), TEAM)).toEqual([]);
  });

  it('ad hoc : pas de runtime, pas d’horodatage, pas d’autorité', () => {
    const adhoc = 'CodeDirectory v=20400 size=9 flags=0x2(adhoc) hashes=1+0\nSignature=adhoc\n';
    expect(signatureProblems(adhoc, TEAM)).toEqual([
      'runtime absent',
      'horodatage absent',
      'autorité aucune (ad hoc)',
    ]);
  });

  it('signé sans horodatage sécurisé', () => {
    expect(signatureProblems(details({ timestamp: false }), TEAM)).toEqual(['horodatage absent']);
  });

  it('une autre équipe ou un certificat de développement est refusé', () => {
    const other = details({ authority: 'Developer ID Application: Someone (ZZZZZ99999)' });
    expect(signatureProblems(other, TEAM)).toHaveLength(1);
    const development = details({ authority: `Apple Development: Jane Doe (${TEAM})` });
    expect(signatureProblems(development, TEAM)).toHaveLength(1);
  });

  it('sortie vide : tout manque', () => {
    expect(signatureProblems('', TEAM)).toHaveLength(3);
  });
});

describe('entitlementKeys', () => {
  it('lit les clés, triées', () => {
    expect(entitlementKeys(plist([MIC, JIT]))).toEqual([JIT, MIC]);
  });

  it('aucun entitlement : liste vide', () => {
    expect(entitlementKeys('')).toEqual([]);
  });
});

let root: string;
let app: string;
const EXECUTABLE = 'Contents/MacOS/SayBack';
const SHIPIT = 'Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt';

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-proof-')));
  app = join(root, 'SayBack.app');
  for (const file of [EXECUTABLE, SHIPIT]) {
    await mkdir(join(app, file, '..'), { recursive: true });
    await writeFile(join(app, file), file);
  }
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Every path signed properly, except those listed in `adhoc`; entitlements as given. */
const NONE = (): string[] => [];

function fakeProofIo(
  adhoc: readonly string[] = [],
  entitlements: (path: string) => string[] = NONE,
) {
  const logs: string[] = [];
  const io: ProofIo = {
    capture: (command, args) => {
      if (command !== FILE_PROGRAM) return Promise.reject(new Error(command));
      const files = args.slice(args.indexOf('--') + 1);
      return Promise.resolve(
        files.map((path) => `${path}\0: Mach-O 64-bit executable arm64\n`).join(''),
      );
    },
    inspect: (command, args): Promise<CommandResult> => {
      const path = args.at(-1) ?? '';
      if (command !== CODESIGN_PROGRAM) return Promise.reject(new Error(command));
      if (args[0] === '-dvvv') {
        const signed = !adhoc.some((end) => path.endsWith(end));
        const stderr = signed ? details() : 'CodeDirectory flags=0x2(adhoc)\nSignature=adhoc\n';
        return Promise.resolve({ code: 0, stdout: '', stderr });
      }
      const keys = entitlements(path);
      return Promise.resolve({ code: 0, stdout: keys.length > 0 ? plist(keys) : '', stderr: '' });
    },
    log: (line) => logs.push(line),
  };
  return { io, logs };
}

const appEntitlements = (path: string) =>
  path.endsWith('.app') || path.endsWith('/MacOS/SayBack') ? [JIT, MIC] : [];

describe('proveReleaseBundle', () => {
  it('tout est signé pour la notarisation : chaque cible est prouvée', async () => {
    const { io, logs } = fakeProofIo([], appEntitlements);
    await proveReleaseBundle(app, TEAM, [MIC, JIT], io);
    expect(logs.at(-1)).toMatch(/^3 signatures prouvées/);
  });

  it('un binaire resté ad hoc fait échouer et est nommé', async () => {
    const { io } = fakeProofIo(['ShipIt'], appEntitlements);
    await expect(proveReleaseBundle(app, TEAM, [MIC, JIT], io)).rejects.toThrow(
      /ShipIt : runtime absent, horodatage absent/,
    );
  });

  it('l’app sans le micro fait échouer', async () => {
    const { io } = fakeProofIo([], (path) => (path.endsWith('.app') ? [JIT] : []));
    await expect(proveReleaseBundle(app, TEAM, [MIC, JIT], io)).rejects.toThrow(/entitlements/);
  });

  it('un entitlement sur une bibliothèque fait échouer', async () => {
    const { io } = fakeProofIo([], (path) =>
      path.endsWith('ShipIt') ? [JIT] : appEntitlements(path),
    );
    await expect(proveReleaseBundle(app, TEAM, [MIC, JIT], io)).rejects.toThrow(
      /ShipIt : entitlements/,
    );
  });

  it('codesign ne lit aucune signature : non signé', async () => {
    const { io } = fakeProofIo([], appEntitlements);
    const unsigned: ProofIo = {
      ...io,
      inspect: async (command, args) =>
        args[0] === '-dvvv'
          ? { code: 1, stdout: '', stderr: 'code object is not signed at all' }
          : io.inspect(command, args),
    };
    await expect(proveReleaseBundle(app, TEAM, [MIC, JIT], unsigned)).rejects.toThrow(/non signé/);
  });

  it('bundle absent : échoue', async () => {
    const { io } = fakeProofIo();
    await expect(proveReleaseBundle(join(root, 'Absent.app'), TEAM, [], io)).rejects.toThrow();
  });
});
