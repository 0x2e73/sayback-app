export function platformOf(platform: string): 'mac' | 'other' {
  return platform.startsWith('Mac') ? 'mac' : 'other';
}
