// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Segmented, type SegmentedOption } from './Segmented';

afterEach(cleanup);

type View = 'notes' | 'transcript' | 'video';
const options: readonly SegmentedOption<View>[] = [
  { value: 'notes', label: 'Notes', panelId: 'p-notes' },
  { value: 'transcript', label: 'Transcription', panelId: 'p-transcript' },
  { value: 'video', label: 'Vidéo', panelId: 'p-video' },
];

function Harness({ onChange = vi.fn() }: { onChange?: (value: View) => void }) {
  const [value, setValue] = useState<View>('notes');
  return (
    <Segmented
      label="Contenu de la réunion"
      options={options}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const tab = (name: string) => screen.getByRole('tab', { name });

it('selects a tab by click and names the panel it controls', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.getByRole('tablist', { name: 'Contenu de la réunion' })).toBeInTheDocument();
  await user.click(tab('Transcription'));
  expect(tab('Transcription')).toHaveAttribute('aria-selected', 'true');
  expect(tab('Notes')).toHaveAttribute('aria-selected', 'false');
  expect(tab('Transcription')).toHaveAttribute('aria-controls', 'p-transcript');
  expect(tab('Transcription')).toHaveAttribute('id', 'p-transcript-tab');
});

it('moves with the arrows, Home and End, and wraps around', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(tab('Notes'));
  await user.keyboard('{ArrowRight}');
  expect(tab('Transcription')).toHaveFocus();
  expect(tab('Transcription')).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{End}');
  expect(tab('Vidéo')).toHaveFocus();
  await user.keyboard('{ArrowRight}');
  expect(tab('Notes')).toHaveFocus();
  await user.keyboard('{ArrowLeft}');
  expect(tab('Vidéo')).toHaveFocus();
  await user.keyboard('{Home}');
  expect(tab('Notes')).toHaveFocus();
  expect(tab('Notes')).toHaveAttribute('aria-selected', 'true');
});

it('keeps only the selected tab in the tab order', () => {
  render(<Harness />);
  expect(tab('Notes')).toHaveAttribute('tabindex', '0');
  expect(tab('Transcription')).toHaveAttribute('tabindex', '-1');
  expect(tab('Vidéo')).toHaveAttribute('tabindex', '-1');
});

it('ignores the other keys', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  await user.click(tab('Notes'));
  await user.keyboard('a{ArrowDown}');
  expect(onChange).toHaveBeenCalledOnce();
});
