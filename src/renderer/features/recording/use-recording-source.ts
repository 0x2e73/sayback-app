import { useCallback, useState, useSyncExternalStore } from 'react';
import { errorMessage } from '../../../shared/format';
import { unwrap, type CaptureSource, type DesktopApi } from '../../../shared/contracts';
import type { CaptureSession } from './capture-session';

export function useRecordingSource(api: DesktopApi, capture: CaptureSession) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  // A switch asked from the island moves the preview too.
  const subscribe = useCallback(
    (listener: () => void) => capture.onSourceChange(listener),
    [capture],
  );
  const previewVersion = useSyncExternalStore(subscribe, () => capture.sourceVersion);

  async function openPicker() {
    setOpen(true);
    setLoading(true);
    setError('');
    setSelectedId(capture.source?.id ?? '');
    try {
      const available = unwrap(await api.getSources());
      setSources(available);
      if (!available.some((source) => source.id === capture.source?.id)) {
        setSelectedId(available[0]?.id ?? '');
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }

  async function switchSource() {
    const source = sources.find((item) => item.id === selectedId);
    if (!source) return;
    if (source.id === capture.source?.id) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    setError('');
    try {
      await capture.switchSource(api, source);
      setOpen(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSwitching(false);
    }
  }

  return {
    open,
    sources,
    selectedId,
    setSelectedId,
    loading,
    switching,
    previewVersion,
    error,
    openPicker,
    switchSource,
    closePicker: () => {
      if (!switching) setOpen(false);
    },
  };
}
