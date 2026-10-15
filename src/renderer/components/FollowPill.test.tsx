// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FollowPill } from './FollowPill';

afterEach(cleanup);

it('brings the reader back on click', async () => {
  const onClick = vi.fn();
  render(<FollowPill label="Revenir au direct" onClick={onClick} />);
  await userEvent.click(screen.getByRole('button', { name: 'Revenir au direct' }));
  expect(onClick).toHaveBeenCalledOnce();
});
