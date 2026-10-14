# Dark Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the whole SayBack renderer dark by replacing every colour, font size, weight, letter spacing, radius and gap literal in the CSS with design tokens, without changing any structure or behaviour.

**Architecture:** One `:root` token block at the top of `src/renderer/styles.css` holds every value. Feature stylesheets reference tokens only. A Vitest guard reads the stylesheets and fails on any literal outside the token block, so the rule survives the later redesign steps. Sheets are migrated one task at a time; the guard covers each sheet as it is migrated, so the suite is green after every commit.

**Tech Stack:** Electron 44, React 19, plain CSS, Vitest 4 (`environment: 'node'`), TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-10-13-main-window-redesign-design.md`, delivery step 1. Tokens and their names come from its "Tokens" section and from `docs/superpowers/specs/2026-10-13-menubar-live-panel-design.md`.

## Global Constraints

- Read `AGENTS.md` and every file in `.codex/rules/` before changing code.
- CSS and two one-line non-CSS edits only (`index.html` meta, `window.ts` background). No TSX, no class name, no layout, no animation change. Animations and durations belong to step 2.
- Dark values sit directly on `:root` with `color-scheme: dark`. No light theme, no theme class.
- Paddings, margins, widths, heights and line heights keep their literals in this step. They are migrated when each screen is rewritten.
- `npm run check` (format, typecheck, lint, test, build) is green at the end of every task.
- Commits under the repo-local identity `0x2e73`, conventional messages, no AI attribution of any kind.
- Branch: `redesign/dark-tokens`, from `main`.

## Review Focus

1. **Contrast on dark grounds.** Subtle text over a raised surface is the weakest pair; a reader expects every text token to stay readable (4.5:1) and the focus ring to stand out (3:1). Pinned by the contrast test in Task 1.
2. **White flash on launch.** The window paints its `backgroundColor` before the CSS loads; a reader expects no flash. Pinned in Task 1 by a test that `window.ts` and `--color-bg` hold the same value.
3. **Native controls left light.** `<select>`, checkboxes, scrollbars, `<dialog>`, video controls follow `color-scheme`; a `<dialog>` with no background keeps the UA canvas. Pinned in Task 3 (`.dialog` gets `--color-overlay`) and checked by eye in Task 7.
4. **Statuses that look identical.** Five meeting statuses, three of them unstyled today. Pinned in Task 3 by a test that every status has a `.badge-<status>` rule.
5. **A literal reintroduced later.** Pinned by the guard covering every sheet in Task 7.

---

## File Structure

| File                                                     | Responsibility                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/renderer/styles.css`                                | Token block, base element styles, shell (migrated in Task 1)     |
| `src/renderer/design-tokens.test.ts`                     | Guard: literals, contrast, window background, status rules (new) |
| `src/renderer/index.html`                                | `color-scheme` meta                                              |
| `src/main/window.ts`                                     | Window background colour                                         |
| `src/renderer/styles/shared.css`                         | Buttons, fields, local setup (Task 2)                            |
| `src/renderer/styles/recording.css`                      | Recording, notice, badges, dialog (Task 3)                       |
| `src/renderer/styles/library.css`                        | Library page, folders, rows (Task 4)                             |
| `src/renderer/styles/meetings.css`                       | Detail, notes, transcript (Task 5)                               |
| `src/renderer/styles/onboarding.css`, `model-select.css` | Onboarding, model picker (Task 6)                                |

## Mapping tables (used by Tasks 1 to 6)

Apply these by the role the declaration plays. When a value appears in a role the table does not list, use the nearest role and say so in the task report.

### Text (`color`)

| Literal                                                                                                                           | Token                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `#17212b #1c344f #20354c #243343 #243b55 #253443 #263a50 #263f5c`                                                                 | `var(--color-text)`                                                              |
| `#415f80 #435160 #445261 #526273 #526476 #5f6e7b #61758b #62707f`                                                                 | `var(--color-text-muted)`                                                        |
| `#65778b #66788a #697d91 #71808c #74889f #768492 #788795 #7c8995 #8696a7 #8793a0 #8797a7 #9aa5ae #9aa8b7 #9baabb #a8b3bc #b5bec5` | `var(--color-text-subtle)`                                                       |
| `#3769aa #386eb9 #3974d6 #4b84df #557ba9 #6e9ed8`                                                                                 | `var(--color-accent)`                                                            |
| `#267953 #27805b #2f6f4f`                                                                                                         | `var(--color-ready)`                                                             |
| `#9a711b`                                                                                                                         | `var(--color-paused)`                                                            |
| `#a6413b #ae4840 #b84c45`                                                                                                         | `var(--color-live)` when the rule is about recording, else `var(--color-danger)` |
| `#fff` (text on primary or danger buttons)                                                                                        | `var(--color-on-action)`                                                         |

### Backgrounds (`background`, `background-color`)

| Literal                                                                           | Token                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `#f6f8fa` on the page or the onboarding ground                                    | `var(--color-bg)`                                                                           |
| `#fff` on a dialog, popover or dropdown list                                      | `var(--color-overlay)`                                                                      |
| `#fff` anywhere else (cards, rows, inputs, chips)                                 | `var(--color-surface)`                                                                      |
| `#f8fbff #f7f9fb #f6f9fd #f5f7fa #f3f7fc #f2f5f8 #f1f5fa #f0f5fb #edf1f5 #edf2f7` | `var(--color-surface)`                                                                      |
| `#eff4fa #eff5fc #eff5fd #eaf3ff #edf4ff #edf3fb #eef4fb #e9f1fc #dce6f1`         | `var(--color-surface-raised)`                                                               |
| `#273b54`                                                                         | `var(--color-action)`                                                                       |
| `#1c3049`                                                                         | `var(--color-action-hover)`                                                                 |
| `#3974d6`                                                                         | `var(--color-accent)`                                                                       |
| `#c54747`                                                                         | `var(--color-danger)`                                                                       |
| `#58b98d`                                                                         | `var(--color-ready)`                                                                        |
| `#000 #15202b` (video and preview grounds)                                        | `var(--color-pane)`                                                                         |
| `#17212b80` (`::backdrop`)                                                        | `var(--color-backdrop)`                                                                     |
| `#fff0ef #fff6f5`                                                                 | `color-mix(in srgb, var(--color-danger) 14%, transparent)`, or `--color-live` for recording |
| `#fff5df`                                                                         | `color-mix(in srgb, var(--color-paused) 14%, transparent)`                                  |
| `#e8f6ef #dcf4e9`                                                                 | `color-mix(in srgb, var(--color-ready) 14%, transparent)`                                   |

### Borders and outlines (`border*`, `outline*`)

| Literal                                                           | Token                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `#dfe7ee #e2e7ed #e3e9ee #e4e9ed #e4ebf3 #e5eaf0 #e8edf1 #edf0f3` | `var(--color-border)`                                         |
| `#cadcf2 #cfdef1 #d9e5f3 #dbe3e9 #dbe5ef #dce4eb #dce5f0 #dce6f1` | `var(--color-border-strong)`                                  |
| `#3974d6`                                                         | `var(--color-accent)` (or `var(--color-focus)` in an outline) |
| `#91b9e9 #9db9dc #a8c4ea #b9d2f7`                                 | `var(--color-accent-soft)`                                    |
| `#273b54`                                                         | `var(--color-action)`                                         |
| `#c54747`                                                         | `var(--color-danger)`                                         |
| `#eed6d4`                                                         | `color-mix(in srgb, var(--color-danger) 30%, transparent)`    |

### Other colour properties

| Declaration                                                 | Replacement                         |
| ----------------------------------------------------------- | ----------------------------------- |
| `accent-color: #3974d6`                                     | `accent-color: var(--color-accent)` |
| `box-shadow: 0 25px 70px #182d412b` (dialog)                | `box-shadow: var(--shadow-float)`   |
| `box-shadow: 0 14px 36px #17212b1c` (popover)               | `box-shadow: var(--shadow-float)`   |
| `box-shadow: 0 20px 50px #3569a91a`, `0 9px 25px #3974d62e` | delete the declaration              |

### Type, radius, gap

| Literal                                                                                   | Token                                                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| font-size `0.72rem 0.74rem 0.76rem 0.78rem 0.8rem`                                        | `var(--text-caption)`                                        |
| font-size `0.82rem 0.83rem 0.84rem 0.85rem 0.86rem 0.88rem`                               | `var(--text-control)`                                        |
| font-size `0.9rem 0.92rem 1rem`                                                           | `var(--text-body)`                                           |
| font-size `1.08rem`, `clamp(1.05rem, 1.4vw, 1.26rem)`                                     | `var(--text-section)`                                        |
| font-size `1.25rem 1.28rem 1.35rem` (h2, card and dialog titles)                          | `var(--text-title)`                                          |
| font-size `clamp(2rem, 4vw, 3rem)`, `clamp(2.5rem, 4.5vw, 4.6rem)` (h1, onboarding title) | `var(--text-title-lg)`                                       |
| font-size `3.5rem` (recording timer)                                                      | `var(--text-timer-lg)`                                       |
| font-weight `420`                                                                         | `400`                                                        |
| font-weight `650 700 760`                                                                 | `600`                                                        |
| letter-spacing `-0.025em -0.045em -0.05em`                                                | `-0.02em`                                                    |
| letter-spacing `0.06em 0.1em`                                                             | `0`, and delete `text-transform: uppercase` in the same rule |
| border-radius `5px 6px 7px 8px 9px 10px`                                                  | `var(--radius-sm)`                                           |
| border-radius `11px 12px 14px`                                                            | `var(--radius-md)`                                           |
| border-radius `15px 16px 28%`                                                             | `var(--radius-lg)`                                           |
| border-radius `20px 50%`                                                                  | `var(--radius-pill)`                                         |
| gap `2px 3px 4px 5px`                                                                     | `var(--space-1)`                                             |
| gap `6px 7px 8px 9px`                                                                     | `var(--space-2)`                                             |
| gap `10px 11px 12px`                                                                      | `var(--space-3)`                                             |
| gap `14px 16px`                                                                           | `var(--space-4)`                                             |
| gap `18px 20px 22px 24px`                                                                 | `var(--space-5)`                                             |

`border-radius: 0` stays. A `gap` with two values maps each value separately.

---

### Task 0: Branch and pending files

**Files:** none changed; commits the specs, the plan and the logo already on disk.

- [ ] **Step 1: Check the identity and create the branch**

```bash
git config user.name   # expected: 0x2e73
git config user.email  # expected: 89457451+0x2e73@users.noreply.github.com
git switch -c redesign/dark-tokens
```

- [ ] **Step 2: Commit the design documents**

```bash
git add docs/superpowers/specs/2026-10-13-main-window-redesign-design.md docs/superpowers/specs/2026-10-13-menubar-live-panel-design.md docs/superpowers/plans/2026-10-14-dark-tokens.md
git commit -m "docs: add main window redesign and menu bar panel specs"
```

- [ ] **Step 3: Commit the logo**

```bash
git add build/icon.png build/icon.svg build/tray-icon.svg
git commit -m "feat: new ghost app icon and menu bar glyph"
```

---

### Task 1: Token block, base styles and the guard

**Files:**

- Create: `src/renderer/design-tokens.test.ts`
- Modify: `src/renderer/styles.css` (whole file: token block, base, shell)
- Modify: `src/renderer/index.html` (head)
- Modify: `src/main/window.ts:16`

**Interfaces:**

- Produces: the token names in the block below, used by every later task; `migratedSheets` in the test, which each later task extends by one or two entries.

- [ ] **Step 1: Write the guard test**

`src/renderer/design-tokens.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDir = import.meta.dirname;
const read = (path: string) => readFileSync(join(rendererDir, path), 'utf8');

// Each task adds the sheets it migrates. Task 7 replaces this list with every sheet.
const migratedSheets = ['styles.css'];

const colourLiteral = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:white|black)\b/i;
const tokenOnly = /^(?:font-size|border-radius|gap|row-gap|column-gap)$/;
const allowed: Record<string, Set<string>> = {
  'font-weight': new Set(['400', '500', '600', 'inherit']),
  'letter-spacing': new Set(['0', '-0.02em', 'normal']),
};

type Declaration = { property: string; value: string };

function tokenBlock(css: string): string {
  const match = /^:root\s*\{[\s\S]*?^\}/m.exec(css);
  if (!match) throw new Error('styles.css must start with the :root token block');
  return match[0];
}

function declarations(css: string): Declaration[] {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return body
    .split(/[;{}]/)
    .map((chunk) => /^\s*([a-z-]+)\s*:\s*([\s\S]+?)\s*$/.exec(chunk))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(([, property = '', value = '']) => ({ property, value: value.replace(/\s+/g, ' ') }));
}

function sheetBody(sheet: string): string {
  const css = read(sheet);
  return sheet === 'styles.css' ? css.replace(tokenBlock(css), '') : css;
}

function tokenValue(name: string): string {
  const value = new RegExp(`${name}:\\s*([^;]+);`).exec(tokenBlock(read('styles.css')))?.[1];
  if (!value) throw new Error(`missing token ${name}`);
  return value.trim();
}

type Rgba = [number, number, number, number];

function parseColour(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1];
  if (hex) {
    const n = Number.parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] ? Number(rgb[4]) : 1];
  throw new Error(`unparsed colour ${value}`);
}

function over(top: Rgba, ground: Rgba): Rgba {
  const alpha = top[3];
  const mix = (i: 0 | 1 | 2) => top[i] * alpha + ground[i] * (1 - alpha);
  return [mix(0), mix(1), mix(2), 1];
}

function luminance([r, g, b]: Rgba): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: string, ...grounds: string[]): number {
  const ground = grounds
    .map((token) => parseColour(tokenValue(token)))
    .reduceRight((below, layer) => over(layer, below));
  const text = over(parseColour(tokenValue(foreground)), ground);
  const [a, b] = [luminance(text), luminance(ground)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('design tokens', () => {
  it.each(migratedSheets)('%s has no colour literal outside the token block', (sheet) => {
    const offenders = declarations(sheetBody(sheet))
      .filter(({ value }) => colourLiteral.test(value))
      .map(({ property, value }) => `${property}: ${value}`);
    expect(offenders).toEqual([]);
  });

  it.each(migratedSheets)('%s takes type, radius and gap from tokens', (sheet) => {
    const offenders = declarations(sheetBody(sheet))
      .filter(({ property, value }) => {
        if (tokenOnly.test(property)) return value !== '0' && !value.startsWith('var(');
        const values = allowed[property];
        return values !== undefined && !values.has(value);
      })
      .map(({ property, value }) => `${property}: ${value}`);
    expect(offenders).toEqual([]);
  });

  it.each([
    ['--color-text', ['--color-bg', '--color-surface-raised'], 4.5],
    ['--color-text-muted', ['--color-bg', '--color-surface-raised'], 4.5],
    ['--color-text-subtle', ['--color-bg', '--color-surface-raised'], 4.5],
    ['--color-accent', ['--color-bg', '--color-surface'], 4.5],
    ['--color-focus', ['--color-bg'], 3],
    ['--color-on-action', ['--color-action'], 4.5],
  ] as const)('%s stays readable over %j', (foreground, grounds, minimum) => {
    expect(contrast(foreground, ...grounds)).toBeGreaterThanOrEqual(minimum);
  });

  it('paints the window with the page background before the CSS loads', () => {
    const windowSource = readFileSync(join(rendererDir, '../main/window.ts'), 'utf8');
    const background = /backgroundColor:\s*'([^']+)'/.exec(windowSource)?.[1];
    expect(background).toBe(tokenValue('--color-bg'));
  });
});
```

In the contrast cases the grounds stack from the bottom: `['--color-bg', '--color-surface-raised']` means the raised surface composited over the page background.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: FAIL. `styles.css` reports colour literals such as `color: #17212b` and sizes such as `font-size: 1.25rem`; the token lookups throw `missing token --color-text`; the window test receives `#f8fafc`.

- [ ] **Step 3: Replace the top of `styles.css` with the token block and dark base**

Replace the current `:root { … }` rule (lines 1 to 13) with:

```css
:root {
  color-scheme: dark;

  --color-bg: #0f1117;
  --color-pane: #0a0b10;
  --color-surface: rgb(255 255 255 / 0.05);
  --color-surface-raised: rgb(255 255 255 / 0.09);
  --color-overlay: #161a23;
  --color-backdrop: rgb(0 0 0 / 0.5);
  --color-border: rgb(255 255 255 / 0.09);
  --color-border-strong: rgb(255 255 255 / 0.16);
  --color-text: rgb(255 255 255 / 0.95);
  --color-text-muted: rgb(255 255 255 / 0.72);
  --color-text-subtle: rgb(255 255 255 / 0.55);
  --color-accent: #7aa9ff;
  --color-accent-soft: color-mix(in srgb, var(--color-accent) 45%, transparent);
  --color-focus: #7aa9ff;
  --color-action: #f4f6fa;
  --color-action-hover: #ffffff;
  --color-on-action: #0d1017;
  --color-live: #ff6b61;
  --color-danger: #ff6b61;
  --color-paused: #f5b94a;
  --color-ready: #5fd3a0;

  --font-ui: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
  --text-caption: 0.75rem;
  --text-control: 0.8125rem;
  --text-body: 0.875rem;
  --text-section: 0.9375rem;
  --text-title: 1rem;
  --text-title-lg: 1.5rem;
  --text-timer-lg: 3rem;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 999px;

  --shadow-float: 0 12px 40px rgb(0 0 0 / 0.45), 0 0 0 1px var(--color-border);
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);

  font-family: var(--font-ui);
  color: var(--color-text);
  background: var(--color-bg);
  font-synthesis: none;
  -webkit-font-smoothing: antialiased;
}
```

Then, in the same file:

```css
body {
  margin: 0;
  font-size: var(--text-body);
}
```

```css
:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
```

```css
h1 {
  font-size: var(--text-title-lg);
  font-weight: 600;
  letter-spacing: -0.02em;
}
h2 {
  font-size: var(--text-title);
  font-weight: 600;
  letter-spacing: -0.02em;
}
h3 {
  font-size: var(--text-body);
  font-weight: 600;
}
```

Migrate every other declaration below the token block with the mapping tables, including the `text-transform: uppercase` at line 117.

- [ ] **Step 4: Add the colour scheme meta**

In `src/renderer/index.html`, after the viewport meta:

```html
<meta name="color-scheme" content="dark" />
```

- [ ] **Step 5: Paint the window dark**

In `src/main/window.ts`, line 16:

```ts
    backgroundColor: '#0f1117',
```

- [ ] **Step 6: Run the guard**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: PASS, all cases.

- [ ] **Step 7: Run the project checks**

Run: `npm run check`
Expected: format, typecheck, lint, test and build all pass.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/design-tokens.test.ts src/renderer/styles.css src/renderer/index.html src/main/window.ts
git commit -m "style: dark design tokens and guard for the renderer base"
```

---

### Task 2: Buttons, fields and local setup

**Files:**

- Modify: `src/renderer/styles/shared.css`
- Modify: `src/renderer/design-tokens.test.ts` (`migratedSheets`)

**Interfaces:**

- Consumes: the tokens from Task 1.

- [ ] **Step 1: Cover the sheet**

```ts
const migratedSheets = ['styles.css', 'styles/shared.css'];
```

- [ ] **Step 2: Run the guard and watch it fail**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: FAIL on `styles/shared.css`, listing literals such as `background: #273b54`.

- [ ] **Step 3: Migrate the sheet**

The primary and danger buttons become:

```css
.button-primary {
  border-color: var(--color-action);
  background: var(--color-action);
  color: var(--color-on-action);
}
.button-primary:hover {
  background: var(--color-action-hover);
}
.button-danger {
  border-color: var(--color-danger);
  background: var(--color-danger);
  color: var(--color-on-action);
}
```

Every other declaration follows the mapping tables.

- [ ] **Step 4: Run the guard**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the project checks and commit**

```bash
npm run check
git add src/renderer/styles/shared.css src/renderer/design-tokens.test.ts
git commit -m "style: dark tokens for buttons and fields"
```

---

### Task 3: Recording, notice, badges and dialog

**Files:**

- Modify: `src/renderer/styles/recording.css`
- Modify: `src/renderer/design-tokens.test.ts`

**Interfaces:**

- Consumes: the tokens from Task 1; the `MeetingStatus` values from `src/shared/contracts.ts` (`recording`, `recorded`, `processing`, `ready`, `error`) as rendered by `StatusBadge` (`badge badge-<status>` with an empty inner `<span />`).

- [ ] **Step 1: Cover the sheet and pin the statuses**

```ts
const migratedSheets = ['styles.css', 'styles/shared.css', 'styles/recording.css'];
```

Add inside the `describe`:

```ts
it.each(['recording', 'recorded', 'processing', 'ready', 'error'])(
  'styles the %s status',
  (status) => {
    expect(read('styles/recording.css')).toMatch(new RegExp(`\\.badge-${status}\\s*\\{`));
  },
);
```

- [ ] **Step 2: Run the guard and watch it fail**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: FAIL on `styles/recording.css` literals, and on `styles the recorded status`, `processing` and `error`.

- [ ] **Step 3: Rewrite the notice, badge and dialog rules**

Replace the `.notice`, `.badge`, `.badge-ready`, `.badge-recording`, `.dialog` and `.dialog::backdrop` rules with:

```css
.notice {
  padding: 12px 15px;
  border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-danger) 14%, transparent);
  color: var(--color-danger);
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 5px 9px;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-text-subtle);
  font-size: var(--text-caption);
}
.badge > span {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-pill);
  background: currentColor;
}
.badge-recorded > span {
  background: transparent;
  box-shadow: inset 0 0 0 1px currentColor;
}
.badge-processing {
  background: color-mix(in srgb, var(--color-accent) 14%, transparent);
  color: var(--color-accent);
}
.badge-ready {
  background: color-mix(in srgb, var(--color-ready) 14%, transparent);
  color: var(--color-ready);
}
.badge-recording {
  background: color-mix(in srgb, var(--color-live) 14%, transparent);
  color: var(--color-live);
}
.badge-error {
  background: color-mix(in srgb, var(--color-paused) 14%, transparent);
  color: var(--color-paused);
}
.dialog {
  width: min(92vw, 540px);
  max-height: min(88dvh, 820px);
  overflow-y: auto;
  padding: 26px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-overlay);
  color: var(--color-text);
  box-shadow: var(--shadow-float);
}
.dialog::backdrop {
  background: var(--color-backdrop);
}
```

"À reprendre" is amber, never red: nothing is lost. Every other declaration in the sheet, including the `text-transform: uppercase` at line 121, follows the mapping tables.

- [ ] **Step 4: Run the guard**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the project checks and commit**

```bash
npm run check
git add src/renderer/styles/recording.css src/renderer/design-tokens.test.ts
git commit -m "style: dark tokens for recording, notices, badges and dialogs"
```

---

### Task 4: Library

**Files:**

- Modify: `src/renderer/styles/library.css`
- Modify: `src/renderer/design-tokens.test.ts`

- [ ] **Step 1: Cover the sheet**

```ts
const migratedSheets = [
  'styles.css',
  'styles/shared.css',
  'styles/recording.css',
  'styles/library.css',
];
```

- [ ] **Step 2: Run the guard and watch it fail**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: FAIL on `styles/library.css` literals.

- [ ] **Step 3: Migrate the sheet with the mapping tables**

The drag-over `box-shadow: 0 9px 25px #3974d62e` is deleted. The `folder-land` keyframe ground `#dcf4e9` becomes `color-mix(in srgb, var(--color-ready) 14%, transparent)`. Do not change animations, durations or transforms: step 2 rewrites them.

- [ ] **Step 4: Run the guard**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the project checks and commit**

```bash
npm run check
git add src/renderer/styles/library.css src/renderer/design-tokens.test.ts
git commit -m "style: dark tokens for the library"
```

---

### Task 5: Meeting detail and transcript

**Files:**

- Modify: `src/renderer/styles/meetings.css`
- Modify: `src/renderer/design-tokens.test.ts`

- [ ] **Step 1: Cover the sheet**

```ts
const migratedSheets = [
  'styles.css',
  'styles/shared.css',
  'styles/recording.css',
  'styles/library.css',
  'styles/meetings.css',
];
```

- [ ] **Step 2: Run the guard and watch it fail**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: FAIL on `styles/meetings.css` literals.

- [ ] **Step 3: Migrate the sheet with the mapping tables**

The video ground `#000` becomes `var(--color-pane)`. The active transcript turn keeps its rule; its border `#a8c4ea` becomes `var(--color-accent-soft)` and its ground `#eff5fc` becomes `var(--color-surface-raised)`. Both `accent-color: #3974d6` become `var(--color-accent)`.

- [ ] **Step 4: Run the guard**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the project checks and commit**

```bash
npm run check
git add src/renderer/styles/meetings.css src/renderer/design-tokens.test.ts
git commit -m "style: dark tokens for meeting detail and transcript"
```

---

### Task 6: Onboarding and model picker

**Files:**

- Modify: `src/renderer/styles/onboarding.css`
- Modify: `src/renderer/styles/model-select.css`
- Modify: `src/renderer/design-tokens.test.ts`

- [ ] **Step 1: Cover the sheets**

```ts
const migratedSheets = [
  'styles.css',
  'styles/shared.css',
  'styles/recording.css',
  'styles/library.css',
  'styles/meetings.css',
  'styles/onboarding.css',
  'styles/model-select.css',
];
```

- [ ] **Step 2: Run the guard and watch it fail**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: FAIL on both sheets.

- [ ] **Step 3: Migrate both sheets with the mapping tables**

The onboarding ground `#f6f8fa` becomes `var(--color-bg)`; its symbol shadow `0 20px 50px #3569a91a` is deleted; its `28%` radius becomes `var(--radius-lg)`. The model list popover takes `background: var(--color-overlay)` and `box-shadow: var(--shadow-float)`.

- [ ] **Step 4: Run the guard**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the project checks and commit**

```bash
npm run check
git add src/renderer/styles/onboarding.css src/renderer/styles/model-select.css src/renderer/design-tokens.test.ts
git commit -m "style: dark tokens for onboarding and model picker"
```

---

### Task 7: Guard every sheet, then look at the app

**Files:**

- Modify: `src/renderer/design-tokens.test.ts`

- [ ] **Step 1: Make the guard cover every present and future sheet**

Replace the `migratedSheets` declaration and its comment with:

```ts
import { readdirSync } from 'node:fs';
```

(merged into the existing `node:fs` import), and:

```ts
const migratedSheets = [
  'styles.css',
  ...readdirSync(join(rendererDir, 'styles'))
    .filter((file) => file.endsWith('.css'))
    .map((file) => `styles/${file}`),
];
```

- [ ] **Step 2: Run the guard**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: PASS for all seven sheets.

- [ ] **Step 3: Run the project checks**

Run: `npm run check`
Expected: all green. Copy the summary lines into the task report.

- [ ] **Step 4: Look at the app**

Run: `npm run dev` and go through: onboarding (reset it from Settings › « Revoir l'introduction »), library with and without meetings, a meeting in each status, the detail on both tabs with a video, settings in local and remote mode, the new meeting dialog, a recording. For each, note any light ground, unreadable text, invisible border or control left light. Fix within the mapping tables; a fix that needs a new token goes into the token block and the report.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/design-tokens.test.ts
git commit -m "test: guard every renderer stylesheet against literals"
```
