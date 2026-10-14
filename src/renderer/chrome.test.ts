import { expect, it } from 'vitest';
import { read } from './design-tokens-support';

const css = () => read('styles.css');

it('lets the window be dragged from a band at the top', () => {
  expect(css()).toMatch(/\.window-band\s*\{[^}]*-webkit-app-region:\s*drag/);
});

it('keeps every control clickable inside a drag band', () => {
  expect(css()).toMatch(
    /button,\s*input,\s*select,\s*textarea,\s*a\s*\{[^}]*-webkit-app-region:\s*no-drag/,
  );
});

it('never scrolls the document, only the card content', () => {
  expect(css()).toMatch(/html,\s*body,\s*#root\s*\{[^}]*height:\s*100%/);
  expect(css()).toMatch(/body\s*\{[^}]*overflow:\s*hidden/);
  expect(css()).toMatch(/\.page-content\s*\{[^}]*overflow-y:\s*auto/);
});

it('opens the ground to the vibrancy on macOS only', () => {
  expect(css()).toMatch(/:root\[data-platform='mac'\]\s*\{[^}]*background:\s*transparent/);
  expect(css()).toMatch(/:root\[data-platform='mac'\]\s*\{[^}]*--chrome-band:\s*52px/);
});
