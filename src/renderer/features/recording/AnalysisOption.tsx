import { analysisDestination } from '../../../shared/analysis-settings';
import type { Settings } from '../../../shared/contracts';
import { Skeleton, Switch } from '../../components/ui';

interface AnalysisOptionProps {
  /** Null while the settings are being read. */
  settings: Settings | null;
  configured: boolean;
  checked: boolean;
  onChange(checked: boolean): void;
  onConfigure(): void;
}

export function AnalysisOption(props: AnalysisOptionProps) {
  const { settings, configured, checked } = props;
  if (!settings) return <Skeleton />;
  if (!configured) {
    return (
      <p className="caption analysis-missing">
        Analyse non configurée. L’enregistrement reste local.{' '}
        <button type="button" className="text-link" onClick={props.onConfigure}>
          Configurer
        </button>
      </p>
    );
  }
  return (
    <Switch
      label="Lancer l’analyse à l’arrêt"
      description={analysisDestination(settings)}
      checked={checked}
      onChange={props.onChange}
    />
  );
}
