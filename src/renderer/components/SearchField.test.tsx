// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchField } from './SearchField';

afterEach(cleanup);

it('is a labelled search box that reports what is typed', async () => {
  const query = vi.fn();
  const user = userEvent.setup();
  render(<SearchField label="Rechercher une fenêtre" query="" onQuery={query} />);
  await user.type(screen.getByRole('searchbox', { name: 'Rechercher une fenêtre' }), 'z');
  expect(query).toHaveBeenCalledWith('z');
});

it('can be disabled', () => {
  render(<SearchField label="Rechercher" query="" disabled onQuery={() => {}} />);
  expect(screen.getByRole('searchbox')).toBeDisabled();
});

it('takes the find shortcut only when asked to', () => {
  render(<SearchField label="Rechercher" query="" findShortcut onQuery={() => {}} />);
  fireEvent.keyDown(window, { key: 'f', code: 'KeyF', ctrlKey: true });
  expect(screen.getByRole('searchbox')).toHaveFocus();
});

it('leaves the find shortcut alone by default', () => {
  render(<SearchField label="Rechercher" query="" onQuery={() => {}} />);
  fireEvent.keyDown(window, { key: 'f', code: 'KeyF', ctrlKey: true });
  expect(screen.getByRole('searchbox')).not.toHaveFocus();
});

it('hands its own keys and its focus to the owner', async () => {
  const keys: string[] = [];
  const focused = vi.fn();
  const user = userEvent.setup();
  render(
    <SearchField
      label="Rechercher"
      query=""
      onQuery={() => {}}
      onFocus={focused}
      onKeyDown={(event) => keys.push(event.key)}
    />,
  );
  await user.click(screen.getByRole('searchbox'));
  await user.keyboard('{Enter}{Escape}');
  expect(focused).toHaveBeenCalledOnce();
  expect(keys).toEqual(['Enter', 'Escape']);
});

it('takes the find shortcut before another field when it asks to come first', () => {
  render(
    <>
      <SearchField label="Liste" query="" findShortcut onQuery={() => {}} />
      <SearchField label="Transcription" query="" findShortcut="first" onQuery={() => {}} />
    </>,
  );
  fireEvent.keyDown(window, { key: 'f', code: 'KeyF', ctrlKey: true });
  expect(screen.getByRole('searchbox', { name: 'Transcription' })).toHaveFocus();
});
