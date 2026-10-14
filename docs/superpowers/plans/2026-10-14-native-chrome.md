# Native Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the main window a native macOS chrome: no separate title bar, traffic lights inside a translucent left pane, content in an opaque card, a document that never scrolls; and remove the top bar, the footer and the marketing copy.

**Architecture:** A pure `windowChrome(platform)` in the main process returns the platform's `BrowserWindow` options, so the macOS and Windows/Linux paths are both unit-tested. The renderer marks the root with `data-platform`, and CSS tokens switch between a transparent macOS ground under vibrancy and an opaque ground elsewhere. The existing sidebar becomes the left pane (its navigation stays until step 4 replaces it with the meeting list); the right side becomes a card that scrolls on its own.

**Tech Stack:** Electron 44, React 19, plain CSS, Vitest 4 (node and jsdom), TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-10-13-main-window-redesign-design.md`, delivery step 3, "Layout" section.

## Global Constraints

- Read `AGENTS.md` and every file in `.codex/rules/` before changing code.
- macOS options, validated by a throwaway window on 2026-10-14: `titleBarStyle: 'hiddenInset'`, `trafficLightPosition: { x: 16, y: 18 }`, `vibrancy: 'sidebar'`, `visualEffectState: 'active'`, `backgroundColor: '#00000000'`, no `transparent`. The left pane carries a 20 % dark veil.
- Windows and Linux keep the default frame and an opaque `#0f1117` background, equal to `--color-bg`.
- Full-screen handling of the traffic-light inset is out of scope: Chromium does not expose native full screen to CSS (`display-mode: fullscreen` stays false, measured), and the inset only matters once the search sits in the band (step 4).
- No new colour, size or radius literal: the token guard must stay green.
- `npm run check` green at the end of every task. Commits under `0x2e73`, conventional messages, no AI attribution.
- Branch: `redesign/native-chrome` (already created from `main`).

## Review Focus

1. **A window that cannot be moved.** Without a title bar, only `-webkit-app-region: drag` areas move the window, including on the onboarding screen. Pinned in Task 2 by a CSS test that the drag band exists in the shell and on the onboarding screen.
2. **Controls swallowed by a drag region.** A button inside a drag band stops receiving clicks. Pinned in Task 2 by a global `no-drag` rule on interactive elements, checked by a CSS test.
3. **Content hidden under the traffic lights.** Pinned in Task 2: the left pane's content starts below `--chrome-band`.
4. **Windows and Linux regressing.** Pinned in Task 1 by the `windowChrome('win32')` and `('linux')` tests: opaque background, no vibrancy, default title bar.
5. **A page that no longer scrolls.** With `overflow: hidden` on the document, long pages (settings, a long transcript) must scroll inside the card. Pinned in Task 2 by a CSS test on `.page-content` and checked by eye in Task 5.

---

### Task 1: Window chrome per platform

**Files:**

- Create: `src/main/window-chrome.ts`, `src/main/window-chrome.test.ts`
- Modify: `src/main/window.ts`
- Modify: `src/renderer/design-tokens.test.ts` (remove the window background case, which moves here)

**Interfaces:**

- Produces: `windowChrome(platform: NodeJS.Platform): Pick<BrowserWindowConstructorOptions, 'backgroundColor' | 'titleBarStyle' | 'trafficLightPosition' | 'vibrancy' | 'visualEffectState'>`.

- [ ] **Step 1: Write the failing test**

`src/main/window-chrome.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { windowChrome } from './window-chrome';

const pageBackground = () => {
  const css = readFileSync(join(import.meta.dirname, '../renderer/styles.css'), 'utf8');
  return /--color-bg:\s*([^;]+);/.exec(css)?.[1]?.trim();
};

describe('windowChrome', () => {
  it('lets the vibrancy show through on macOS', () => {
    expect(windowChrome('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: 'sidebar',
      visualEffectState: 'active',
      backgroundColor: '#00000000',
    });
  });

  it.each(['win32', 'linux'] as const)(
    'keeps the default frame on %s, painted like the page',
    (platform) => {
      expect(windowChrome(platform)).toEqual({ backgroundColor: pageBackground() });
    },
  );
});
```

If ESLint forbids `node:fs` in `src/main` tests, check how `src/main/media-protocol.test.ts` reads files and do the same.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/main/window-chrome.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/main/window-chrome.ts`:

```ts
import type { BrowserWindowConstructorOptions } from 'electron';

type WindowChrome = Pick<
  BrowserWindowConstructorOptions,
  'backgroundColor' | 'titleBarStyle' | 'trafficLightPosition' | 'vibrancy' | 'visualEffectState'
>;

// The opaque colour equals --color-bg in src/renderer/styles.css, so no flash before the CSS loads.
export function windowChrome(platform: NodeJS.Platform): WindowChrome {
  if (platform !== 'darwin') return { backgroundColor: '#0f1117' };
  return {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
  };
}
```

`src/main/window.ts`: import it and replace `backgroundColor: '#0f1117',` with `...windowChrome(process.platform),`.

In `src/renderer/design-tokens.test.ts`, delete the case « paints the window with the page background before the CSS loads » and any import it alone used.

- [ ] **Step 4: Run the tests and the project checks, then commit**

```bash
npx vitest run src/main/window-chrome.test.ts src/renderer/design-tokens.test.ts
npm run check
git add src/main/window-chrome.ts src/main/window-chrome.test.ts src/main/window.ts src/renderer/design-tokens.test.ts
git commit -m "feat: native window chrome on macOS, default frame elsewhere"
```

---

### Task 2: Platform marker, drag bands and the card layout

**Files:**

- Create: `src/renderer/platform.ts`, `src/renderer/platform.test.ts`, `src/renderer/chrome.test.ts`
- Modify: `src/renderer/main.tsx`
- Modify: `src/renderer/styles.css` (tokens, base, shell)
- Modify: `src/renderer/components/AppShell.tsx`
- Modify: `src/renderer/App.tsx` (`OnboardingScreen` wrapper)
- Modify: `src/renderer/styles/onboarding.css`
- Modify: `src/renderer/design-tokens-support.ts` (only if the guard must learn the new `:root[data-platform='mac']` block)

**Interfaces:**

- Produces: `platformOf(platform: string): 'mac' | 'other'`; `document.documentElement.dataset.platform`; tokens `--chrome-band`, `--color-sidebar`, `--color-sidebar-veil`; classes `.window-band`, `.main-card`.

- [ ] **Step 1: Write the failing tests**

`src/renderer/platform.test.ts`:

```ts
import { expect, it } from 'vitest';
import { platformOf } from './platform';

it.each([
  ['MacIntel', 'mac'],
  ['MacPPC', 'mac'],
  ['Win32', 'other'],
  ['Linux x86_64', 'other'],
  ['', 'other'],
])('%s is %s', (platform, expected) => {
  expect(platformOf(platform)).toBe(expected);
});
```

`src/renderer/chrome.test.ts`, using the helpers of `design-tokens-support.ts` (`read`, `declarations` or their real names):

```ts
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
```

Add to `src/renderer/App.test.tsx`, reusing its setup:

```tsx
it('has no top bar, footer or marketing line around the workspace', async () => {
  render(<App api={apiFor()} />);
  await screen.findByRole('navigation', { name: 'Navigation principale' });
  for (const text of [
    'Espace de travail',
    'En local',
    'Un peu moins à retenir. Un peu plus à partager.',
  ]) {
    expect(screen.queryByText(text, { exact: false })).toBeNull();
  }
  expect(document.querySelector('.main-card')).not.toBeNull();
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/platform.test.ts src/renderer/chrome.test.ts src/renderer/App.test.tsx`
Expected: FAIL: `platform.ts` missing, CSS rules missing, « Espace de travail » still rendered.

- [ ] **Step 3: Mark the platform**

`src/renderer/platform.ts`:

```ts
export function platformOf(platform: string): 'mac' | 'other' {
  return platform.startsWith('Mac') ? 'mac' : 'other';
}
```

`src/renderer/main.tsx`, before `createRoot`:

```ts
document.documentElement.dataset.platform = platformOf(navigator.platform);
```

- [ ] **Step 4: Tokens and base**

In the `:root` token block of `styles.css`, add:

```css
--chrome-band: 0px;
--color-sidebar-veil: rgb(15 17 23 / 0.2);
--color-sidebar: var(--color-bg);
```

After the token block (and after the `prefers-contrast` block), add:

```css
:root[data-platform='mac'] {
  --chrome-band: 52px;
  --color-sidebar: var(--color-sidebar-veil);
  background: transparent;
}
```

If the token guard reports this block (it declares no literal, so it should not), teach `design-tokens-support.ts` to treat `:root[data-platform=…]` blocks as token overrides, the way it treats the `prefers-contrast` block.

Base rules:

```css
html,
body,
#root {
  height: 100%;
}
body {
  margin: 0;
  overflow: hidden;
  font-size: var(--text-body);
}
button,
input,
select,
textarea,
a {
  -webkit-app-region: no-drag;
}
.window-band {
  height: var(--chrome-band);
  flex: none;
  -webkit-app-region: drag;
}
```

Merge `body` with the existing `body` rule instead of declaring it twice.

- [ ] **Step 5: The shell**

`src/renderer/components/AppShell.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Sidebar, type WorkspaceSection } from './Sidebar';

interface AppShellProps {
  section: WorkspaceSection;
  recording: boolean;
  count: number;
  onNavigate(section: WorkspaceSection): void;
  children: ReactNode;
}

export function AppShell(props: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar
        section={props.section}
        count={props.count}
        locked={props.recording}
        onNavigate={props.onNavigate}
      />
      <main className="main-card">
        <div className="window-band" aria-hidden="true" />
        <div className="page-content">{props.children}</div>
      </main>
    </div>
  );
}
```

`styles.css`, replace `.app-shell`, `.sidebar`, `.main-content`, `.topbar`, `.topbar-note`, `.workspace-footer` and `.page-content` with:

```css
.app-shell {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  height: 100%;
}
.sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-height: 0;
  padding: 0 12px 16px;
  background: var(--color-sidebar);
}
.main-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  margin: var(--space-2) var(--space-2) var(--space-2) 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-pane);
  overflow: hidden;
}
.page-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 36px 72px;
}
.page-content > * {
  width: min(100%, 1128px);
  margin-inline: auto;
}
```

The sidebar's first child must be a `.window-band` (Task 3 adds it). Keep the existing `@media (max-width: 800px)` rules working: the window's minimum width is 900 px, so they only matter if that minimum changes; adjust selectors that pointed at `.topbar` or `.workspace-footer` by deleting them.

- [ ] **Step 6: Onboarding can be dragged too**

In `App.tsx`, the `OnboardingScreen` render gets a band as its first child, and `onboarding.css` gives `.onboarding` `height: 100%` and room for it. Concretely: render `<div className="window-band onboarding-band" aria-hidden="true" />` as the first element inside the onboarding root (in `Onboarding.tsx` if that is where the root `<main className="onboarding">` lives), with:

```css
.onboarding-band {
  position: fixed;
  inset: 0 0 auto;
  z-index: 1;
}
```

The fixed band covers the top of both onboarding columns; « Passer » stays clickable through the global `no-drag` rule. Check that the onboarding brand at the top left is not under the traffic lights; if it is, push it down by `var(--chrome-band)`.

- [ ] **Step 7: Run the tests and the project checks, then commit**

```bash
npx vitest run src/renderer
npm run check
git add src/renderer
git commit -m "feat: draggable bands, translucent left pane and content card"
```

---

### Task 3: Left pane without brand or slogans

**Files:**

- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/styles.css` (delete `.brand*`, `.workspace-label`, `.sidebar-bottom`, `.local-card*`, `.local-icon`, `.version`, `.status-dot` if unused)
- Test: `src/renderer/App.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('keeps only the navigation in the left pane', async () => {
  render(<App api={apiFor()} />);
  const nav = await screen.findByRole('navigation', { name: 'Navigation principale' });
  const pane = nav.closest('.sidebar')!;
  for (const text of ['Votre espace personnel', 'Votre mémoire, chez vous.', 'Espace local']) {
    expect(pane).not.toHaveTextContent(text);
  }
  expect(pane.firstElementChild).toHaveClass('window-band');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/renderer/App.test.tsx`
Expected: FAIL: the brand, label and storage card are rendered.

- [ ] **Step 3: Implement**

`Sidebar.tsx` renders:

```tsx
<aside className="sidebar">
  <div className="window-band" aria-hidden="true" />
  <nav aria-label="Navigation principale">{/* the two existing nav buttons, unchanged */}</nav>
</aside>
```

Delete `LocalStorageCard`, the brand block, the `workspace-label` line and the imports they alone used (`LockKeyhole`, the logo). Delete the CSS rules listed above that no other component uses (check with `grep` before deleting `.status-dot` and `.brand-dot`, which the onboarding may use).

- [ ] **Step 4: Run the tests and the project checks, then commit**

```bash
npx vitest run src/renderer/App.test.tsx
npm run check
git add src/renderer
git commit -m "feat: left pane holds the navigation only"
```

---

### Task 4: Pages without marketing copy

**Files:**

- Modify: `src/renderer/features/library/LibraryPage.tsx`
- Modify: `src/renderer/features/settings/SettingsView.tsx`
- Modify: `src/renderer/styles/shared.css` (delete `.intro-strip*`, `.intro-icon`), `src/renderer/styles.css` (delete `.heading-dot`; keep `.eyebrow`, the onboarding uses it)
- Test: `src/renderer/features/library/Library.test.tsx` or `App.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('opens on the meetings without slogans', async () => {
  render(<App api={apiFor()} />);
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Mes réunions' }),
  ).toBeInTheDocument();
  for (const text of [
    'Moins de notes. Plus de présence.',
    'Les conversations passent. Les bonnes idées restent.',
    'Gardez toute la conversation.',
  ]) {
    expect(screen.queryByText(text)).toBeNull();
  }
});
```

Add the same check for the settings page (« À votre façon », « Vos données chez vous. Votre IA à portée de main. ») by navigating there the way `App.test.tsx` already does, if it does; otherwise render `SettingsView` with `apiFor()`.

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL: the heading's accessible name is « Mes réunions. » and the slogans are present.

- [ ] **Step 3: Implement**

`LibraryPage.tsx`: the heading block becomes

```tsx
<div className="page-heading">
  <h1>Mes réunions</h1>
  <Button onClick={onNew}>
    <Plus size={17} />
    Nouvelle réunion
  </Button>
</div>
```

and the `intro-strip` block is deleted with the imports it alone used (`AudioLines`, `ArrowUpRight`).

`SettingsView.tsx`: the heading block becomes `<div className="page-heading"><h1>Paramètres</h1></div>`.

Delete the CSS that no longer has a user. `.page-heading` aligns its children with `align-items: center` now that the title has no subtitle.

- [ ] **Step 4: Run the tests and the project checks, then commit**

```bash
npx vitest run src/renderer
npm run check
git add src/renderer
git commit -m "feat: library and settings open on their content, without slogans"
```

---

### Task 5: Verification

- [ ] **Step 1: Leftovers**

```bash
grep -rnE "topbar|workspace-footer|intro-strip|local-card|workspace-label|heading-dot|Espace de travail|Moins de notes|Un peu moins à retenir" src/renderer
```

Expected: no output.

- [ ] **Step 2: Project checks**

Run: `npm run check`. Copy the summary lines into the report.

- [ ] **Step 3: Report**

Commits, check summary, deviations with file and line, and what to look at in the real app (`npm run dev` on macOS): traffic lights inside the left pane, window draggable from both bands and from the onboarding, buttons inside bands clickable, settings and a long transcript scroll inside the card, the left pane over a light and a dark wallpaper.
