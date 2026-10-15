import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { IslandApi } from '../shared/contracts';
import type { IslandSnapshot } from '../shared/island';
import type { RecordingStartOutcome } from '../shared/recording-start';

// The sandboxed preload cannot load zod: a light shape check of what the main process sends.
function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function isSnapshot(value: unknown): value is IslandSnapshot {
  return (
    isObject(value) &&
    'expanded' in value &&
    typeof value.expanded === 'boolean' &&
    'recording' in value &&
    isObject(value.recording) &&
    'shape' in value &&
    isObject(value.shape) &&
    'mode' in value &&
    (value.mode === 'recording' ||
      (value.mode === 'ready' && 'ready' in value && isObject(value.ready)))
  );
}

function isStartOutcome(value: unknown): value is RecordingStartOutcome {
  if (!isObject(value) || !('ok' in value)) return false;
  return (
    value.ok === true || (value.ok === false && 'error' in value && typeof value.error === 'string')
  );
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function relay<T>(
  channel: string,
  accepts: (value: unknown) => value is T,
  listener: (value: T) => void,
): () => void {
  const forward = (_event: IpcRendererEvent, value: unknown) => {
    if (accepts(value)) listener(value);
  };
  ipcRenderer.on(channel, forward);
  return () => {
    ipcRenderer.removeListener(channel, forward);
  };
}

const api: IslandApi = {
  ready: () => ipcRenderer.invoke('island:ready'),
  request: (request) => ipcRenderer.invoke('island:request', request),
  onState: (listener) => relay('island:state', isSnapshot, listener),
  onExpanded: (listener) => relay('island:expanded', isBoolean, listener),
  onLevel: (listener) => relay('island:level', isLevel, listener),
  onStartResult: (listener) => relay('island:start-result', isStartOutcome, listener),
};
contextBridge.exposeInMainWorld('sayBackIsland', api);
