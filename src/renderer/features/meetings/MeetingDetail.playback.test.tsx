// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Meeting } from '../../../shared/contracts';
import { apiFor, meetingFixture } from '../../test-api';
import { WorkspaceContent } from '../../WorkspaceContent';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const withAudio = (id: string, title: string): Meeting =>
  meetingFixture(id, title, '2026-10-14T08:00:00Z', {
    duration: 60,
    audioChunks: [{ index: 0, start: 0, duration: 60, transcript: null }],
  });
const first = withAudio('m1', 'Revue produit');
const second = withAudio('m2', 'Point hebdo');

function workspace(selected: Meeting) {
  return (
    <WorkspaceContent
      api={apiFor([first, second])}
      card="meeting"
      selected={selected}
      loading={false}
      hasMeetings
      folders={[]}
      capture={null}
      stopping={false}
      recordingFailed={false}
      onOpenInterrupted={vi.fn()}
      onStop={vi.fn()}
      onUpdate={vi.fn()}
      onMove={vi.fn(async () => true)}
      onCreateFolder={vi.fn(async () => null)}
      onDeleted={vi.fn()}
      onSettings={vi.fn()}
      onShowOnboarding={vi.fn()}
    />
  );
}

function audio(): HTMLAudioElement {
  const element = document.querySelector('audio');
  if (!element) throw new Error('no audio element');
  return element;
}

it('stops the sound and opens the next meeting from the start', async () => {
  const user = userEvent.setup();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
  const { rerender } = render(workspace(first));
  fireEvent.loadedMetadata(audio());
  await user.click(screen.getByRole('button', { name: 'Lire' }));
  audio().currentTime = 30;
  fireEvent.timeUpdate(audio());
  expect(screen.getByRole('slider', { name: 'Position de lecture' })).toHaveAttribute(
    'aria-valuetext',
    '00:30 sur 01:00',
  );
  pause.mockClear();
  rerender(workspace(second));
  expect(pause).toHaveBeenCalled();
  expect(screen.getByRole('heading', { level: 1, name: 'Point hebdo' })).toBeInTheDocument();
  expect(audio()).toHaveAttribute('src', 'meeting-media://local/m2/audio/0');
  expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
  expect(screen.getByRole('slider', { name: 'Position de lecture' })).toHaveAttribute(
    'aria-valuetext',
    '00:00 sur 01:00',
  );
});
