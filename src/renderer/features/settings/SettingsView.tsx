import type { DesktopApi } from '../../../shared/contracts';
import { Button, Notice } from '../../components/ui';
import { LocalSetupPanel } from '../local-setup/LocalSetupPanel';
import { ApiSettingsForm } from './ApiSettingsForm';
import { AppearanceSettings } from './AppearanceSettings';
import { IslandTextSettings } from './IslandTextSettings';
import { SettingRow, SettingsGroup } from './SettingsLayout';
import { useSettings } from './use-settings';

interface SettingsViewProps {
  api: DesktopApi;
  onShowOnboarding(): void;
}

export function SettingsView({ api, onShowOnboarding }: SettingsViewProps) {
  const settings = useSettings(api);
  const usesLocalModels =
    settings.transcriptionProvider === 'local' || settings.notesProvider === 'ollama';
  if (settings.loadError && !settings.loaded) {
    return (
      <div className="settings-page">
        <h1>Paramètres</h1>
        <Notice retry={settings.retryLoad}>{settings.loadError}</Notice>
      </div>
    );
  }
  return (
    <div className="settings-page">
      <h1>Paramètres</h1>
      {settings.error && <Notice>{settings.error}</Notice>}
      <ApiSettingsForm settings={settings} />
      {usesLocalModels && (
        <SettingsGroup
          title="Mode local"
          description="Whisper et Ollama tournent sur cet ordinateur. Enregistrez vos paramètres, puis revérifiez après une installation."
        >
          <LocalSetupPanel api={api} />
        </SettingsGroup>
      )}
      <SettingsGroup title="Général">
        <AppearanceSettings value={settings.appearance} onChange={settings.chooseAppearance} />
        <IslandTextSettings
          value={settings.islandLiveText}
          busy={settings.islandLiveTextBusy}
          onChange={(value) => void settings.chooseIslandLiveText(value)}
        />
        <SettingRow label="Introduction" hint="Revoir les étapes de présentation de l’application.">
          <Button variant="secondary" onClick={onShowOnboarding}>
            Revoir l’introduction
          </Button>
        </SettingRow>
        <SettingRow
          label="Stockage local"
          hint="Les enregistrements, transcriptions et notes restent sur cet ordinateur. Aucun compte n’est nécessaire."
        >
          <Button variant="secondary" onClick={() => void settings.openFolder()}>
            Ouvrir le dossier
          </Button>
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}
