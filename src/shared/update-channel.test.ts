import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  APP_BUNDLE_ID,
  APP_BUNDLE_NAME,
  APP_NAME,
  buildInfoSchema,
  packagedChannelRoot,
  toManifestNotes,
  updateManifestSchema,
} from './update-channel';

const root = join(import.meta.dirname, '..', '..');

describe('ce que le canal partage avec la construction', () => {
  it('l’identifiant et le nom de l’app sont ceux d’electron-builder et de package.json', async () => {
    const builder = await readFile(join(root, 'electron-builder.yml'), 'utf8');
    expect(builder).toMatch(new RegExp(`^appId: ${APP_BUNDLE_ID.replaceAll('.', '\\.')}$`, 'm'));
    expect(builder).toMatch(new RegExp(`^productName: ${APP_NAME}$`, 'm'));
    const pkg: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    expect(pkg).toMatchObject({ productName: APP_NAME });
    expect(APP_BUNDLE_NAME).toBe('SayBack.app');
  });

  it('le dossier du canal ne dépend pas du dossier de données', () => {
    expect(packagedChannelRoot('/Users/alex')).toBe(
      '/Users/alex/Library/Application Support/SayBack',
    );
  });
});

describe('notes de publication', () => {
  it('une ligne de 200 caractères au plus, ou rien', () => {
    expect(toManifestNotes('  corrige\nla fermeture\t ')).toBe('corrige la fermeture');
    expect(toManifestNotes(' \n ')).toBeUndefined();
    const long = toManifestNotes('é'.repeat(500));
    expect(long).toHaveLength(200);
    expect(updateManifestSchema.shape.notes.safeParse(long).success).toBe(true);
  });
});

describe('identité du build', () => {
  const info = {
    version: '0.1.0',
    commit: 'a'.repeat(40),
    builtAt: '2026-10-13T10:00:00.000Z',
    localUpdateChannel: true,
  };

  it('accepte une identité complète, et un commit inconnu hors d’un dépôt git', () => {
    expect(buildInfoSchema.parse(info)).toEqual(info);
    expect(buildInfoSchema.safeParse({ ...info, commit: 'inconnu' }).success).toBe(true);
  });

  it('refuse un champ en trop, un commit qui n’en est pas un, une date libre', () => {
    expect(buildInfoSchema.safeParse({ ...info, extra: 1 }).success).toBe(false);
    expect(buildInfoSchema.safeParse({ ...info, commit: '../x' }).success).toBe(false);
    expect(buildInfoSchema.safeParse({ ...info, builtAt: 'hier' }).success).toBe(false);
  });
});
