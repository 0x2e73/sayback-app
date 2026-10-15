import { useId, type ReactNode } from 'react';

interface SettingsGroupProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsGroup({ title, description, children }: SettingsGroupProps) {
  const titleId = useId();
  return (
    <section className="settings-group" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      {description && <p className="settings-group-description">{description}</p>}
      <div className="settings-rows">{children}</div>
    </section>
  );
}

export interface RowIds {
  /** The visible label; a control that is not an input points at it. */
  labelId: string;
  controlId: string;
  /** Present only when the row has a hint. */
  hintId: string | undefined;
}

interface SettingRowProps {
  label: string;
  hint?: ReactNode;
  /** A function receives the ids to wire an input or a select; a node is a free control. */
  children: ReactNode | ((ids: RowIds) => ReactNode);
}

export function SettingRow({ label, hint, children }: SettingRowProps) {
  const labelId = useId();
  const controlId = useId();
  const hintId = useId();
  const bound = typeof children === 'function';
  const ids: RowIds = { labelId, controlId, hintId: hint ? hintId : undefined };
  return (
    <div className="setting-row">
      <div className="setting-text">
        {bound ? (
          <label id={labelId} htmlFor={controlId} className="setting-label">
            {label}
          </label>
        ) : (
          <span id={labelId} className="setting-label">
            {label}
          </span>
        )}
        {hint && (
          <div id={hintId} className="setting-hint">
            {hint}
          </div>
        )}
      </div>
      <div className="setting-control">{bound ? children(ids) : children}</div>
    </div>
  );
}
