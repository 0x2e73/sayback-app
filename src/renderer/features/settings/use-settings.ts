import type { DesktopApi } from '../../../shared/contracts';
import { useInstantSetting } from './use-instant-setting';
import { useSettingsActions } from './use-settings-actions';
import { useSettingsFields } from './use-settings-fields';

export function useSettings(api: DesktopApi) {
  const fields = useSettingsFields(api);
  const actions = useSettingsActions(api, fields);
  // Applied at once and on their own: the save button is for the other fields.
  const appearance = useInstantSetting(
    fields.appearance,
    (value) => api.setAppearance(value),
    fields.setAppearance,
  );
  const liveText = useInstantSetting(
    fields.islandLiveText,
    (value) => api.setIslandLiveText(value),
    fields.setIslandLiveText,
  );
  return {
    ...fields,
    ...actions,
    error: actions.error || appearance.error || liveText.error,
    chooseAppearance: appearance.choose,
    chooseIslandLiveText: liveText.choose,
    islandLiveTextBusy: liveText.busy,
  };
}

export type FormSettings = ReturnType<typeof useSettings>;
