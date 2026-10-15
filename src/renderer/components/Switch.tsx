import { useId } from 'react';

interface SwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}

export function Switch({ label, description, checked, disabled = false, onChange }: SwitchProps) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <label className="switch">
      <input
        type="checkbox"
        role="switch"
        className="switch-input"
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-text">
        <span id={labelId} className="switch-label">
          {label}
        </span>
        {description && (
          <span id={descriptionId} className="switch-description">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
