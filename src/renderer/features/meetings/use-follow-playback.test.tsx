// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useRef } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { useFollowPlayback } from './use-follow-playback';

afterEach(cleanup);

function Harness({ listening = true }: { listening?: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const { following, follow } = useFollowPlayback(scroller, listening);
  return (
    <>
      <div data-testid="scroller" ref={scroller} tabIndex={0}>
        <button type="button">Lire à partir de 0:01</button>
        <input aria-label="Chercher dans la transcription" />
        <p>{following ? 'Suit la lecture' : 'Lecture libre'}</p>
      </div>
      <button type="button" onClick={follow}>
        Revenir au direct
      </button>
      <input aria-label="Ailleurs" />
    </>
  );
}

const scroller = () => screen.getByTestId('scroller');
const following = () => screen.queryByText('Suit la lecture') !== null;

it('follows until the reader scrolls with the wheel or a finger', () => {
  render(<Harness />);
  expect(following()).toBe(true);
  fireEvent.wheel(scroller(), { ctrlKey: true });
  expect(following()).toBe(true);
  fireEvent.wheel(scroller());
  expect(following()).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Revenir au direct' }));
  expect(following()).toBe(true);
  fireEvent.touchMove(scroller());
  expect(following()).toBe(false);
});

it('never stops on the scroll event, which the follow itself causes', () => {
  render(<Harness />);
  fireEvent.scroll(scroller());
  expect(following()).toBe(true);
});

it('stops on the scroll keys, not on a key a control or a field takes', () => {
  render(<Harness />);
  const time = screen.getByRole('button', { name: 'Lire à partir de 0:01' });
  fireEvent.keyDown(time, { key: 'ArrowDown' });
  fireEvent.keyDown(time, { key: ' ' });
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Chercher dans la transcription' }), {
    key: 'PageDown',
  });
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Ailleurs' }), { key: 'ArrowDown' });
  expect(following()).toBe(true);
  fireEvent.keyDown(time, { key: 'PageDown' });
  expect(following()).toBe(false);
});

it('stops on an arrow key pressed on the scroller itself', () => {
  render(<Harness />);
  fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
  expect(following()).toBe(false);
});

it('stops when the reader grabs the scrollbar, not when they click the content', () => {
  render(<Harness />);
  const element = scroller();
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: 800 });
  Object.defineProperty(element, 'offsetWidth', { configurable: true, value: 815 });
  const press = (offsetX: number) => {
    const event = createEvent.pointerDown(element);
    Object.defineProperty(event, 'offsetX', { value: offsetX });
    fireEvent(element, event);
  };
  press(400);
  expect(following()).toBe(true);
  press(805);
  expect(following()).toBe(false);
});

it('ignores gestures while it is not listening', () => {
  render(<Harness listening={false} />);
  fireEvent.wheel(scroller());
  expect(following()).toBe(true);
});
