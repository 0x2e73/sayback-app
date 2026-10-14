import {
  LOCAL_UPDATE_CHANNEL_ENV,
  buildInfoSchema,
  type BuildInfo,
} from '../src/shared/update-channel.ts';

export interface BuildIdentityInput {
  version: unknown;
  commit: string;
  builtAt: string;
  env: Readonly<Record<string, string | undefined>>;
}

/**
 * The identity written into the bundle. The local channel is CLOSED unless the build explicitly
 * asks for it (`SAYBACK_LOCAL_UPDATE_CHANNEL=1`, set by `npm run update:publish`): an ordinary
 * `npm run dist` of the public repository never ships it. Validated with the schema the app
 * applies when reading: an identity it would refuse is not produced.
 */
export function createBuildInfo(input: BuildIdentityInput): BuildInfo {
  return buildInfoSchema.parse({
    version: input.version,
    commit: input.commit,
    builtAt: input.builtAt,
    localUpdateChannel: input.env[LOCAL_UPDATE_CHANNEL_ENV] === '1',
  });
}
