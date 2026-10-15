import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DesktopApi, UpdateStatus } from '../shared/contracts';
import type { RecordingRequest } from '../shared/recording-state';

// The sandboxed preload cannot load zod: payloads are checked by hand.
function isRecordingRequest(value: unknown): value is RecordingRequest {
  return value === 'pause' || value === 'resume' || value === 'stop';
}

// Payload-free event: the page is only told that it happened.
function listenTo(channel: string, listener: () => void): () => void {
  const relay = () => listener();
  ipcRenderer.on(channel, relay);
  return () => {
    ipcRenderer.removeListener(channel, relay);
  };
}

const api: DesktopApi = {
  listMeetings: () => ipcRenderer.invoke('meetings:list'),
  listFolders: () => ipcRenderer.invoke('folders:list'),
  createFolder: (name) => ipcRenderer.invoke('folders:create', name),
  renameFolder: (id, name) => ipcRenderer.invoke('folders:rename', id, name),
  deleteFolder: (id) => ipcRenderer.invoke('folders:delete', id),
  moveMeeting: (id, folderId) => ipcRenderer.invoke('folders:move-meeting', id, folderId),
  createMeeting: (title) => ipcRenderer.invoke('meetings:create', title),
  getMeeting: (id) => ipcRenderer.invoke('meetings:get', id),
  finishMeeting: (id, duration) => ipcRenderer.invoke('meetings:finish', id, duration),
  processMeeting: (id) => ipcRenderer.invoke('meetings:process', id),
  clarify: (id, at, text) => ipcRenderer.invoke('meetings:clarify', id, at, text),
  deleteMeeting: (id) => ipcRenderer.invoke('meetings:delete', id),
  saveMedia: (upload) => ipcRenderer.invoke('media:save', upload),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  completeOnboarding: () => ipcRenderer.invoke('onboarding:complete'),
  listModels: (provider) => ipcRenderer.invoke('settings:list-models', provider),
  saveSettings: (input) => ipcRenderer.invoke('settings:save', input),
  clearApiKey: (provider) => ipcRenderer.invoke('settings:clear-key', provider),
  openScreenRecordingSettings: () => ipcRenderer.invoke('privacy:open-screen-settings'),
  openMicrophoneSettings: () => ipcRenderer.invoke('privacy:open-microphone-settings'),
  getCapturePermission: (kind) => ipcRenderer.invoke('capture:permission', kind),
  getCapturePrefs: () => ipcRenderer.invoke('capture-prefs:get'),
  setCapturePrefs: (prefs) => ipcRenderer.invoke('capture-prefs:set', prefs),
  getSources: () => ipcRenderer.invoke('capture:sources'),
  selectSource: (id, systemAudio) => ipcRenderer.invoke('capture:select', id, systemAudio),
  openDataFolder: () => ipcRenderer.invoke('data:open'),
  checkLocalSetup: () => ipcRenderer.invoke('setup:check'),
  openSetupGuide: (guide) => ipcRenderer.invoke('setup:open-guide', guide),
  isFullScreen: () => ipcRenderer.invoke('window:is-full-screen'),
  onFullScreenChange: (listener) => {
    const relay = (_event: IpcRendererEvent, fullScreen: unknown) => {
      if (typeof fullScreen === 'boolean') listener(fullScreen);
    };
    ipcRenderer.on('window:full-screen-changed', relay);
    return () => {
      ipcRenderer.removeListener('window:full-screen-changed', relay);
    };
  },
  announceRecordingState: (state) => ipcRenderer.invoke('recording:state', state),
  onMenuBarNewRecording: (listener) => listenTo('menu-bar:new-recording', listener),
  sendLevel: (level) => {
    if (typeof level === 'number' && Number.isFinite(level)) ipcRenderer.send('live:level', level);
  },
  onRecordingRequest: (listener) => {
    const relay = (_event: IpcRendererEvent, request: unknown) => {
      if (isRecordingRequest(request)) listener(request);
    };
    ipcRenderer.on('recording:request', relay);
    return () => {
      ipcRenderer.removeListener('recording:request', relay);
    };
  },
  getUpdateStatus: () => ipcRenderer.invoke('updates:status'),
  checkForUpdate: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: (listener) => {
    const forward = (_event: IpcRendererEvent, status: UpdateStatus) => listener(status);
    ipcRenderer.on('updates:changed', forward);
    return () => {
      ipcRenderer.removeListener('updates:changed', forward);
    };
  },
  setAppearance: (value) => ipcRenderer.invoke('settings:set-appearance', value),
};
contextBridge.exposeInMainWorld('sayBack', api);
