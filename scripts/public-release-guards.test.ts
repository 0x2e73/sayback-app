import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_BUNDLE_NAME } from '../src/shared/update-channel';
import { CODESIGN_PROGRAM, SECURITY_PROGRAM } from './local-signing';
import { publicationCommands, runPublicRelease } from './public-release';
import { NOTARY_PROCESS_TIMEOUT_MS, submissionId } from './release-notary';
import {
  DMG_NAME,
  RELEASE_DIR,
  makeRoot,
  mountpoints,
  position,
  setup,
} from './test-public-release-io';

// Machine, keychain, tree after the build, notarization delay and id, release folder, unmount.

let root: string;

beforeEach(async () => {
  root = await makeRoot();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('runPublicRelease : garde-fous de revue', () => {
  it.each([
    ['darwin', 'x64'],
    ['linux', 'arm64'],
  ])('machine %s-%s : refusée avant tout', async (platform, arch) => {
    const { context, calls } = setup(root);
    await expect(runPublicRelease({ ...context, host: { platform, arch } })).rejects.toThrow(
      /Apple silicon/,
    );
    expect(calls).toEqual([]);
  });

  it('le trousseau est lu avec find-identity -v : un certificat non approuvé ne compte pas', async () => {
    const { context, calls } = setup(root, { keychain: '     0 valid identities found\n' });
    await expect(runPublicRelease(context)).rejects.toThrow(/aucune identité/);
    const lookup = calls.find((call) => call.command === SECURITY_PROGRAM);
    expect(lookup?.args).toEqual(['find-identity', '-v', '-p', 'codesigning']);
  });

  it('un fichier suivi modifié par la construction : rien n’est signé', async () => {
    const { context, calls } = setup(root, { dirtyAfterBuild: ' M package-lock.json\n' });
    await expect(runPublicRelease(context)).rejects.toThrow(/après la construction/);
    expect(position(calls, 'npx electron-builder --dir')).toBeGreaterThan(-1);
    expect(position(calls, `${CODESIGN_PROGRAM} --sign`)).toBe(-1);
  });

  it('la soumission n’est pas tuée avant le --timeout 1h de notarytool', async () => {
    const { context, timeouts } = setup(root);
    await runPublicRelease(context);
    expect(timeouts).toEqual([NOTARY_PROCESS_TIMEOUT_MS]);
    expect(NOTARY_PROCESS_TIMEOUT_MS).toBeGreaterThan(65 * 60 * 1000);
  });

  it('soumission sans verdict mais avec un id : l’id et la commande de suivi sont donnés', async () => {
    const id = '2efe2717-52ef-43a5-96dc-0797e4ca1041';
    const notary = { code: 1, stdout: '', stderr: `  id: ${id}\nTimeout: wait exceeded` };
    const { context } = setup(root, { notary });
    await expect(runPublicRelease(context)).rejects.toThrow(
      `notarytool info ${id} --keychain-profile sayback-notary`,
    );
  });

  it('soumission sans id du tout : dit qu’aucun identifiant n’a été reçu', async () => {
    const notary = { code: 69, stdout: '', stderr: 'network down' };
    await expect(runPublicRelease(setup(root, { notary }).context)).rejects.toThrow(
      /aucun identifiant de soumission/,
    );
  });

  it('dossier de sortie par commit, vidé au début ; npm run dist n’y écrit pas', async () => {
    await mkdir(join(root, RELEASE_DIR), { recursive: true });
    await writeFile(join(root, RELEASE_DIR, 'SHA256SUMS'), 'périmé');
    await writeFile(join(root, RELEASE_DIR, 'SayBack-0.0.9-arm64.dmg'), 'ancien');
    const { context } = setup(root);
    const result = await runPublicRelease(context);
    expect((await readdir(join(root, RELEASE_DIR))).sort()).toEqual(
      [DMG_NAME, 'SHA256SUMS'].sort(),
    );
    expect(publicationCommands(result).at(-1)).toContain(join(root, RELEASE_DIR, DMG_NAME));
    await expect(stat(join(root, 'dist', DMG_NAME))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('détachement refusé : réessayé avec -force, puis le point de montage est retiré', async () => {
    const { context, calls, logs } = setup(root, { detach: [16, 0] });
    await runPublicRelease(context);
    const detaches = calls.filter((call) => call.args[0] === 'detach').map((call) => call.args);
    const [mountpoint] = mountpoints(calls);
    expect(detaches).toEqual([
      ['detach', mountpoint],
      ['detach', mountpoint, '-force'],
    ]);
    expect(logs.join('\n')).not.toMatch(/toujours monté/);
  });

  it('détachement impossible même forcé : le point de montage restant est journalisé', async () => {
    const { context, calls, logs } = setup(root, { detach: [16, 16] });
    await runPublicRelease(context);
    const [mountpoint] = mountpoints(calls);
    expect(logs.join('\n')).toContain(`dmg toujours monté sur ${mountpoint ?? ''}`);
    // Never removed while mounted: the copy of the app is still there.
    expect((await stat(join(mountpoint ?? '', APP_BUNDLE_NAME))).isDirectory()).toBe(true);
    await rm(mountpoint ?? '', { recursive: true, force: true });
  });

  it('montage en échec : aucun détachement tenté, le dossier vide est retiré', async () => {
    const { context, calls } = setup(root, { attachFails: true });
    await expect(runPublicRelease(context)).rejects.toThrow(/attach failed/);
    expect(calls.filter((call) => call.args[0] === 'detach')).toEqual([]);
    const [mountpoint] = mountpoints(calls);
    await expect(stat(mountpoint ?? '')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('submissionId', () => {
  it('prend l’id du JSON, sinon un UUID dans l’une ou l’autre sortie, sinon rien', () => {
    const uuid = '2efe2717-52ef-43a5-96dc-0797e4ca1041';
    expect(submissionId({ code: 1, stdout: '{"id":"abc","status":"Invalid"}', stderr: '' })).toBe(
      'abc',
    );
    expect(submissionId({ code: 1, stdout: `id: ${uuid}`, stderr: '' })).toBe(uuid);
    expect(submissionId({ code: 1, stdout: '', stderr: `id: ${uuid}` })).toBe(uuid);
    expect(submissionId({ code: 1, stdout: '', stderr: '' })).toBeNull();
  });
});
