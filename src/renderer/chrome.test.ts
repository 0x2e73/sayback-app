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

it('narrows the list and the card padding under 640 px', () => {
  const narrow =
    /@media \(max-width: 640px\)\s*\{([\s\S]*?)\n\}/.exec(read('styles/recording.css'))?.[1] ?? '';
  expect(narrow).toMatch(/--pane-list-width:\s*clamp\(200px,\s*38vw,\s*280px\)/);
  expect(narrow).toMatch(/\.page-content\s*\{[^}]*padding-inline:\s*var\(--space-3\)/);
});

it('scrolls the meeting in one container under a sticky tab bar, above a fixed player bar', () => {
  const detail = read('styles/meeting-detail.css');
  expect(detail).toMatch(/\.page-content:has\(> \.meeting-detail\)\s*\{[^}]*overflow:\s*hidden/);
  expect(detail).toMatch(/\.detail-scroll\s*\{[^}]*overflow-y:\s*auto/);
  expect(detail).toMatch(/\.detail-tabs\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/);
  expect(read('styles/playback-bar.css')).toMatch(
    /\.playback-bar\s*\{[^}]*flex:\s*none[^}]*height:\s*56px/,
  );
});

it('no longer nests a scrolling frame in the transcript', () => {
  expect(read('styles/meetings.css')).not.toMatch(
    /\.transcript-turns\s*\{[^}]*(?:max-height|overflow-y)/,
  );
});

it('draws the analysis line over the top of the card without moving the content', () => {
  const detail = read('styles/meeting-detail.css');
  expect(detail).toMatch(/\.analysis-line\s*\{[^}]*position:\s*absolute[^}]*top:\s*0/);
  expect(detail).not.toMatch(/\.meeting-detail\s*\{[^}]*position:/);
  expect(css()).toMatch(
    /prefers-reduced-motion[\s\S]*\.analysis-line-bar[\s\S]*?transition:\s*none/,
  );
});

it('reads the notes in a 680 px column', () => {
  expect(tokenValue('--reading-width')).toBe('680px');
  expect(read('styles/meeting-detail.css')).toMatch(
    /\.detail-column\s*\{[^}]*max-width:\s*var\(--reading-width\)/,
  );
});

it('keeps the floating notice above the player bar', () => {
  expect(read('styles/meeting-detail.css')).toMatch(
    /\.main-card:has\(\.playback-bar\) \.notice\.notice-floating\s*\{[^}]*bottom:/,
  );
});

it('lays the full screen button over the corner of the video block', () => {
  const detail = read('styles/meeting-detail.css');
  expect(detail).toMatch(/\.detail-video-block\s*\{[^}]*position:\s*relative/);
  expect(detail).toMatch(/\.detail-video-fullscreen\s*\{[^}]*position:\s*absolute/);
  expect(detail).toMatch(/\.detail-video:fullscreen\s*\{[^}]*width:\s*100vw/);
});
