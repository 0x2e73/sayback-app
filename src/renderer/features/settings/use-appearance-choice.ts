import { useState } from 'react';
import { unwrap, type Appearance, type DesktopApi } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';

interface Current {
  appearance: Appearance;
  setAppearance(value: Appearance): void;
}

// Applied at once and on its own: the save button is for the other fields.
export function useAppearanceChoice(api: DesktopApi, current: Current) {
  const [error, setError] = useState('');

  async function chooseAppearance(value: Appearance) {
    if (value === current.appearance) return;
    try {
      unwrap(await api.setAppearance(value));
      current.setAppearance(value);
      setError('');
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  return { appearanceError: error, chooseAppearance };
}
