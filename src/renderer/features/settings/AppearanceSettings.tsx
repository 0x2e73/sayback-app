import type { Appearance } from '../../../shared/contracts';
import { Segmented, type RadioOption } from '../../components/ui';
import { SettingRow } from './SettingsLayout';

const options: readonly RadioOption<Appearance>[] = [
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

interface AppearanceSettingsProps {
  value: Appearance;
  onChange(value: Appearance): void;
}

export function AppearanceSettings({ value, onChange }: AppearanceSettingsProps) {
  return (
    <SettingRow
      label="Apparence"
      hint="Appliquée tout de suite. « Système » suit le réglage de votre Mac."
    >
      <Segmented
        kind="radios"
        label="Apparence"
        options={options}
        value={value}
        onChange={onChange}
      />
    </SettingRow>
  );
}
