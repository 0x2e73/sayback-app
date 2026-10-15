// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CaptureSource } from '../../../shared/contracts';
import { SourcePicker } from './SourcePicker';

afterEach(cleanup);

const screens: CaptureSource[] = [
  { id: 'screen:1:0', name: 'Écran 1', thumbnail: 'data:image/png;base64,screen' },
  { id: 'screen:2:0', name: 'Écran 2', thumbnail: '' },
];
const windows = (count: number): CaptureSource[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `window:${index + 1}:0`,
    name: index === 0 ? 'Navigateur' : `Fenêtre ${index + 1}`,
    thumbnail: 'data:image/png;base64,window',
  }));

function show(sources: CaptureSource[], selectedId = 'screen:1:0') {
  const onSelect = vi.fn();
  const onConfirm = vi.fn();
  const user = userEvent.setup();
  render(
    <SourcePicker
      sources={sources}
      selectedId={selectedId}
      onSelect={onSelect}
      onConfirm={onConfirm}
    />,
  );
  return { onSelect, onConfirm, user };
}

it('separates screens and windows and selects a source from its preview', async () => {
  const { onSelect, onConfirm, user } = show([...screens, ...windows(1)]);
  expect(screen.getByRole('group', { name: 'Écrans' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Fenêtres' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Écran 1/ })).toBeChecked();
  await user.click(screen.getByText('Navigateur'));
  expect(onSelect).toHaveBeenCalledWith('window:1:0');
  expect(onConfirm).toHaveBeenCalled();
});

it('leaves out a group that has nothing in it', () => {
  show(screens);
  expect(screen.queryByRole('group', { name: 'Fenêtres' })).toBeNull();
});

it('confirms with Enter and Space without submitting the form around it', async () => {
  const submit = vi.fn((event: Event) => event.preventDefault());
  const onSelect = vi.fn();
  const onConfirm = vi.fn();
  const user = userEvent.setup();
  render(
    <form onSubmit={(event) => submit(event.nativeEvent)}>
      <SourcePicker
        sources={screens}
        selectedId="screen:1:0"
        onSelect={onSelect}
        onConfirm={onConfirm}
      />
    </form>,
  );
  screen.getByRole('radio', { name: /Écran 2/ }).focus();
  await user.keyboard('{Enter}');
  await user.keyboard(' ');
  expect(onSelect).toHaveBeenCalledWith('screen:2:0');
  expect(onConfirm).toHaveBeenCalledTimes(2);
  expect(submit).not.toHaveBeenCalled();
});

it('moves with the arrows without confirming, from a screen to a window', async () => {
  const { onSelect, onConfirm, user } = show([...screens, ...windows(1)], 'screen:2:0');
  screen.getByRole('radio', { name: /Écran 2/ }).focus();
  await user.keyboard('{ArrowDown}');
  expect(onSelect).toHaveBeenCalledWith('window:1:0');
  expect(onConfirm).not.toHaveBeenCalled();
});

it('offers a search from eight windows on and filters them at once', async () => {
  const { user } = show([...screens, ...windows(8)]);
  await user.type(screen.getByRole('searchbox', { name: 'Rechercher une fenêtre' }), 'fenêtre 3');
  expect(screen.getAllByRole('radio', { name: /Fenêtre 3/ })).toHaveLength(1);
  expect(screen.queryByRole('radio', { name: /Navigateur/ })).toBeNull();
});

it('says when no window matches', async () => {
  const { user } = show([...screens, ...windows(8)]);
  await user.type(screen.getByRole('searchbox'), 'zzz');
  expect(screen.getByText('Aucune fenêtre pour « zzz ».')).toBeInTheDocument();
});

it('has no search below eight windows', () => {
  show([...screens, ...windows(7)]);
  expect(screen.queryByRole('searchbox')).toBeNull();
});

it('does not submit the form when Enter is pressed in the search', async () => {
  const submit = vi.fn((event: Event) => event.preventDefault());
  const user = userEvent.setup();
  render(
    <form onSubmit={(event) => submit(event.nativeEvent)}>
      <SourcePicker
        sources={[...screens, ...windows(8)]}
        selectedId="screen:1:0"
        onSelect={() => {}}
      />
    </form>,
  );
  await user.type(screen.getByRole('searchbox'), 'x{Enter}');
  expect(submit).not.toHaveBeenCalled();
});
