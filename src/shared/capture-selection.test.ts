import { describe, expect, it } from 'vitest';
import {
  defaultMeetingTitle,
  defaultScreenId,
  hasAudioSource,
  normalizeSelection,
} from './capture-selection';

describe('defaultMeetingTitle', () => {
  it.each([
    [new Date(2026, 9, 15, 11, 0), 'Réunion du 15 octobre, 11 h 00'],
    [new Date(2026, 2, 5, 9, 5), 'Réunion du 5 mars, 9 h 05'],
    [new Date(2026, 11, 31, 0, 0), 'Réunion du 31 décembre, 0 h 00'],
    [new Date(2026, 1, 1, 8, 30), 'Réunion du 1er février, 8 h 30'],
    [new Date(2026, 7, 20, 23, 59), 'Réunion du 20 août, 23 h 59'],
  ])('names the meeting after its start: %s', (date, title) => {
    expect(defaultMeetingTitle(date)).toBe(title);
  });
});

describe('normalizeSelection', () => {
  const all = { microphone: true, systemAudio: true, screen: true };

  it('keeps a consistent selection as it is', () => {
    expect(normalizeSelection(all)).toEqual(all);
    expect(normalizeSelection({ microphone: false, systemAudio: false, screen: true })).toEqual({
      microphone: false,
      systemAudio: false,
      screen: true,
    });
  });

  it('turns the system audio off with the screen', () => {
    expect(normalizeSelection({ ...all, screen: false }, 'screen')).toEqual({
      microphone: true,
      systemAudio: false,
      screen: false,
    });
  });

  it('brings the screen back when the system audio is asked for without it', () => {
    expect(
      normalizeSelection({ microphone: true, systemAudio: true, screen: false }, 'systemAudio'),
    ).toEqual(all);
  });

  it('drops a system audio stored without a screen', () => {
    expect(normalizeSelection({ microphone: true, systemAudio: true, screen: false })).toEqual({
      microphone: true,
      systemAudio: false,
      screen: false,
    });
  });
});

describe('hasAudioSource', () => {
  it('needs the microphone or the system audio', () => {
    expect(hasAudioSource({ microphone: false, systemAudio: false, screen: true })).toBe(false);
    expect(hasAudioSource({ microphone: true, systemAudio: false, screen: false })).toBe(true);
    expect(hasAudioSource({ microphone: false, systemAudio: true, screen: true })).toBe(true);
  });

  it('never counts a system audio that has no screen', () => {
    expect(hasAudioSource({ microphone: false, systemAudio: true, screen: false })).toBe(false);
  });
});

describe('defaultScreenId', () => {
  const window = { id: 'window:9:0' };
  const second = { id: 'screen:2:0' };
  const main = { id: 'screen:1:0', primary: true };

  it('takes the remembered screen when it is still there', () => {
    expect(defaultScreenId([main, second, window], 'screen:2:0')).toBe('screen:2:0');
  });

  it('takes the main screen when the remembered one is gone', () => {
    expect(defaultScreenId([window, second, main], 'screen:7:0')).toBe('screen:1:0');
  });

  it('takes the main screen when nothing was remembered', () => {
    expect(defaultScreenId([second, main])).toBe('screen:1:0');
  });

  it('takes the first screen, before any window, when none is marked as main', () => {
    expect(defaultScreenId([window, second])).toBe('screen:2:0');
  });

  it('never restores a window', () => {
    expect(defaultScreenId([second, window], 'window:9:0')).toBe('screen:2:0');
  });

  it('falls back to the first window when there is no screen', () => {
    expect(defaultScreenId([window])).toBe('window:9:0');
  });

  it('answers nothing when no source was found', () => {
    expect(defaultScreenId([], 'screen:1:0')).toBe('');
  });
});
