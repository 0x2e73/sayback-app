import { describe, expect, it, vi } from 'vitest';
import type { LiveSegment } from '../shared/live';
import type { RegisterHandler } from './ipc';
import { createIslandLiveRelay, registerIslandLive } from './island-live';
import { createLiveTranscriptHub } from './live-transcript-hub';
import type { WindowRole } from './window-roles';

const segment: LiveSegment = {
  id: 'system-0',
  track: 'system',
  text: 'Bonjour',
  start: 0,
  end: 1,
  final: true,
  revision: 0,
};

function setup({ enabled = true, shown = true } = {}) {
  const transcript = createLiveTranscriptHub();
  const sent: [string, unknown][] = [];
  const setting = { value: enabled };
  const window = {
    webContents: {
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) => sent.push([channel, payload]),
    },
  };
  const relay = createIslandLiveRelay({
    transcript,
    enabled: () => setting.value,
    window: () => (shown ? window : null),
  } as Parameters<typeof createIslandLiveRelay>[0]);
  return { transcript, sent, setting, relay };
}

describe('island live relay', () => {
  it('sends each utterance and a full snapshot on a status change or the end', () => {
    const { transcript, sent } = setup();

    transcript.setAvailability({ state: 'ready' });
    transcript.publish(segment);
    transcript.clear();

    expect(sent).toEqual([
      ['island:live', { enabled: true, availability: { state: 'ready' }, segments: [] }],
      ['island:live-segment', segment],
      ['island:live', { enabled: true, availability: { state: 'ready' }, segments: [] }],
    ]);
  });

  it('passes the unavailable status on, a port conflict included', () => {
    const { transcript, sent } = setup();

    transcript.setAvailability({ state: 'unavailable', reason: 'port-conflict' });

    expect(sent.at(-1)?.[1]).toMatchObject({
      availability: { state: 'unavailable', reason: 'port-conflict' },
    });
  });

  it('gives the latest finals and drafts in the snapshot, with the hub caps', () => {
    const { transcript, relay } = setup();
    for (let n = 0; n < 40; n += 1) transcript.publish({ ...segment, id: `system-${n}` });
    transcript.publish({ ...segment, id: 'microphone-0', final: false, text: 'Euh' });

    const snapshot = relay.snapshot();

    expect(snapshot.enabled && snapshot.segments).toHaveLength(31);
  });

  it('sends nothing at all, neither text nor status, when the setting is off', () => {
    const { transcript, sent, relay } = setup({ enabled: false });

    transcript.setAvailability({ state: 'ready' });
    transcript.publish(segment);
    transcript.clear();

    expect(sent).toEqual([]);
    expect(relay.snapshot()).toEqual({ enabled: false });
  });

  it('follows the setting at once, both ways', () => {
    const { transcript, sent, setting, relay } = setup();
    transcript.publish(segment);
    sent.length = 0;

    setting.value = false;
    relay.settingChanged();
    transcript.publish({ ...segment, id: 'system-1' });
    setting.value = true;
    relay.settingChanged();

    expect(sent).toEqual([
      ['island:live', { enabled: false }],
      [
        'island:live',
        {
          enabled: true,
          availability: { state: 'off' },
          segments: [segment, { ...segment, id: 'system-1' }],
        },
      ],
    ]);
  });

  it('sends nothing while no island is shown', () => {
    const { transcript, sent } = setup({ shown: false });

    transcript.publish(segment);

    expect(sent).toEqual([]);
  });
});

describe('island live channels', () => {
  function registered() {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const roles = new Map<string, readonly WindowRole[] | undefined>();
    const handle: RegisterHandler = (channel, action, allowed) => {
      handlers.set(channel, action);
      roles.set(channel, allowed);
    };
    const relay = { snapshot: vi.fn(() => ({ enabled: false as const })), settingChanged: vi.fn() };
    const setting = { set: vi.fn() };
    registerIslandLive(handle, relay, setting);
    return { handlers, roles, relay, setting };
  }

  it('gives the snapshot to the island and the setting to the main page only', () => {
    const { roles, handlers } = registered();

    expect(Object.fromEntries(roles)).toEqual({
      'island:live-snapshot': ['island'],
      'settings:set-island-live-text': undefined,
    });
    expect(handlers.get('island:live-snapshot')?.()).toEqual({ enabled: false });
  });

  it('stores a boolean and tells the island', () => {
    const { handlers, setting, relay } = registered();

    handlers.get('settings:set-island-live-text')?.(false);

    expect(setting.set).toHaveBeenCalledWith(false);
    expect(relay.settingChanged).toHaveBeenCalledOnce();
  });

  it.each(['false', 0, null, undefined])('refuses %j without storing or telling', (value) => {
    const { handlers, setting, relay } = registered();

    expect(() => handlers.get('settings:set-island-live-text')?.(value)).toThrow();
    expect(setting.set).not.toHaveBeenCalled();
    expect(relay.settingChanged).not.toHaveBeenCalled();
  });
});
