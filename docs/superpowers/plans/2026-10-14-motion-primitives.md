# Motion and Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the renderer's motion on one curve and three durations, remove the broken animations, and give `Button`, `Notice` and `Dialog` the behaviour the later screens need, replacing `window.confirm` with an in-app confirmation.

**Architecture:** Duration tokens join the `:root` block. Every `@keyframes` and the single `prefers-reduced-motion` block live in `styles.css`; feature sheets only reference them. One grouped rule in `styles.css` gives interactive elements their colour transitions. The token guard extends to durations, easing and the location of keyframes. Components change only where an existing screen uses them; new primitives (`Field`, `Select`, `Segmented`, `Chip`…) arrive with the screens that need them, per the project rule "extract on a real second use". `ConfirmDialog` is extracted now because it has two users: meeting deletion and folder deletion.

**Tech Stack:** Electron 44, React 19, plain CSS, Vitest 4 with jsdom for component tests (`// @vitest-environment jsdom`, Testing Library), TypeScript strict with `noUncheckedIndexedAccess`.

**Spec:** `docs/superpowers/specs/2026-10-13-main-window-redesign-design.md`, delivery step 2 and the "Motion" section.

## Global Constraints

- Read `AGENTS.md` and every file in `.codex/rules/` before changing code.
- One curve: `var(--ease-out)`. Durations: `var(--duration-fast)` 120 ms, `var(--duration-base)` 200 ms, `var(--duration-slow)` 220 ms; `var(--duration-loop)` 1 s for the spinner only, with `linear`. No exit animation anywhere.
- Animate only `opacity`, `transform`, `background-color`, `color`, `border-color`. Never `height`, `width`, `top`, `left`, `box-shadow`.
- Reduced motion: entrances become opacity only, press scale and spinner rotation stop, colour transitions stay.
- No layout or copy change beyond what a task states. No new screen structure: that is steps 3 to 8.
- `npm run check` green at the end of every task. Commits under `0x2e73`, conventional messages, no AI attribution.
- Branch: `redesign/motion-primitives` (already created from `main`).

## Review Focus

1. **A form that stops submitting.** `Button` gets `type="button"` by default. Every current form already passes `type="submit"` explicitly (`ApiSettingsForm.tsx:246`, `NewMeetingDialog.tsx:93`, `ClarificationForm.tsx:55`, `FolderBoard.tsx:59` raw button). Pinned in Task 3 by a test that a `Button` inside a form does not submit unless asked, and by the existing form tests staying green.
2. **Closing a dialog mid-deletion.** Escape, the close button or a backdrop click while a deletion runs would unmount the dialog and lose the result. Pinned in Task 5: when `busy`, none of the three closes.
3. **Double confirmation.** Two quick clicks on « Supprimer » call delete twice. Pinned in Task 6: the confirm button is disabled while `busy`.
4. **A click inside the dialog's padding closing it.** Backdrop detection on the `<dialog>` element also catches its own padding. Pinned in Task 5 by moving the padding to an inner wrapper and testing that a click on the content does not close.
5. **Silent drop.** Removing the landing flash removes the only drop feedback. Pinned in Task 2 by a polite announcement « Réunion déplacée dans « Acme ». ».

---

## File Structure

| File                                                                                                                   | Change                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/renderer/styles.css`                                                                                              | Duration tokens, all keyframes, one reduced-motion block, grouped colour transitions, `.sr-only` |
| `src/renderer/styles/library.css`, `onboarding.css`, `recording.css`, `shared.css`, `meetings.css`, `model-select.css` | Remove local keyframes, delays, reduced-motion blocks and literal durations                      |
| `src/renderer/design-tokens.test.ts`                                                                                   | Durations, easing and keyframes location                                                         |
| `src/renderer/components/AppShell.tsx`                                                                                 | Drop the `app-enter` class                                                                       |
| `src/renderer/features/library/MeetingRow.tsx`                                                                         | Dragging state in React                                                                          |
| `src/renderer/features/library/FolderBoard.tsx`                                                                        | Drop announcement, `ConfirmDialog` for folder deletion                                           |
| `src/renderer/components/Button.tsx` (+ test)                                                                          | Default `type`, stable busy layout, press                                                        |
| `src/renderer/components/Notice.tsx` (+ test)                                                                          | `tone`                                                                                           |
| `src/renderer/components/Dialog.tsx` (+ test)                                                                          | Inner wrapper, `footer`, `busy`, backdrop close, entrance                                        |
| `src/renderer/components/ConfirmDialog.tsx` (+ test)                                                                   | New                                                                                              |
| `src/renderer/features/meetings/DeleteMeetingDialog.tsx`, `MeetingDetail.tsx`                                          | Use `ConfirmDialog`; warning tone for a failed analysis                                          |
| `src/renderer/components/ui.tsx`                                                                                       | Export `ConfirmDialog`                                                                           |

---

### Task 1: Motion system in CSS

**Files:**

- Modify: `src/renderer/design-tokens.test.ts`
- Modify: `src/renderer/styles.css`, `src/renderer/styles/library.css`, `onboarding.css`, `recording.css`
- Modify: `src/renderer/components/AppShell.tsx:18`

**Interfaces:**

- Produces: tokens `--duration-fast`, `--duration-base`, `--duration-slow`, `--duration-loop`; keyframes `state-enter`, `fade-enter`, `spin`; class `.sr-only`.

- [ ] **Step 1: Extend the guard**

In `src/renderer/design-tokens.test.ts`, add next to the existing helpers:

```ts
const motionProperty = /^(?:transition|animation)(?:-[a-z-]+)?$/;
const timeLiteral = /(?<![\w-])\d*\.?\d+m?s\b/;
const easingLiteral = /\b(?:ease(?:-in|-out|-in-out)?|cubic-bezier|steps)\b/;
const withoutVars = (value: string) => value.replace(/var\(--[a-z0-9-]+\)/g, '');
```

and inside `describe('design tokens', …)`, reusing the existing sheet list and `sheetBody`:

```ts
it.each(sheets)('%s takes durations and easing from tokens', (sheet) => {
  const offenders = declarations(sheetBody(sheet))
    .filter(({ property }) => motionProperty.test(property))
    .filter(({ value }) => {
      const rest = withoutVars(value);
      return timeLiteral.test(rest) || easingLiteral.test(rest);
    })
    .map(({ property, value }) => `${property}: ${value}`);
  expect(offenders).toEqual([]);
});

it.each(sheets.filter((sheet) => sheet !== 'styles.css'))(
  '%s keeps keyframes and reduced motion in styles.css',
  (sheet) => {
    expect(read(sheet)).not.toMatch(/@keyframes|prefers-reduced-motion/);
  },
);
```

Use whatever name the existing test gives the list of every sheet; if it is not called `sheets`, keep its name.

- [ ] **Step 2: Run the guard and watch it fail**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: FAIL. `library.css` reports `animation: dashboard-enter 280ms …`, `transition: background-color 160ms ease`; `onboarding.css` and `recording.css` report their keyframes and reduced-motion blocks.

- [ ] **Step 3: Add the tokens, keyframes and shared motion to `styles.css`**

In the `:root` block, after `--ease-out`:

```css
--duration-fast: 120ms;
--duration-base: 200ms;
--duration-slow: 220ms;
--duration-loop: 1s;
```

After the base element rules (before `.app-shell`), add:

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Colour feedback for every interactive surface. Kept under reduced motion. */
.button,
.nav-item,
.tabs button,
.meeting-row,
.folder-item,
.folder-entry,
.folder-action,
.transcript-turn,
.timestamp-link,
.capture-source-row,
.model-select-trigger,
.model-select-list button,
.field,
.onboarding-progress span {
  transition:
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.spin {
  animation: spin var(--duration-loop) linear infinite;
}

@keyframes state-enter {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}
@keyframes fade-enter {
  from {
    opacity: 0;
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  @keyframes state-enter {
    from {
      opacity: 0;
    }
  }
  .spin {
    animation: none;
  }
}
```

Redefining `state-enter` inside the media query makes every entrance opacity-only under reduced motion, with no per-component override. Tasks 3 and 5 add their reduced-motion lines to this same block.

If `.field` or `.onboarding-progress span` do not exist under those names, use the actual selectors of the text fields and the onboarding progress marks and say so in the report.

- [ ] **Step 4: Remove the local motion from the feature sheets**

`library.css`:

- Delete the cascade: the five-selector `animation: dashboard-enter …` rule, the three `animation-delay` rules and `@keyframes dashboard-enter` (lines 9 to 38 today).
- In the `@media (hover: hover) and (pointer: fine)` block at line 41, delete the `.meeting-row` transition, the `.row-arrow` transition and the `.meeting-row:hover .row-arrow` transform. Keep `color: var(--color-accent)` on hover if you want the arrow tinted; it then transitions through nothing, which is fine.
- Delete the `@media (prefers-reduced-motion: reduce)` blocks (line 58 and line 271).
- `.folder-item[data-drag-over='true'], .folder-entry[data-drag-over='true']`: delete the `transform` line. Keep `outline` and `background`.
- Delete `.folder-item[data-dropped='true'], .folder-entry[data-dropped='true']` and `@keyframes folder-land`.
- Delete the second `@media (hover: hover) and (pointer: fine)` block with the `transform 220ms…opacity 180ms` transition (line 244). The grouped rule in `styles.css` replaces it.

`onboarding.css`:

- Line 10: delete `animation: app-enter 260ms var(--ease-out) both;`.
- Line 76: delete `animation: symbol-enter 420ms var(--ease-out) both;`.
- Line 123: replace with `animation: state-enter var(--duration-base) var(--ease-out);`.
- Line 165: delete `transition: background-color 160ms ease;` (the grouped rule covers it).
- Delete `@keyframes app-enter`, `@keyframes copy-enter`, `@keyframes symbol-enter`, `@keyframes fade-enter` and the `@media (prefers-reduced-motion: reduce)` block.

`recording.css`:

- Line 136: delete `transition: background-color 150ms ease;` on `.capture-source-row`.
- Delete `.spin`, `@keyframes spin` and the `@media (prefers-reduced-motion: reduce)` block at the end.

`src/renderer/components/AppShell.tsx:18`: `className="app-shell app-enter"` becomes `className="app-shell"`.

- [ ] **Step 5: Run the guard**

Run: `npx vitest run src/renderer/design-tokens.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the project checks and commit**

```bash
npm run check
git add src/renderer/styles.css src/renderer/styles src/renderer/design-tokens.test.ts src/renderer/components/AppShell.tsx
git commit -m "style: one curve, three durations, motion defined in one place"
```

---

### Task 2: Dragging state and drop announcement

**Files:**

- Modify: `src/renderer/features/library/MeetingRow.tsx`
- Modify: `src/renderer/features/library/FolderBoard.tsx` (`useFolderDrop`, lines 123 to 157 today, and the board render)
- Modify: `src/renderer/styles/library.css` (`.meeting-row.is-dragging`)
- Test: `src/renderer/features/library/Library.test.tsx`

**Interfaces:**

- Consumes: `.sr-only` from Task 1; `MEETING_DRAG_TYPE` from `FolderBoard.tsx`; the `folders` prop of `FolderBoard`.

- [ ] **Step 1: Write the failing tests**

Add to `Library.test.tsx`, following the drag setup the file already uses for its existing drop test (same `render(<Library … />)` call, same `dataTransfer` stub):

```tsx
it('marks the row being dragged and clears it when the drag ends', () => {
  // render the library with one meeting, as the existing drag test does
  const row = screen.getByText('Point hebdo').closest('.meeting-row')!;
  fireEvent.dragStart(row, { dataTransfer: dataTransferStub() });
  expect(row).toHaveClass('is-dragging');
  fireEvent.dragEnd(row);
  expect(row).not.toHaveClass('is-dragging');
});

it('announces where a dropped meeting went', async () => {
  // render with a folder named "Acme" and onMove resolving to true
  fireEvent.drop(screen.getByRole('button', { name: /Acme/ }), {
    dataTransfer: dataTransferStub('m1'),
  });
  expect(await screen.findByRole('status')).toHaveTextContent('Réunion déplacée dans « Acme ».');
});
```

Replace the comments with the file's own setup and helper names; if the file has no `dataTransferStub`, write one:

```ts
const dataTransferStub = (meetingId = 'm1') => {
  const data = new Map([[MEETING_DRAG_TYPE, meetingId]]);
  return {
    types: [MEETING_DRAG_TYPE],
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => void data.set(type, value),
    effectAllowed: 'move',
    dropEffect: 'move',
  };
};
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/features/library/Library.test.tsx`
Expected: FAIL. The class is set imperatively today, so it may pass; the announcement test fails with "Unable to find role status".

- [ ] **Step 3: Move the dragging flag into React**

`MeetingRow.tsx`:

```tsx
import { useState } from 'react';
```

```tsx
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`meeting-row${dragging ? ' is-dragging' : ''}`}
      draggable={!movingDisabled}
      onDragStart={(event) => {
        event.dataTransfer.setData(MEETING_DRAG_TYPE, meeting.id);
        event.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    >
```

The browser captures the drag image during `dragstart`, before React re-renders, so the ghost keeps full opacity.

`library.css`: the `.meeting-row.is-dragging` rule keeps only `opacity: 0.5;` (delete its `transform`).

- [ ] **Step 4: Replace the landing flash with an announcement**

In `useFolderDrop`, replace `recentDrop` and its timeout:

```tsx
function useFolderDrop(onMove: FolderBoardProps['onMove'], folders: Folder[]) {
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  async function drop(event: DragEvent<HTMLElement>, id: string | null): Promise<void> {
    event.preventDefault();
    setDragTarget(null);
    const meetingId = event.dataTransfer.getData(MEETING_DRAG_TYPE);
    if (meetingId && (await onMove(meetingId, id))) {
      const folder = folders.find((item) => item.id === id);
      setAnnouncement(
        folder ? `Réunion déplacée dans « ${folder.name} ».` : 'Réunion retirée de son dossier.',
      );
    }
  }
```

Delete `'data-dropped': recentDrop === key,` from `dropProps`, return `{ dropProps, announcement }`, pass `props.folders` where the hook is called, and render once inside the board:

```tsx
<p className="sr-only" role="status" aria-live="polite">
  {announcement}
</p>
```

Import the `Folder` type if the file does not already.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/renderer/features/library/Library.test.tsx`
Expected: PASS, existing cases included.

- [ ] **Step 6: Run the project checks and commit**

```bash
npm run check
git add src/renderer/features/library src/renderer/styles/library.css
git commit -m "feat: announce drops and track dragging in React state"
```

---

### Task 3: Button

**Files:**

- Modify: `src/renderer/components/Button.tsx`
- Modify: `src/renderer/styles/shared.css` (`.button` rules)
- Modify: `src/renderer/styles.css` (reduced-motion block)
- Create: `src/renderer/components/Button.test.tsx`

**Interfaces:**

- Produces: `Button` with the same props as today; `type` defaults to `'button'`; busy keeps the label in the DOM, hidden, so the width does not change; `aria-busy` while busy.

- [ ] **Step 1: Write the failing tests**

`src/renderer/components/Button.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';

afterEach(cleanup);

it('does not submit a form unless asked to', () => {
  const submit = vi.fn((event: Event) => event.preventDefault());
  render(
    <form onSubmit={(event) => submit(event.nativeEvent)}>
      <Button>Annuler</Button>
      <Button type="submit">Enregistrer</Button>
    </form>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(submit).toHaveBeenCalledOnce();
});

it('keeps its label while busy and blocks clicks', () => {
  const click = vi.fn();
  render(
    <Button busy onClick={click}>
      Supprimer
    </Button>,
  );
  const button = screen.getByRole('button', { name: 'Supprimer' });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
  fireEvent.click(button);
  expect(click).not.toHaveBeenCalled();
});

it('is not marked busy when idle', () => {
  render(<Button>Exporter</Button>);
  expect(screen.getByRole('button', { name: 'Exporter' })).not.toHaveAttribute('aria-busy');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/components/Button.test.tsx`
Expected: FAIL on the form test (the button submits) and on `aria-busy`.

- [ ] **Step 3: Implement**

`src/renderer/components/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
}

export function Button(props: ButtonProps) {
  const {
    variant = 'primary',
    className = '',
    busy = false,
    type = 'button',
    children,
    disabled,
    ...attributes
  } = props;
  return (
    <button
      type={type}
      className={`button button-${variant} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...attributes}
    >
      <span className="button-label">{children}</span>
      {busy && <LoaderCircle size={16} className="spin button-spinner" aria-hidden="true" />}
    </button>
  );
}
```

`shared.css`, on `.button` add `position: relative;`, then add:

```css
.button-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}
.button[aria-busy='true'] .button-label {
  visibility: hidden;
}
.button-spinner {
  position: absolute;
  inset: 0;
  margin: auto;
}
.button:active:not(:disabled) {
  transform: scale(0.97);
}
```

The grouped transition from Task 1 does not include `transform`; add a separate declaration so the press animates without overriding the colour transitions:

```css
.button {
  transition:
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out);
}
```

Place it after the grouped rule's sheet in the cascade (it is in `shared.css`, imported after `styles.css`).

In the reduced-motion block of `styles.css`, add:

```css
.button:active:not(:disabled) {
  transform: none;
}
.button[aria-busy='true'] .button-label {
  visibility: visible;
  opacity: 0.4;
}
.button[aria-busy='true'] .button-spinner {
  display: none;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/renderer/components/Button.test.tsx && npx vitest run`
Expected: PASS, and every existing test still passes (queries by role and name see through the label span).

- [ ] **Step 5: Run the project checks and commit**

```bash
npm run check
git add src/renderer/components/Button.tsx src/renderer/components/Button.test.tsx src/renderer/styles/shared.css src/renderer/styles.css
git commit -m "feat: button never submits by accident and keeps its width while busy"
```

---

### Task 4: Notice tones

**Files:**

- Modify: `src/renderer/components/Notice.tsx`
- Modify: `src/renderer/styles/recording.css` (`.notice`)
- Modify: `src/renderer/features/meetings/MeetingDetail.tsx:46`
- Create: `src/renderer/components/Notice.test.tsx`

**Interfaces:**

- Produces: `Notice({ children, tone?: 'danger' | 'warning' | 'info', retry? })`; `danger` is the default and keeps `role="alert"`; the other tones use `role="status"`.

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Notice } from './Notice';

afterEach(cleanup);

it('interrupts for a danger notice by default', () => {
  render(<Notice>Impossible de supprimer la réunion.</Notice>);
  expect(screen.getByRole('alert')).toHaveClass('notice', 'notice-danger');
});

it('reports a warning politely', () => {
  render(<Notice tone="warning">L’analyse n’a pas abouti.</Notice>);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('status')).toHaveClass('notice-warning');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/components/Notice.test.tsx`
Expected: FAIL: no `notice-danger` class, no `tone` prop.

- [ ] **Step 3: Implement**

```tsx
import type { ReactNode } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { Button } from './Button';

interface NoticeProps {
  children: ReactNode;
  tone?: 'danger' | 'warning' | 'info';
  retry?: () => void;
}

export function Notice({ children, tone = 'danger', retry }: NoticeProps) {
  const Icon = tone === 'info' ? Info : AlertCircle;
  return (
    <div className={`notice notice-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={17} aria-hidden="true" />
      <span>{children}</span>
      {retry && (
        <Button variant="ghost" onClick={retry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
```

`recording.css`, the `.notice` rule becomes layout plus the danger tone, and two tones follow:

```css
.notice {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 12px 15px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}
.notice > span {
  flex: 1;
  min-width: 0;
}
.notice-danger {
  background: var(--color-danger-tint);
  color: var(--color-danger);
}
.notice-warning {
  background: var(--color-paused-tint);
  color: var(--color-paused);
}
.notice-info {
  background: var(--color-accent-tint);
  color: var(--color-accent);
}
```

Use the tint token names exactly as they are declared in `styles.css`.

`MeetingDetail.tsx:46`: `error` is `actions.error || meeting.error` (line 27). An action failure stays danger; a failed analysis matches the amber « À reprendre » badge:

```tsx
{
  error && <Notice tone={actions.error ? 'danger' : 'warning'}>{error}</Notice>;
}
```

- [ ] **Step 4: Run the tests and the project checks, then commit**

```bash
npx vitest run src/renderer/components/Notice.test.tsx
npm run check
git add src/renderer/components/Notice.tsx src/renderer/components/Notice.test.tsx src/renderer/styles/recording.css src/renderer/features/meetings/MeetingDetail.tsx
git commit -m "feat: notice tones, amber for a failed analysis"
```

---

### Task 5: Dialog

**Files:**

- Modify: `src/renderer/components/Dialog.tsx`
- Modify: `src/renderer/styles/recording.css` (`.dialog`, `.dialog-heading`, new `.dialog-inner`, `.dialog-footer`)
- Create: `src/renderer/components/Dialog.test.tsx`

**Interfaces:**

- Produces: `Dialog({ title, children, footer?: ReactNode, busy?: boolean, onClose })`. While `busy`, Escape, the close button and a backdrop click do nothing. The footer stays visible at the bottom when the content scrolls.

- [ ] **Step 1: Write the failing tests**

jsdom may not implement `showModal`; the test stubs it.

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from './Dialog';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
});
afterEach(cleanup);

const dialogElement = () => document.querySelector('dialog')!;

it('closes on a backdrop click but not on a click inside', () => {
  const close = vi.fn();
  render(
    <Dialog title="Nouvelle réunion" onClose={close}>
      <p>Contenu</p>
    </Dialog>,
  );
  fireEvent.click(screen.getByText('Contenu'));
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(dialogElement());
  expect(close).toHaveBeenCalledOnce();
});

it('stays open while busy, whatever the user does', () => {
  const close = vi.fn();
  render(
    <Dialog title="Supprimer cette réunion ?" busy onClose={close}>
      <p>Contenu</p>
    </Dialog>,
  );
  fireEvent.click(dialogElement());
  fireEvent(dialogElement(), new Event('cancel', { cancelable: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
  expect(close).not.toHaveBeenCalled();
});

it('renders a footer when given one', () => {
  render(
    <Dialog title="Titre" footer={<button type="button">Valider</button>} onClose={() => {}}>
      <p>Contenu</p>
    </Dialog>,
  );
  expect(screen.getByRole('button', { name: 'Valider' }).closest('.dialog-footer')).not.toBeNull();
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/components/Dialog.test.tsx`
Expected: FAIL: no backdrop close, no `busy`, no footer.

- [ ] **Step 3: Implement**

```tsx
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface DialogProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  onClose(): void;
}

export function Dialog({ title, children, footer, busy = false, onClose }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        // The padding lives on .dialog-inner, so only the backdrop targets the dialog itself.
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2>{title}</h2>
          <Button variant="ghost" onClick={close} disabled={busy} aria-label="Fermer">
            <X size={18} />
          </Button>
        </div>
        {children}
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </dialog>
  );
}
```

`recording.css`: move the `padding: 26px;` from `.dialog` to a new `.dialog-inner { padding: 26px; }` and set `.dialog { padding: 0; }`. Add:

```css
.dialog[open] {
  animation: state-enter var(--duration-base) var(--ease-out);
}
.dialog[open]::backdrop {
  animation: fade-enter var(--duration-base) var(--ease-out);
}
.dialog-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin: 22px -26px -26px;
  padding: 16px 26px;
  border-top: 1px solid var(--color-border);
  background: var(--color-overlay);
}
```

`.dialog` is the scroll container (`overflow-y: auto`, no padding), so `bottom: 0` pins the footer to its visible bottom edge; the negative margins cancel the padding of `.dialog-inner`.

- [ ] **Step 4: Run the tests, the whole suite and the project checks, then commit**

```bash
npx vitest run src/renderer/components/Dialog.test.tsx
npm run check
git add src/renderer/components/Dialog.tsx src/renderer/components/Dialog.test.tsx src/renderer/styles/recording.css
git commit -m "feat: dialog closes on the backdrop, never mid-operation, with a fixed footer"
```

---

### Task 6: ConfirmDialog for meetings and folders

**Files:**

- Create: `src/renderer/components/ConfirmDialog.tsx`, `src/renderer/components/ConfirmDialog.test.tsx`
- Modify: `src/renderer/components/ui.tsx`
- Modify: `src/renderer/features/meetings/DeleteMeetingDialog.tsx`
- Modify: `src/renderer/features/library/FolderBoard.tsx` (the delete button at line 108 and the board state)
- Test: `src/renderer/features/library/Library.test.tsx`

**Interfaces:**

- Consumes: `Dialog` with `footer` and `busy` from Task 5; `Button` from Task 3.
- Produces: `ConfirmDialog({ title, children, confirmLabel, busy?, onConfirm(): void | Promise<void>, onClose })`.

- [ ] **Step 1: Write the failing tests**

`ConfirmDialog.test.tsx` (same `showModal` stub as Task 5):

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
});
afterEach(cleanup);

it('confirms or cancels', () => {
  const confirm = vi.fn();
  const close = vi.fn();
  render(
    <ConfirmDialog
      title="Supprimer « Acme » ?"
      confirmLabel="Supprimer le dossier"
      onConfirm={confirm}
      onClose={close}
    >
      Les réunions qu’il contient restent disponibles, sans dossier.
    </ConfirmDialog>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(close).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer le dossier' }));
  expect(confirm).toHaveBeenCalledOnce();
});

it('cannot be confirmed twice or cancelled while busy', () => {
  const confirm = vi.fn();
  const close = vi.fn();
  render(
    <ConfirmDialog
      title="Supprimer cette réunion ?"
      confirmLabel="Supprimer"
      busy
      onConfirm={confirm}
      onClose={close}
    >
      Texte
    </ConfirmDialog>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(confirm).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});
```

In `Library.test.tsx` (stub `showModal` the same way at the top of the file if it is not already):

```tsx
it('asks in the app before deleting a folder', async () => {
  // render with a folder "Acme" and an onDeleteFolder spy, as the file's setup allows
  const confirmSpy = vi.spyOn(window, 'confirm');
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer Acme' }));
  expect(confirmSpy).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'Supprimer le dossier' }));
  expect(onDeleteFolder).toHaveBeenCalledWith('f1');
});
```

Adapt the render call and the spy name to the props `Library` passes down to `FolderBoard`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/components/ConfirmDialog.test.tsx src/renderer/features/library/Library.test.tsx`
Expected: FAIL: `ConfirmDialog` does not exist; `window.confirm` is called.

- [ ] **Step 3: Implement `ConfirmDialog`**

```tsx
import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm(): void | Promise<void>;
  onClose(): void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { title, children, confirmLabel, busy = false, onConfirm, onClose } = props;
  return (
    <Dialog
      title={title}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" busy={busy} onClick={() => void onConfirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{children}</p>
    </Dialog>
  );
}
```

Export it from `ui.tsx`: `export { ConfirmDialog } from './ConfirmDialog';`

- [ ] **Step 4: Use it for meetings**

`DeleteMeetingDialog.tsx`:

```tsx
import { ConfirmDialog } from '../../components/ui';

interface DeleteMeetingDialogProps {
  busy: boolean;
  onClose(): void;
  onDelete(): Promise<void>;
}

export function DeleteMeetingDialog({ busy, onClose, onDelete }: DeleteMeetingDialogProps) {
  async function remove() {
    await onDelete();
    onClose();
  }

  return (
    <ConfirmDialog
      title="Supprimer cette réunion ?"
      confirmLabel="Supprimer"
      busy={busy}
      onConfirm={remove}
      onClose={onClose}
    >
      Les notes et les enregistrements locaux seront supprimés. Cette action est définitive.
    </ConfirmDialog>
  );
}
```

- [ ] **Step 5: Use it for folders**

In `FolderBoard`, hold the folder awaiting confirmation and the busy flag at board level:

```tsx
const [confirming, setConfirming] = useState<Folder | null>(null);
const [deleting, setDeleting] = useState(false);

async function deleteConfirmed(folder: Folder) {
  setDeleting(true);
  try {
    await props.onDelete(folder.id);
  } finally {
    setDeleting(false);
    setConfirming(null);
  }
}
```

The per-folder delete button calls `onRequestDelete(folder)` (a new prop of the folder entry component, replacing its use of `onDelete`) instead of `window.confirm`. The board renders:

```tsx
{
  confirming && (
    <ConfirmDialog
      title={`Supprimer « ${confirming.name} » ?`}
      confirmLabel="Supprimer le dossier"
      busy={deleting}
      onConfirm={() => deleteConfirmed(confirming)}
      onClose={() => setConfirming(null)}
    >
      Les réunions qu’il contient restent disponibles, sans dossier.
    </ConfirmDialog>
  );
}
```

Use the board's real prop name for deletion if it is not `onDelete`.

- [ ] **Step 6: Run the tests, the project checks, and commit**

```bash
npx vitest run src/renderer/components src/renderer/features/library
npm run check
git add src/renderer/components src/renderer/features/meetings/DeleteMeetingDialog.tsx src/renderer/features/library
git commit -m "feat: in-app confirmation for deleting meetings and folders"
```

---

### Task 7: Final verification

- [ ] **Step 1: Search for leftovers**

```bash
grep -rnE "window\.confirm|classList|data-dropped|app-enter|dashboard-enter|folder-land|symbol-enter|copy-enter" src/renderer
```

Expected: no output.

- [ ] **Step 2: Run the project checks**

Run: `npm run check`
Expected: all green. Copy the summary lines into the report.

- [ ] **Step 3: Report**

List the commits, the check summary, any deviation from this plan with file and line, and anything the eye should check: dialog entrance and backdrop, busy buttons keeping their width, press feedback, the onboarding step change, drag over a folder, reduced motion turned on in macOS settings.
