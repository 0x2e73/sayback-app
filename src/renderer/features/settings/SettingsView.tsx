import { CircleHelp, Cpu, FolderOpen, KeyRound } from 'lucide-react';
import type { DesktopApi } from '../../../shared/contracts';
import { Button, Notice } from '../../components/ui';
import { LocalSetupPanel } from '../local-setup/LocalSetupPanel';
import { ApiSettingsForm } from './ApiSettingsForm';
import { useSettings } from './use-settings';

interface SettingsViewProps {
  api: DesktopApi;
  onShowOnboarding(): void;
}

export function SettingsView({ api, onShowOnboarding }: SettingsViewProps) {
  const settings = useSettings(api);
  const usesLocalModels =
    settings.transcriptionProvider === 'local' || settings.notesProvider === 'ollama';
  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">À votre façon</p>
          <h1>Paramètres</h1>
          <p>Vos données chez vous. Votre IA à portée de main.</p>
        </div>
      </div>
      {settings.error && <Notice>{settings.error}</Notice>}
      <section className="settings-card">
        <div className="section-icon">
          <KeyRound size={21} />
        </div>
        <h2>Intelligence artificielle</h2>
        <p>
          Choisissez séparément qui transcrit l’audio et qui rédige les notes. Les clés restent
          chiffrées sur cet ordinateur ; les modèles locaux ne demandent aucune clé.
        </p>
        <ApiSettingsForm settings={settings} />
      </section>
      {usesLocalModels && (
        <section className="settings-card">
          <div className="section-icon">
            <Cpu size={21} />
          </div>
          <h2>Mode local</h2>
          <p>
            Whisper et Ollama tournent sur cet ordinateur. Enregistrez vos paramètres, puis
            revérifiez après une installation.
          </p>
          <LocalSetupPanel api={api} />
        </section>
      )}
      <section className="settings-card">
        <div className="section-icon">
          <CircleHelp size={21} />
        </div>
        <h2>Découvrir SayBack</h2>
        <p>Revoir les étapes de présentation de l’application.</p>
        <Button variant="secondary" onClick={onShowOnboarding}>
          Revoir l’introduction
        </Button>
      </section>
      <section className="settings-card">
        <div className="section-icon">
          <FolderOpen size={21} />
        </div>
        <h2>Stockage local</h2>
        <p>
          Les enregistrements, transcriptions et notes restent sur cet ordinateur. Aucun compte
          n’est nécessaire.
        </p>
        <Button variant="secondary" onClick={() => void settings.openFolder()}>
          <FolderOpen size={16} />
          Ouvrir le dossier
        </Button>
      </section>
    </div>
  );
}
