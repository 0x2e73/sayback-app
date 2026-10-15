// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from '../../components/ui';
import { slowTransitions } from '../../slow-transitions.test-support';
import { SourceChips } from './SourceChips';
import { SourceNotices } from './SourceNotices';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const notices = (noAudio: boolean) => (
  <SourceNotices
    screenBlocked={false}
    microphoneBlocked={false}
    noAudio={noAudio}
    onOpenSettings={vi.fn()}
    onWithoutScreen={vi.fn()}
  />
);

it('lets a notice in and out with presence', () => {
  slowTransitions();
  const view = render(notices(false));
  expect(screen.queryByRole('alert')).toBeNull();
  view.rerender(notices(true));
  const notice = screen.getByRole('alert');
  expect(notice).toHaveAttribute('data-state', 'open');
  view.rerender(notices(false));
  expect(notice).toHaveAttribute('data-state', 'closing');
  fireEvent.transitionEnd(notice, { propertyName: 'opacity' });
  expect(screen.queryByRole('alert')).toBeNull();
});

it('keeps both icons of a chip and shows the one of its state', () => {
  render(
    <SourceChips
      selection={{ microphone: true, systemAudio: false, screen: true }}
      microphoneBlocked={false}
      onToggle={vi.fn()}
    />,
  );
  const swaps = document.querySelectorAll('.source-chips .icon-swap');
  expect(swaps).toHaveLength(3);
  for (const swap of swaps) expect(swap.querySelectorAll('svg')).toHaveLength(2);
  expect(swaps[1]!.querySelector('[data-hidden]')!.querySelector('svg')).not.toBeNull();
});

it('cross-fades the spinner of a busy button', () => {
  slowTransitions();
  const view = render(<Button busy>Démarrer</Button>);
  const spinner = document.querySelector('.button-spinner')!;
  view.rerender(<Button>Démarrer</Button>);
  expect(spinner).toHaveAttribute('data-state', 'closing');
  fireEvent.transitionEnd(spinner, { propertyName: 'opacity' });
  expect(document.querySelector('.button-spinner')).toBeNull();
});
