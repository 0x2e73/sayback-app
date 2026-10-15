import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChannelReader } from '../src/backend/infrastructure/update-channel-reader';
import { ADHOC_REQUIREMENT, IDENTITY, SIGNED_REQUIREMENT, fakeIo, ran } from './test-release-io';
import { ReleaseError, runRelease, type ReleaseIo } from './update-release';

// The signature policy of `runRelease`: ad hoc only on request, an unusable certificate refused
// before any build, and never an ad-hoc bundle over one signed by certificate.

const RUNNING = { commit: 'a'.repeat(40), builtAt: '2026-10-13T10:00:00.000Z' };
const uid = process.getuid?.() ?? 0;
const SIGNED = { allowDirty: false, adhoc: false };
const ADHOC = { allowDirty: false, adhoc: true };

let root: string;
let channelRoot: string;
let updatesDir: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-release-signing-')));
  channelRoot = join(root, 'Application Support', 'SayBack');
  updatesDir = join(channelRoot, 'updates');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const context = (io: ReleaseIo, signingIdentity: string | null = IDENTITY.name) => ({
  repoRoot: root,
  channelRoot,
  io,
  signingIdentity,
});

const offered = () => createChannelReader({ updatesDir, uid }).read(RUNNING);

describe('choix de la signature, avant tout build', () => {
  it('certificat présent : publié signé, et le résultat le dit', async () => {
    const { signing } = await runRelease(SIGNED, context(fakeIo().io));
    expect(signing).toEqual(IDENTITY);
  });

  it('sans SAYBACK_SIGNING_IDENTITY ni --adhoc : refus avant toute commande', async () => {
    const { io, calls } = fakeIo({ builtRequirement: ADHOC_REQUIREMENT });
    const release = runRelease(SIGNED, context(io, null));
    await expect(release).rejects.toThrow(ReleaseError);
    await expect(release).rejects.toThrow(/SAYBACK_SIGNING_IDENTITY absente.*--adhoc/);
    expect(calls).toEqual([]);
    await expect(stat(updatesDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('--adhoc : publié ad hoc, sans consulter le trousseau', async () => {
    const { io, calls } = fakeIo({ builtRequirement: ADHOC_REQUIREMENT });
    const { manifest, signing } = await runRelease(ADHOC, context(io, null));
    expect(signing).toBeNull();
    expect(ran(calls)).not.toContain('/usr/bin/security find-identity -p');
    expect(await offered()).toEqual({ kind: 'available', manifest });
  });

  it('--adhoc avec une identité nommée : refus, il faut choisir', async () => {
    const { io, calls } = fakeIo();
    await expect(runRelease(ADHOC, context(io))).rejects.toThrow(/choisissez/);
    expect(calls).toEqual([]);
  });

  it.each([
    ['absent', '     0 identities found\n', /aucune identité de signature/],
    ['expiré', `  1) ${IDENTITY.hash} "${IDENTITY.name}" (CSSMERR_TP_CERT_EXPIRED)\n`, /a expiré/],
  ])(
    'certificat %s : refus en quelques secondes, aucune copie créée',
    async (_c, keychain, error) => {
      const { io, calls } = fakeIo({ keychain });
      const release = runRelease(SIGNED, context(io));
      await expect(release).rejects.toThrow(ReleaseError);
      await expect(release).rejects.toThrow(error);
      expect(ran(calls)).toEqual(['/usr/bin/security find-identity -p']);
    },
  );
});

describe('signature du paquet construit', () => {
  it('paquet construit resté ad hoc malgré le certificat : refus, rien de publié', async () => {
    const { io } = fakeIo({ builtRequirement: ADHOC_REQUIREMENT });
    await expect(runRelease(SIGNED, context(io))).rejects.toThrow(/n’est pas signé par/);
    await expect(stat(updatesDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('une app ad hoc ne remplace jamais une app signée par certificat, même avec --adhoc', async () => {
    const first = await runRelease(SIGNED, context(fakeIo().io));
    const { io } = fakeIo({
      builtRequirement: ADHOC_REQUIREMENT,
      publishedRequirement: SIGNED_REQUIREMENT,
    });
    await expect(runRelease(ADHOC, context(io, null))).rejects.toThrow(
      /signée par certificat.*perdrait ses autorisations/,
    );
    expect(await offered()).toEqual({ kind: 'available', manifest: first.manifest });
  });

  it('ad hoc par-dessus ad hoc : accepté', async () => {
    const adhocIo = () => fakeIo({ builtRequirement: ADHOC_REQUIREMENT }).io;
    await runRelease(ADHOC, context(adhocIo(), null));
    const { signing } = await runRelease(ADHOC, context(adhocIo(), null));
    expect(signing).toBeNull();
  });
});
