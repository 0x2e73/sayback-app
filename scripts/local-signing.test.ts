import { describe, expect, it } from 'vitest';
import {
  CODESIGN_PROGRAM,
  SECURITY_PROGRAM,
  SIGNING_IDENTITY_ENV,
  SigningError,
  identityHashes,
  signBundle,
  type SigningIo,
} from './local-signing';

// `signBundle` with simulated `security` and `codesign`: the keychain and the signature are OS
// boundaries; what is checked is which identity is chosen and what is asked of codesign.

const NAME = 'SayBack Local Signing';
const HASH = '0123456789ABCDEF0123456789ABCDEF01234567';
const OTHER_HASH = 'A'.repeat(40);
const APP = '/build/dist/mac-arm64/SayBack.app';

const untrusted = (hash: string, name: string) => `  1) ${hash} "${name}" (CSSMERR_TP_NOT_TRUSTED)`;

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

function fakeIo(keychain: string, failing?: string) {
  const calls: Call[] = [];
  const io: SigningIo = {
    capture: (command, args) => {
      calls.push({ command, args });
      if (failing !== undefined && args.includes(failing)) {
        return Promise.reject(new Error(`${command} a échoué`));
      }
      return Promise.resolve(command === SECURITY_PROGRAM ? keychain : '');
    },
    log: () => undefined,
  };
  return { io, calls };
}

describe('identityHashes', () => {
  it('lit l’empreinte d’une identité non approuvée', () => {
    expect(identityHashes(listing([untrusted(HASH, NAME)]), NAME)).toEqual([HASH]);
  });

  it('une identité approuvée, listée deux fois, ne compte qu’une fois', () => {
    const line = `  1) ${HASH} "${NAME}"`;
    expect(identityHashes(listing([line], [line]), NAME)).toEqual([HASH]);
  });

  it('le nom doit être exact, pas un préfixe', () => {
    const output = listing([untrusted(HASH, `${NAME} (ancienne)`)]);
    expect(identityHashes(output, NAME)).toEqual([]);
  });

  it('trousseau vide : aucune identité', () => {
    expect(identityHashes(listing([]), NAME)).toEqual([]);
    expect(identityHashes('', NAME)).toEqual([]);
  });
});

describe('signBundle', () => {
  it.each([undefined, '', '   '])(
    'variable %j : la signature ad hoc reste, rien n’est lancé',
    async (identity) => {
      const { io, calls } = fakeIo(listing([untrusted(HASH, NAME)]));
      expect(await signBundle(APP, identity, io)).toEqual({ kind: 'adhoc' });
      expect(calls).toEqual([]);
    },
  );

  it('identité présente : signe le paquet par son empreinte, sans runtime renforcé, puis vérifie', async () => {
    const { io, calls } = fakeIo(listing([untrusted(HASH, NAME)]));
    expect(await signBundle(APP, ` ${NAME} `, io)).toEqual({ kind: 'identity', hash: HASH });
    expect(calls).toEqual([
      { command: SECURITY_PROGRAM, args: ['find-identity', '-p', 'codesigning'] },
      {
        command: CODESIGN_PROGRAM,
        args: ['--sign', HASH, '--force', '--deep', '--timestamp=none', APP],
      },
      { command: CODESIGN_PROGRAM, args: ['--verify', '--deep', '--strict', APP] },
    ]);
    expect(calls[1]?.args.join(' ')).not.toMatch(/runtime|entitlements/);
  });

  it('identité absente du trousseau : refus nommé, aucune signature', async () => {
    const { io, calls } = fakeIo(listing([untrusted(OTHER_HASH, 'Autre')]));
    const signing = signBundle(APP, NAME, io);
    await expect(signing).rejects.toThrow(SigningError);
    await expect(signing).rejects.toThrow(new RegExp(`${NAME}.*${SIGNING_IDENTITY_ENV}`));
    expect(calls.map((call) => call.command)).toEqual([SECURITY_PROGRAM]);
  });

  it('deux certificats du même nom : refus, la signature changerait d’un build à l’autre', async () => {
    const { io, calls } = fakeIo(listing([untrusted(HASH, NAME), untrusted(OTHER_HASH, NAME)]));
    await expect(signBundle(APP, NAME, io)).rejects.toThrow(/plusieurs/);
    expect(calls.map((call) => call.command)).toEqual([SECURITY_PROGRAM]);
  });

  it('codesign échoue : l’échec remonte et rien n’est vérifié', async () => {
    const { io, calls } = fakeIo(listing([untrusted(HASH, NAME)]), '--sign');
    await expect(signBundle(APP, NAME, io)).rejects.toThrow(/a échoué/);
    expect(calls.some((call) => call.args.includes('--verify'))).toBe(false);
  });
});
