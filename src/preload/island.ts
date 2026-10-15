import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { IslandApi } from '../shared/contracts';
import type { IslandSnapshot } from '../shared/island';
import type { IslandLiveSnapshot, LiveSegment } from '../shared/live';
import type { RecordingStartOutcome } from '../shared/recording-start';

// The sandboxed preload cannot load zod: a light shape check of what the main process sends.
function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

// Recording, the tiles of the picker; ready, the state to start from.
function hasModeContent(value: object): boolean {
  if (!('mode' in value)) return false;
  if (value.mode === 'recording') return 'screens' in value && Array.isArray(value.screens);
  return value.mode === 'ready' && 'ready' in value && isObject(value.ready);
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
    hasModeContent(value)
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

// Mirrors `MAX_PREVIEW_BYTES`, checked in the main process.
const MAX_PREVIEW_BYTES = 256 * 1024;
function isJpeg(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array && value.length >= 1 && value.length <= MAX_PREVIEW_BYTES;
}

function fields(value: unknown): Record<string, unknown> | null {
  return isObject(value) ? (value as Record<string, unknown>) : null;
}

function isSegment(value: unknown): value is LiveSegment {
  const segment = fields(value);
  if (!segment) return false;
  const { id, track, text, start, end, final, revision } = segment;
  return (
    typeof id === 'string' &&
    (track === 'microphone' || track === 'system') &&
    typeof text === 'string' &&
    [start, end].every((time) => typeof time === 'number' && Number.isFinite(time)) &&
    typeof final === 'boolean' &&
    Number.isInteger(revision)
  );
}

function isAvailability(value: unknown): boolean {
  const availability = fields(value);
  if (!availability) return false;
  const { state, reason } = availability;
  if (state === 'unavailable') return typeof reason === 'string';
  return state === 'off' || state === 'starting' || state === 'ready';
}

function isLiveSnapshot(value: unknown): value is IslandLiveSnapshot {
  const snapshot = fields(value);
  if (!snapshot) return false;
  if (snapshot.enabled === false) return true;
  const { segments } = snapshot;
  return (
    snapshot.enabled === true &&
    isAvailability(snapshot.availability) &&
    Array.isArray(segments) &&
    segments.every(isSegment)
  );
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
  screenThumbnails: () => ipcRenderer.invoke('island:screen-thumbnails'),
  onLevel: (listener) => relay('island:level', isLevel, listener),
  onPreview: (listener) => relay('island:preview', isJpeg, listener),
  onStartResult: (listener) => relay('island:start-result', isStartOutcome, listener),
  liveSnapshot: () => ipcRenderer.invoke('island:live-snapshot'),
  onLive: (listener) => relay('island:live', isLiveSnapshot, listener),
  onLiveSegment: (listener) => relay('island:live-segment', isSegment, listener),
};
contextBridge.exposeInMainWorld('sayBackIsland', api);
