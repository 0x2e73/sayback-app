import { Switch } from '../../components/ui';
import { SettingRow } from './SettingsLayout';

interface IslandTextSettingsProps {
  value: boolean;
  /** The change is being stored: one at a time. */
  busy: boolean;
  onChange(value: boolean): void;
}

export function IslandTextSettings({ value, busy, onChange }: IslandTextSettingsProps) {
  return (
    <SettingRow
      label="Texte en direct"
      hint="Pendant un enregistrement, sous l’encoche. Appliqué tout de suite."
    >
      <Switch
        label="Afficher le texte en direct dans l’îlot"
        checked={value}
        disabled={busy}
        onChange={onChange}
      />
    </SettingRow>
  );
}
