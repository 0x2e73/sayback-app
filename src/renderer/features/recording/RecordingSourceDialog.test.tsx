// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordingSourceDialog } from './RecordingSourceDialog';
import type { useRecordingSource } from './use-recording-source';

afterEach(cleanup);

type Source = ReturnType<typeof useRecordingSource>;

function fake(changes: Partial<Source> = {}): Source {
  return {
    open: true,
    sources: [
      { id: 'screen:1:0', name: 'Écran 1', thumbnail: 'data:image/png;base64,a' },
      { id: 'window:2:0', name: 'Navigateur', thumbnail: 'data:image/png;base64,b' },
    ],
    selectedId: 'screen:1:0',
    setSelectedId: vi.fn(),
    loading: false,
    switching: false,
    previewVersion: 0,
    error: '',
    openPicker: vi.fn(),
    switchSource: vi.fn(),
    closePicker: vi.fn(),
    ...changes,
  };
}

it('shows the list at once, with the current source selected', () => {
  render(<RecordingSourceDialog source={fake()} />);
  expect(screen.getByRole('radio', { name: /Écran 1/ })).toBeChecked();
  expect(screen.getByRole('radio', { name: /Navigateur/ })).not.toBeChecked();
});

it('selects another source and switches to it from the footer', async () => {
  const source = fake();
  const user = userEvent.setup();
  render(<RecordingSourceDialog source={source} />);
  await user.click(screen.getByText('Navigateur'));
  expect(source.setSelectedId).toHaveBeenCalledWith('window:2:0');
  await user.click(screen.getByRole('button', { name: 'Utiliser cette source' }));
  expect(source.switchSource).toHaveBeenCalledOnce();
});

it('shows a skeleton while it looks, and cannot switch yet', () => {
  render(<RecordingSourceDialog source={fake({ loading: true, sources: [] })} />);
  expect(screen.getByRole('status')).toHaveTextContent('Recherche des écrans et fenêtres…');
  expect(screen.getByRole('button', { name: 'Utiliser cette source' })).toBeDisabled();
});

it('says when no source is available and shows a failure', () => {
  render(<RecordingSourceDialog source={fake({ sources: [], error: 'Échec du changement' })} />);
  expect(screen.getByText('Aucune source disponible.')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Échec du changement');
});

it('stays busy while the switch runs', () => {
  render(<RecordingSourceDialog source={fake({ switching: true })} />);
  expect(screen.getByRole('button', { name: 'Utiliser cette source' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
});
