// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { slowTransitions } from '../../slow-transitions.test-support';
import { meetingWith, recordScrolls, TranscriptHarness } from './transcript-harness';
import { TranscriptPills } from './TranscriptPills';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const pills = (showFollow: boolean) => (
  <TranscriptPills showFollow={showFollow} onFollow={vi.fn()} showBack={false} onBack={vi.fn()} />
);

it('slides the follow pill in and lets it go with an exit', () => {
  slowTransitions();
  const view = render(pills(false));
  expect(screen.queryByText('Revenir au direct')).toBeNull();
  view.rerender(pills(true));
  const slot = screen.getByText('Revenir au direct').closest('.follow-pill-slot')!;
  expect(slot).toHaveAttribute('data-state', 'open');
  view.rerender(pills(false));
  expect(slot).toHaveAttribute('data-state', 'closing');
  expect(slot).toHaveAttribute('inert');
  fireEvent.transitionEnd(slot, { propertyName: 'opacity' });
  expect(screen.queryByText('Revenir au direct')).toBeNull();
});

it('lets the waiting message go with an exit when the transcript arrives', () => {
  recordScrolls();
  slowTransitions();
  const waiting = meetingWith([]);
  const view = render(<TranscriptHarness meeting={waiting} analyzing />);
  const message = screen.getByText('La transcription arrive au fur et à mesure.');
  view.rerender(
    <TranscriptHarness
      meeting={meetingWith([{ id: '0-0', start: 1, end: 3, text: 'Bonjour.', speaker: 'A' }])}
    />,
  );
  expect(message.closest('.state-view')).toHaveAttribute('data-state', 'closing');
  expect(screen.getByText('Bonjour.')).toBeInTheDocument();
});
