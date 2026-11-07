import { stat } from 'node:fs/promises';
import {
  SIGNING_IDENTITY_ENV,
  SigningError,
  readDesignatedRequirement,
  requirementNamesIdentity,
  resolveIdentity,
  signedByCertificate,
  type Capture,
  type SigningIdentity,
} from './local-signing.ts';
import { ReleaseError } from './update-publish.ts';

// The signature policy of `npm run update:publish`. A bundle signed by certificate keeps the
// macOS permissions of the one it replaces; an ad-hoc one silently loses them. So ad hoc is only
// published on request, and never over a bundle signed by certificate.

async function asReleaseError<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof SigningError) throw new ReleaseError(error.message);
    throw error;
  }
}

/**
 * The signature the release will carry, decided before anything is built, so that an absent,
 * duplicate or expired certificate fails in seconds. Ad hoc only with `--adhoc`.
 */
export async function chooseSigning(
  adhoc: boolean,
  identityName: string | null,
  capture: Capture,
): Promise<SigningIdentity | null> {
  if (adhoc && identityName !== null) {
    throw new ReleaseError(
      `--adhoc et ${SIGNING_IDENTITY_ENV} ensemble : choisissez l’un des deux`,
    );
  }
  if (adhoc) return null;
  if (identityName === null) {
    throw new ReleaseError(
      `${SIGNING_IDENTITY_ENV} absente : l’app publiée serait signée ad hoc et macOS lui retirerait ses autorisations. Exportez-la, ou relancez avec --adhoc`,
    );
  }
  return asReleaseError(() => resolveIdentity(identityName, capture));
}

/** The bundle the channel offers today is signed by certificate; not when absent or unreadable. */
async function publishedSigned(publishedApp: string, capture: Capture): Promise<boolean> {
  const present = await stat(publishedApp).then(
    (info) => info.isDirectory(),
    () => false,
  );
  if (!present) return false;
  return readDesignatedRequirement(publishedApp, capture).then(signedByCertificate, () => false);
}

/**
 * Before publishing: the built bundle is signed by the chosen certificate, and an ad-hoc bundle
 * never replaces one signed by certificate.
 */
export async function checkBuiltSignature(
  builtApp: string,
  publishedApp: string,
  signing: SigningIdentity | null,
  capture: Capture,
): Promise<void> {
  const requirement = await asReleaseError(() => readDesignatedRequirement(builtApp, capture));
  if (signing !== null && !requirementNamesIdentity(requirement, signing)) {
    throw new ReleaseError(
      `le paquet construit n’est pas signé par « ${signing.name} » : ${requirement}`,
    );
  }
  if (signedByCertificate(requirement)) return;
  if (await publishedSigned(publishedApp, capture)) {
    throw new ReleaseError(
      `le canal propose une app signée par certificat : une app ad hoc la remplacerait et perdrait ses autorisations. Publiez avec ${SIGNING_IDENTITY_ENV}, ou retirez d’abord ${publishedApp}`,
    );
  }
}
