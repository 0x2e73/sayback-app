import type { DesktopApi } from '../../../shared/contracts';
import { useSettingsActions } from './use-settings-actions';
import { useSettingsFields } from './use-settings-fields';

export function useSettings(api: DesktopApi) {
  const fields = useSettingsFields(api);
  const actions = useSettingsActions(api, fields);
  return { ...fields, ...actions };
}
