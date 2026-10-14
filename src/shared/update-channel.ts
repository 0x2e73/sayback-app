import { z } from 'zod';

// Local update channel: what the publish script writes and what the app reads, defined once for
// both sides. Imports nothing from the repository: Node loads it as is from `scripts/`.

/** Name given to Electron (`app.setName`) and electron-builder's `productName`. */
export const APP_NAME = 'SayBack';
/** `CFBundleIdentifier` of the bundle (`appId` in electron-builder.yml, checked by a test). */
export const APP_BUNDLE_ID = 'ch.sayback.desktop';
export const APP_BUNDLE_NAME = `${APP_NAME}.app`;
export const APP_EXECUTABLE_NAME = APP_NAME;

/** Channel folder, under `appData/SayBack` whatever the data folder is. */
export const UPDATES_DIR_NAME = 'updates';
/** The manifest, written last and atomically. */
export const UPDATE_MANIFEST_NAME = 'latest.json';
export const UPDATE_MANIFEST_MAX_BYTES = 64 * 1024;
/** app.asar weighs a few dozen MB; beyond this cap it is not ours and is not hashed. */
export const ASAR_MAX_BYTES = 1024 * 1024 * 1024;
/** Build identity, written by `scripts/build-info.ts` into `out/` (so into app.asar). */
export const BUILD_INFO_FILE_NAME = 'build-info.json';
/** `commit` of a build made outside a git repository. */
export const BUILD_COMMIT_UNKNOWN = 'inconnu';
/** Read at BUILD time: `0` builds an app without the local channel. */
export const LOCAL_UPDATE_CHANNEL_ENV = 'SAYBACK_LOCAL_UPDATE_CHANNEL';

/** `appData/SayBack` of the packaged app on macOS: the publish script writes there. */
export function packagedChannelRoot(homeDir: string): string {
  return `${homeDir}/Library/Application Support/${APP_NAME}`;
}

const NOTES_MAX = 200;

const versionSchema = z
  .string()
  .max(64)
  .regex(/^[0-9A-Za-z][0-9A-Za-z.+-]*$/);
/** A git commit, full (SHA-1 or SHA-256) or abbreviated. */
const commitSchema = z.string().regex(/^[0-9a-f]{7,64}$/);
const builtAtSchema = z.iso.datetime();
/** A single path segment ending in `.app`: never `/`, `\` or a leading dot. */
const bundleNameSchema = z
  .string()
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]*\.app$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
/** One line: no control character. */
const notesSchema = z
  .string()
  .min(1)
  .max(NOTES_MAX)
  .regex(/^\P{Cc}+$/u);

/** `updates/latest.json`. Strict: an unknown field is a refusal. */
export const updateManifestSchema = z.strictObject({
  version: versionSchema,
  commit: commitSchema,
  builtAt: builtAtSchema,
  bundle: bundleNameSchema,
  /** SHA-256 of `Contents/Resources/app.asar`. */
  sha256: sha256Schema,
  notes: notesSchema.optional(),
});
export type UpdateManifest = z.infer<typeof updateManifestSchema>;

/** `out/build-info.json`: who the running build is, and whether it carries the local channel. */
export const buildInfoSchema = z.strictObject({
  version: versionSchema,
  commit: z.union([commitSchema, z.literal(BUILD_COMMIT_UNKNOWN)]),
  builtAt: builtAtSchema,
  localUpdateChannel: z.boolean(),
});
export type BuildInfo = z.infer<typeof buildInfoSchema>;

/** Cleans a release note so it fits the manifest; `undefined` when nothing is left. */
export function toManifestNotes(raw: string): string | undefined {
  const line = raw
    .replace(/\p{Cc}+/gu, ' ')
    .trim()
    .slice(0, NOTES_MAX)
    .trim();
  return line === '' ? undefined : line;
}
