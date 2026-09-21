import { useCallback, useRef, useState } from 'react';
import { unwrap, type DesktopApi, type NotesProvider } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';

export function useModels(api: DesktopApi) {
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const load = useCallback(
    async (provider: NotesProvider): Promise<string[]> => {
      const current = ++generation.current;
      setLoading(true);
      setError('');
      try {
        const models = unwrap(await api.listModels(provider));
        if (current !== generation.current) return [];
        setItems(models);
        return models;
      } catch (failure) {
        if (current === generation.current) setError(errorMessage(failure));
        return [];
      } finally {
        if (current === generation.current) setLoading(false);
      }
    },
    [api],
  );

  function clear() {
    generation.current += 1;
    setItems([]);
    setError('');
    setLoading(false);
  }

  return { items, loading, error, load, clear };
}
