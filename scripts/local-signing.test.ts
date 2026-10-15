import { describe, expect, it } from 'vitest';
import {
  CODESIGN_PROGRAM,
  SECURITY_PROGRAM,
  SIGNING_IDENTITY_ENV,
  SigningError,
  certificateLeaf,
  describeSigning,
  keychainEntries,
  resolveIdentity,
  signBundle,
  signingIdentityName,
  type Capture,
  type SigningIo,
} from './local-signing';

// `security` and `codesign` are simulated: the keychain and the signature are OS boundaries; what
// is checked is which identity is chosen, what is asked of codesign and what is proven after.

const NAME = 'SayBack Local Signing';
const HASH = '0123456789ABCDEF0123456789ABCDEF01234567';
const OTHER_HASH = 'A'.repeat(40);
const APP = '/build/dist/mac-arm64/SayBack.app';
const IDENTITY = { name: NAME, hash: HASH };
const SIGNED = `designated => identifier "ch.sayback.desktop" and certificate leaf = H"${HASH.toLowerCase()}"`;
const ADHOC = `# designated => cdhash H"${'d'.repeat(40)}"`;

const entry = (hash: string, name: string, code = 'CSSMERR_TP_NOT_TRUSTED') =>
  `  1) ${hash} "${name}" (${code})`;

function listing(matching: readonly string[], valid: readonly string[] = []): string {
  return [
    '',
    'Policy: Code Signing',
    '  Matching identities',
    ...matching,
    `     ${String(matching.length)} identities found`,
    '',
    '  Valid identities only',
    ...valid,
    `     ${String(valid.length)} valid identities found`,
  ].join('\n');
}

interface Call {
  command: string;
  args: readonly string[];
}

interface FakeSystem {
  keychain?: string;
  /** Output of `codesign -d -r-`. */
  requirement?: string;
  /** The command whose arguments contain this flag fails. */
  failing?: string;
}

function fakeIo(system: FakeSystem = {}) {
  const calls: Call[] = [];
  const capture: Capture = (command, args) => {
    calls.push({ command, args });
    if (system.failing !== undefined && args.includes(system.failing)) {
      return Promise.reject(new Error(`${command} a échoué`));
    }
    if (command === SECURITY_PROGRAM) {
      return Promise.resolve(system.keychain ?? listing([entry(HASH, NAME)]));
    }
    return Promise.resolve(args[0] === '-d' ? `${system.requirement ?? SIGNED}\n` : '');
  };
  const io: SigningIo = { capture, log: () => undefined };
  return { io, capture, calls };
}

describe('signingIdentityName', () => {
  it.each([undefined, '', '   '])('%j : ad hoc', (value) => {
    expect(signingIdentityName({ [SIGNING_IDENTITY_ENV]: value })).toBeNull();
  });

  it('nom nettoyé de ses espaces', () => {
    expect(signingIdentityName({ [SIGNING_IDENTITY_ENV]: ` ${NAME} ` })).toBe(NAME);
  });
});

describe('keychainEntries', () => {
  it('lit l’empreinte d’une identité non approuvée', () => {
    expect(keychainEntries(listing([entry(HASH, NAME)]), NAME)).toEqual([
      { hash: HASH, problem: 'CSSMERR_TP_NOT_TRUSTED' },
    ]);
  });

  it('une identité approuvée, listée deux fois, ne compte qu’une fois', () => {
    const line = `  1) ${HASH} "${NAME}"`;
    expect(keychainEntries(listing([line], [line]), NAME)).toEqual([{ hash: HASH, problem: null }]);
  });

  it('le nom doit être exact, pas un préfixe', () => {
    expect(keychainEntries(listing([entry(HASH, `${NAME} (ancienne)`)]), NAME)).toEqual([]);
  });

  it('trousseau vide : aucune identité', () => {
    expect(keychainEntries(listing([]), NAME)).toEqual([]);
    expect(keychainEntries('', NAME)).toEqual([]);
  });
});

describe('resolveIdentity', () => {
  it('identité non approuvée : retenue, codesign signe avec', async () => {
    const { capture, calls } = fakeIo();
    expect(await resolveIdentity(NAME, capture)).toEqual(IDENTITY);
    expect(calls).toEqual([
      { command: SECURITY_PROGRAM, args: ['find-identity', '-p', 'codesigning'] },
    ]);
  });

  it('identité absente du trousseau : refus nommé', async () => {
    const { capture } = fakeIo({ keychain: listing([entry(OTHER_HASH, 'Autre')]) });
    const resolving = resolveIdentity(NAME, capture);
    await expect(resolving).rejects.toThrow(SigningError);
    await expect(resolving).rejects.toThrow(new RegExp(`${NAME}.*${SIGNING_IDENTITY_ENV}`));
  });

  it('deux certificats du même nom : refus, la signature changerait d’un build à l’autre', async () => {
    const keychain = listing([entry(HASH, NAME), entry(OTHER_HASH, NAME)]);
    await expect(resolveIdentity(NAME, fakeIo({ keychain }).capture)).rejects.toThrow(/plusieurs/);
  });

  it.each([
    ['CSSMERR_TP_CERT_EXPIRED', /a expiré/],
    ['CSSMERR_TP_CERT_REVOKED', /est révoqué/],
  ])('certificat %s : refus clair', async (code, message) => {
    const keychain = listing([entry(HASH, NAME, code)]);
    const resolving = resolveIdentity(NAME, fakeIo({ keychain }).capture);
    await expect(resolving).rejects.toThrow(SigningError);
    await expect(resolving).rejects.toThrow(message);
  });

  it('find-identity échoue : erreur de signature lisible', async () => {
    const resolving = resolveIdentity(NAME, fakeIo({ failing: 'find-identity' }).capture);
    await expect(resolving).rejects.toThrow(SigningError);
    await expect(resolving).rejects.toThrow(/lecture du trousseau impossible/);
  });
});

describe('certificateLeaf', () => {
  it('empreinte de la feuille, en minuscules ; ad hoc : aucune', () => {
    expect(certificateLeaf(SIGNED)).toBe(HASH.toLowerCase());
    expect(certificateLeaf(ADHOC)).toBeNull();
  });

  it('décrit la signature', () => {
    expect(describeSigning(IDENTITY)).toBe(
      `certificat « ${NAME} », certificate leaf = H"${HASH.toLowerCase()}"`,
    );
    expect(describeSigning(null)).toBe('ad hoc');
  });
});

describe('signBundle', () => {
  it('signe par empreinte sans runtime renforcé, vérifie, puis prouve l’exigence désignée', async () => {
    const { io, calls } = fakeIo();
    await signBundle(APP, IDENTITY, io);
    expect(calls).toEqual([
      {
        command: CODESIGN_PROGRAM,
        args: ['--sign', HASH, '--force', '--deep', '--timestamp=none', APP],
      },
      { command: CODESIGN_PROGRAM, args: ['--verify', '--deep', '--strict', APP] },
      { command: CODESIGN_PROGRAM, args: ['-d', '-r-', APP] },
    ]);
    expect(calls[0]?.args.join(' ')).not.toMatch(/runtime|entitlements/);
  });

  it('codesign échoue : l’échec remonte et rien n’est vérifié', async () => {
    const { io, calls } = fakeIo({ failing: '--sign' });
    await expect(signBundle(APP, IDENTITY, io)).rejects.toThrow(/a échoué/);
    expect(calls).toHaveLength(1);
  });

  it('la vérification échoue : l’échec remonte, l’exigence n’est pas lue', async () => {
    const { io, calls } = fakeIo({ failing: '--verify' });
    await expect(signBundle(APP, IDENTITY, io)).rejects.toThrow(/a échoué/);
    expect(calls.some((call) => call.args[0] === '-d')).toBe(false);
  });

  it.each([
    ['resté ad hoc', ADHOC],
    ['un autre certificat', SIGNED.replace(HASH.toLowerCase(), 'b'.repeat(40))],
  ])('exigence désignée %s : refus', async (_case, requirement) => {
    const signing = signBundle(APP, IDENTITY, fakeIo({ requirement }).io);
    await expect(signing).rejects.toThrow(SigningError);
    await expect(signing).rejects.toThrow(/ne nomme pas le certificat/);
  });

  it('exigence désignée illisible : refus', async () => {
    const signing = signBundle(APP, IDENTITY, fakeIo({ requirement: 'Executable=/x' }).io);
    await expect(signing).rejects.toThrow(/exigence désignée illisible/);
  });
});
