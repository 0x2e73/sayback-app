// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SpeakerLabel } from './SpeakerLabel';

afterEach(cleanup);

it('names the voice, its dot left to the eye', () => {
  const { container } = render(<SpeakerLabel name="Intervenant A" tone={2} />);
  expect(screen.getByText('Intervenant A')).toBeInTheDocument();
  expect(container).toHaveTextContent(/^Intervenant A$/);
  expect(container.querySelector('[aria-hidden="true"]')).toBeEmptyDOMElement();
});
