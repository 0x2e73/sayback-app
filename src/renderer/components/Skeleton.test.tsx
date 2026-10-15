// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Skeleton } from './Skeleton';

afterEach(cleanup);

it('is hidden from assistive technology', () => {
  const view = render(<Skeleton />);
  expect(view.container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
});

it('comes as a line, a short line or a block', () => {
  const view = render(
    <>
      <Skeleton />
      <Skeleton short />
      <Skeleton variant="block" />
    </>,
  );
  expect(view.container.querySelectorAll('[data-skeleton]')).toHaveLength(3);
  expect(view.container.querySelectorAll('[data-skeleton="block"]')).toHaveLength(1);
  expect(view.container.querySelectorAll('[data-short]')).toHaveLength(1);
});
