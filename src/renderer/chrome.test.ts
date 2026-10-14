import { expect, it } from 'vitest';
import { read } from './design-tokens-support';

const css = () => read('styles.css');

it('lets the window be dragged from a band at the top', () => {
  expect(css()).toMatch(/\.window-band\s*\{[^}]*-webkit-app-region:\s*drag/);
});

it('keeps every control clickable inside a drag band', () => {
  const selector = [
    'button',
    'input',
    'select',
    'textarea',
    'a',
    'label',
    'summary',
    'video',
    "\\[role='button'\\]",
    '\\[tabindex\\]',
  ].join(',\\s*');
  expect(css()).toMatch(new RegExp(`${selector}\\s*\\{[^}]*-webkit-app-region:\\s*no-drag`));
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

it('hands the band back to the page under a dialog or a full-screen video', () => {
  expect(css()).toMatch(/\.dialog\s*\{[^}]*-webkit-app-region:\s*no-drag/);
  expect(css()).toMatch(
    /:root:has\(dialog\[open\]\) \.window-band,\s*:root:has\(:fullscreen\) \.window-band\s*\{[^}]*-webkit-app-region:\s*no-drag/,
  );
});

it('keeps the left pane band on its own line in the narrow layout', () => {
  expect(read('styles/recording.css')).toMatch(
    /@media \(max-width: 800px\)[\s\S]*\.sidebar \.window-band\s*\{[^}]*flex-basis:\s*100%/,
  );
});

it('keeps the onboarding logo clear of the traffic lights in one column', () => {
  expect(read('styles/onboarding.css')).toMatch(
    /@media \(max-width: 850px\)[\s\S]*\.onboarding-visual\s*\{[^}]*padding-top:\s*max\(24px,\s*var\(--chrome-band\)\)/,
  );
});

it('lets the onboarding text be selected and clicked under the band', () => {
  expect(read('styles/onboarding.css')).toMatch(
    /\.onboarding-copy\s*\{[^}]*-webkit-app-region:\s*no-drag/,
  );
});

it('keeps a drag band on the screens that have no shell', () => {
  expect(css()).toMatch(/\.window-band-fixed\s*\{[^}]*position:\s*fixed/);
});
