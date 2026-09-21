import { useState } from 'react';
import { errorMessage } from '../../../shared/format';
import { unwrap, type CaptureSource, type DesktopApi } from '../../../shared/contracts';
import type { CaptureSession } from './capture-session';

export function useRecordingSource(api: DesktopApi, capture: CaptureSession) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [error, setError] = useState('');

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
      setPreviewVersion((version) => version + 1);
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
