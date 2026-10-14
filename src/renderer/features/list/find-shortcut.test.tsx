// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { isFindShortcut, useFindShortcut, type ShortcutKey } from './find-shortcut';

afterEach(cleanup);

const key = (overrides: Partial<ShortcutKey>): ShortcutKey => ({
  key: 'f',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

describe('isFindShortcut', () => {
  it.each<[string, ShortcutKey, 'mac' | 'other', boolean]>([
    ['Cmd+F on macOS', key({ metaKey: true }), 'mac', true],
    ['Cmd+F with caps lock on macOS', key({ key: 'F', metaKey: true }), 'mac', true],
    ['Ctrl+F on macOS, the Emacs caret binding', key({ ctrlKey: true }), 'mac', false],
    [
      'Cmd+Ctrl+F on macOS, the full-screen chord',
      key({ metaKey: true, ctrlKey: true }),
      'mac',
      false,
    ],
    ['Cmd+Shift+F on macOS', key({ metaKey: true, shiftKey: true }), 'mac', false],
    ['Cmd+Option+F on macOS', key({ metaKey: true, altKey: true }), 'mac', false],
    ['Cmd+G on macOS', key({ key: 'g', metaKey: true }), 'mac', false],
    ['Ctrl+F elsewhere', key({ ctrlKey: true }), 'other', true],
    ['the Windows key with F elsewhere', key({ metaKey: true }), 'other', false],
    ['Ctrl+G elsewhere', key({ key: 'g', ctrlKey: true }), 'other', false],
  ])('%s → %s', (_case, event, platform, expected) => {
    expect(isFindShortcut(event, platform)).toBe(expected);
  });
});

function SearchHarness({ platform }: { platform: 'mac' | 'other' }) {
  const field = useRef<HTMLInputElement>(null);
  useFindShortcut(field, platform);
  return (
    <>
      <input aria-label="Ailleurs" />
      <input ref={field} type="search" aria-label="Rechercher une réunion" />
    </>
  );
}

describe('useFindShortcut', () => {
  it('focuses the search on Ctrl+F outside macOS and keeps the key from the page', () => {
    render(<SearchHarness platform="other" />);
    const handled = !fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    expect(handled).toBe(true);
    expect(screen.getByRole('searchbox', { name: 'Rechercher une réunion' })).toHaveFocus();
  });

  it('leaves Ctrl+F to the text field on macOS', () => {
    render(<SearchHarness platform="mac" />);
    const elsewhere = screen.getByRole('textbox', { name: 'Ailleurs' });
    elsewhere.focus();
    const passedOn = fireEvent.keyDown(elsewhere, { key: 'f', ctrlKey: true });
    expect(passedOn).toBe(true);
    expect(elsewhere).toHaveFocus();
  });

  it('focuses the search on Cmd+F on macOS', () => {
    render(<SearchHarness platform="mac" />);
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(screen.getByRole('searchbox', { name: 'Rechercher une réunion' })).toHaveFocus();
  });
});
