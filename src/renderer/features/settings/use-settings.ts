import type { DesktopApi } from '../../../shared/contracts';
import { useAppearanceChoice } from './use-appearance-choice';
import { useSettingsActions } from './use-settings-actions';
import { useSettingsFields } from './use-settings-fields';

export function useSettings(api: DesktopApi) {
  const fields = useSettingsFields(api);
  const actions = useSettingsActions(api, fields);
  const { appearanceError, chooseAppearance } = useAppearanceChoice(api, fields);
  return { ...fields, ...actions, error: actions.error || appearanceError, chooseAppearance };
}
