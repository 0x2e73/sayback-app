import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256Of } from '../src/backend/infrastructure/test-bundle';
import { LOCAL_UPDATE_CHANNEL_ENV } from '../src/shared/update-channel';
import { CODESIGN_PROGRAM } from './local-signing';
import { PUBLIC_RELEASE_STEPS, publicationCommands, runPublicRelease } from './public-release';
import { HDIUTIL_PROGRAM, SPCTL_PROGRAM, XCRUN_PROGRAM, notaryVerdict } from './release-notary';
import { COMMIT, INFO, ran } from './test-release-io';
import { DMG_NAME, RELEASE_DIR, makeRoot, position, setup } from './test-public-release-io';

// The whole release with every OS boundary simulated: guards and order of the steps, not the
// exact command lines.

let root: string;

beforeEach(async () => {
  root = await makeRoot();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('runPublicRelease : garde-fous', () => {
  it('arbre de travail modifié : rien n’est construit', async () => {
    const { context, calls } = setup(root, { dirty: ' M src/main/index.ts\n' });
    await expect(runPublicRelease(context)).rejects.toThrow(/non commitées/);
    expect(position(calls, 'npm run')).toBe(-1);
  });

  it('identité absente : refusée avant tout', async () => {
    const { context, calls } = setup(root);
    await expect(runPublicRelease({ ...context, identityName: null })).rejects.toThrow(/absente/);
    expect(calls).toEqual([]);
  });

  it('identité qui n’est pas le Developer ID de l’équipe : refusée avant tout', async () => {
    const { context, calls } = setup(root);
    const local = { ...context, identityName: 'SayBack Local Signing' };
    await expect(runPublicRelease(local)).rejects.toThrow(/version publique/);
    expect(calls).toEqual([]);
  });

  it('Developer ID absent du trousseau : refusé avant la construction', async () => {
    const { context, calls } = setup(root, { keychain: '     0 identities found\n' });
    await expect(runPublicRelease(context)).rejects.toThrow(/aucune identité/);
    expect(position(calls, 'npm run')).toBe(-1);
  });

  it('paquet qui porte le canal local : arrêt avant la signature', async () => {
    const { context, calls } = setup(root, { localUpdateChannel: true });
    await expect(runPublicRelease(context)).rejects.toThrow(/canal de mise à jour local/);
    expect(position(calls, `${CODESIGN_PROGRAM} --sign`)).toBe(-1);
  });

  it('étape en échec : la suivante ne part pas', async () => {
    const { context, calls } = setup(root, { failAt: 'check' });
    await expect(runPublicRelease(context)).rejects.toThrow(/« check » en échec/);
    expect(position(calls, 'npm run build')).toBe(-1);
  });

  it.each([
    [
      'Invalid, code non nul',
      { code: 1, stdout: '{"id":"abc-123","status":"Invalid"}', stderr: '' },
    ],
    ['Invalid, code nul', { code: 0, stdout: '{"id":"abc-123","status":"Invalid"}', stderr: '' }],
    [
      'Accepted mais code non nul',
      { code: 2, stdout: '{"id":"abc-123","status":"Accepted"}', stderr: '' },
    ],
  ])('notarisation %s : journal affiché, rien n’est agrafé', async (_, notary) => {
    const { context, calls } = setup(root, { notary });
    await expect(runPublicRelease(context)).rejects.toThrow(
      `${XCRUN_PROGRAM} notarytool info abc-123 --keychain-profile sayback-notary`,
    );
    expect(ran(calls)).toContain(`${XCRUN_PROGRAM} notarytool log`);
    expect(position(calls, `${XCRUN_PROGRAM} stapler`)).toBe(-1);
  });

  it('notarytool sans verdict (profil absent…) : arrêt, erreur montrée', async () => {
    const notary = { code: 69, stdout: '', stderr: 'No Keychain password item found for profile' };
    const { context } = setup(root, { notary });
    await expect(runPublicRelease(context)).rejects.toThrow(/aucun verdict \(code 69\).*profile/);
  });

  it('aucun dmg produit : arrêt', async () => {
    const { context } = setup(root, { dmgs: [] });
    await expect(runPublicRelease(context)).rejects.toThrow(/un seul dmg/);
  });
});

describe('runPublicRelease : ordre', () => {
  it('construit, signe, fait le dmg, notarise, agrafe, prouve, puis la somme', async () => {
    const { context, calls } = setup(root);
    const result = await runPublicRelease(context);
    const order = [
      'npm run check',
      'npm run build',
      'npx electron-builder --dir',
      `${CODESIGN_PROGRAM} --sign`,
      'node scripts/dist-cli.ts',
      `${XCRUN_PROGRAM} notarytool submit`,
      `${XCRUN_PROGRAM} stapler staple`,
      `${HDIUTIL_PROGRAM} attach`,
      `${SPCTL_PROGRAM} -a`,
      `${HDIUTIL_PROGRAM} detach`,
      `${XCRUN_PROGRAM} stapler validate`,
    ].map((prefix) => position(calls, prefix));
    expect(order).not.toContain(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const dmg = join(root, RELEASE_DIR, DMG_NAME);
    expect(result).toEqual({
      version: INFO.version,
      commit: COMMIT,
      dmg,
      checksums: join(root, RELEASE_DIR, 'SHA256SUMS'),
    });
    expect(await readFile(result.checksums, 'utf8')).toBe(`${sha256Of('dmg')}  ${DMG_NAME}\n`);
  });

  it('chaque étape de construction ferme le canal local', async () => {
    const { context, calls } = setup(root);
    await runPublicRelease(context);
    const steps = calls.filter((call) => call.env !== undefined);
    expect(steps).toHaveLength(PUBLIC_RELEASE_STEPS.length);
    for (const step of steps) expect(step.env).toEqual({ [LOCAL_UPDATE_CHANNEL_ENV]: '0' });
  });

  it('un vieux dmg est retiré avant d’en faire un nouveau', async () => {
    const { context } = setup(root);
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(join(root, 'dist', 'SayBack-0.0.9-arm64.dmg'), 'ancien');
    const result = await runPublicRelease(context);
    expect(result.dmg).toBe(join(root, RELEASE_DIR, DMG_NAME));
  });
});

describe('notaryVerdict', () => {
  it.each(['', 'pas du json', '{"status":"Accepted"}', '[]'])('%j : aucun verdict', (stdout) => {
    expect(notaryVerdict(stdout)).toBeNull();
  });
});

describe('publicationCommands', () => {
  it('tag, push, brouillon : rien de plus', () => {
    const result = {
      version: '0.1.0',
      commit: COMMIT,
      dmg: '/r/dist/S.dmg',
      checksums: '/r/dist/SHA256SUMS',
    };
    expect(publicationCommands(result)).toEqual([
      `git tag v0.1.0 ${COMMIT}`,
      'git push origin v0.1.0',
      'gh release create v0.1.0 --verify-tag --draft "/r/dist/S.dmg" "/r/dist/SHA256SUMS"',
    ]);
  });
});
