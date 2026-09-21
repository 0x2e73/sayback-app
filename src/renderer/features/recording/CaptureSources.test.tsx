// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaptureSources } from './CaptureSources';

it('separates screens and windows and selects a source from its preview card', async () => {
  const onSource = vi.fn();
  const user = userEvent.setup();
  render(
    <CaptureSources
      selection={{ screen: true, microphone: true, systemAudio: false }}
      sources={[
        { id: 'screen:1:0', name: 'Écran principal', thumbnail: 'data:image/png;base64,screen' },
        { id: 'window:2:0', name: 'Navigateur', thumbnail: 'data:image/png;base64,window' },
      ]}
      sourceId="screen:1:0"
      onSelection={vi.fn()}
      onSource={onSource}
    />,
  );

  expect(screen.getByRole('group', { name: 'Écrans' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Fenêtres' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Écran principal/ })).toBeChecked();
  await user.click(screen.getByRole('radio', { name: /Navigateur/ }));
  expect(onSource).toHaveBeenCalledWith('window:2:0');
});
