// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { meetingFixture } from '../../test-api';
import { slowTransitions } from '../../slow-transitions.test-support';
import { groupByDate } from './date-groups';
import { ALL_MEETINGS } from './list-filter';
import { ListBody } from './ListBody';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const now = new Date(2026, 9, 14, 10, 0);
const meetings = [meetingFixture('a', 'Revue produit', new Date(2026, 9, 14, 8).toISOString())];

function body(overrides: Partial<ComponentProps<typeof ListBody>> = {}) {
  return (
    <ListBody
      loading={false}
      groups={groupByDate(meetings, now)}
      total={1}
      scope={ALL_MEETINGS}
      query=""
      folders={[]}
      selectedId={null}
      now={now}
      locked={false}
      arrivedIds={new Set()}
      onSelect={vi.fn()}
      onMenu={vi.fn()}
      onSearchEverywhere={vi.fn()}
      {...overrides}
    />
  );
}

it('lets the empty message go with an exit when the list arrives', () => {
  slowTransitions();
  const view = render(body({ groups: [], total: 0 }));
  expect(screen.getByText('Aucune réunion')).toBeInTheDocument();
  view.rerender(body());
  const leaving = screen.getByText('Aucune réunion').closest('.list-view');
  expect(leaving).toHaveAttribute('data-state', 'closing');
  expect(screen.getByRole('option', { name: /Revue produit/ })).toBeInTheDocument();
  fireEvent.transitionEnd(leaving!, { propertyName: 'opacity' });
  expect(screen.queryByText('Aucune réunion')).toBeNull();
});

it('keeps the last rows on screen while the list empties', () => {
  slowTransitions();
  const view = render(body());
  view.rerender(body({ groups: [], total: 0 }));
  const leaving = screen.getByRole('option', { name: /Revue produit/ }).closest('.list-view');
  expect(leaving).toHaveAttribute('data-state', 'closing');
  expect(screen.getByText('Aucune réunion')).toBeInTheDocument();
});

it('cuts nothing in tests, where nothing transitions', () => {
  const view = render(body());
  view.rerender(body({ groups: [], total: 0 }));
  expect(screen.queryByRole('option')).toBeNull();
});
