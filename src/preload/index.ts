import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/contracts';

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
  getSources: () => ipcRenderer.invoke('capture:sources'),
  selectSource: (id, systemAudio) => ipcRenderer.invoke('capture:select', id, systemAudio),
  openDataFolder: () => ipcRenderer.invoke('data:open'),
  checkLocalSetup: () => ipcRenderer.invoke('setup:check'),
  openSetupGuide: (guide) => ipcRenderer.invoke('setup:open-guide', guide),
};
contextBridge.exposeInMainWorld('sayBack', api);
