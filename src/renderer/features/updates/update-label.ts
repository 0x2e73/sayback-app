import type { UpdateInfo } from '../../../shared/contracts';

const SHORT_COMMIT_LENGTH = 7;

export function updateLabel(update: UpdateInfo): string {
  return `${update.version} · ${update.commit.slice(0, SHORT_COMMIT_LENGTH)}`;
}
