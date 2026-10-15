import { SunMoon } from 'lucide-react';
import type { Appearance } from '../../../shared/contracts';
import { Segmented, type RadioOption } from '../../components/ui';

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
    <section className="settings-card">
      <div className="section-icon">
        <SunMoon size={21} />
      </div>
      <h2>Apparence</h2>
      <div className="appearance-choice">
        <Segmented
          kind="radios"
          label="Apparence"
          options={options}
          value={value}
          onChange={onChange}
        />
      </div>
    </section>
  );
}
