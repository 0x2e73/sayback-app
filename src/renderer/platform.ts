// navigator.platform stays "MacIntel" under Electron, Apple Silicon included; the main process decides with process.platform.
export function platformOf(platform: string): 'mac' | 'other' {
  return platform.startsWith('Mac') ? 'mac' : 'other';
}
