import { expect, it } from 'vitest';
import { read, tokenValue } from './design-tokens-support';

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

it('keeps the list beside the card in the narrow layout', () => {
  const narrow =
    /@media \(max-width: 800px\)\s*\{([\s\S]*?)\n\}/.exec(read('styles/recording.css'))?.[1] ?? '';
  expect(narrow).not.toMatch(/\.app-shell|\.sidebar/);
  expect(narrow).toMatch(/\.page-content\s*\{/);
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

it('insets the list header for the traffic lights on macOS only', () => {
  expect(tokenValue('--traffic-inset')).toBe('0px');
  expect(css()).toMatch(/:root\[data-platform='mac'\]\s*\{[^}]*--traffic-inset:\s*76px/);
});

it('drops the inset and the top band in full screen, after the macOS values', () => {
  const sheet = css();
  const block = /:root\[data-fullscreen\]\s*\{([^}]*)\}/.exec(sheet)?.[1] ?? '';
  expect(block).toMatch(/--chrome-band:\s*0px/);
  expect(block).toMatch(/--traffic-inset:\s*0px/);
  expect(sheet.indexOf(':root[data-fullscreen]')).toBeGreaterThan(
    sheet.indexOf(":root[data-platform='mac']"),
  );
});

it('scrolls the folder chips sideways, never the pane', () => {
  expect(read('styles/folder-filter.css')).toMatch(/\.folder-chips\s*\{[^}]*overflow-x:\s*auto/);
});

it('keeps the search clear of the traffic lights in a 52 px list header', () => {
  const pane = read('styles/list-pane.css');
  expect(pane).toMatch(
    /\.list-pane > \.list-pane-header\s*\{[^}]*height:\s*var\(--header-height\)/,
  );
  expect(pane).toMatch(
    /\.list-pane > \.list-pane-header\s*\{[^}]*padding:[^;]*max\(var\(--space-3\),\s*var\(--traffic-inset\)\)/,
  );
});

it('scrolls the list only, never the whole pane', () => {
  expect(read('styles/list-pane.css')).toMatch(/\.list-pane-body\s*\{[^}]*overflow-y:\s*auto/);
});

it('breaks a long search term inside the empty-list message', () => {
  expect(read('styles/empty-state.css')).toMatch(
    /\.empty-message-title\s*\{[^}]*overflow-wrap:\s*anywhere/,
  );
});
