# Meeting Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the meeting detail into one reading column in the right card: a title and a single meta line (folder chip, date, duration, status or analysis progress), a full-width sticky « Notes » / « Transcription » segmented control, notes in a 680 px column with every timestamp, `mm:ss` clarifications, and a fixed 56 px bar with a continuous player and an action pill. « Le contexte », the « Passage audio » `<select>` and the `AnalysisProgress` block disappear.

**Architecture:** Pure, Node-tested modules carry the decisions: `detail-format.ts` (date, duration, `m:ss`), `moment.ts` (`mm:ss` → seconds), `analysis-progress.ts`, `detail-notices.ts`, `playback-timeline.ts` (extracts → one timeline) and `MediaDriver` (one media element, targets that wait for metadata). `useMediaPlayback` is rewritten on top of them and returns one `Playback` object that the footer bar, the video block, the notes and the transcript share. Presentational components (`Segmented`, `FolderControl`, `AnalysisStatus`, `NotesView`, `Clarifications`, `PlaybackBar`, `MeetingActions`) are built and tested alone, then `MeetingDetail` assembles them in Task 11; the layout and the dead CSS go last.

**Tech Stack:** Electron 44, React 19, plain CSS, Vitest 4 (node and jsdom, Testing Library, user-event), TypeScript strict with `noUncheckedIndexedAccess`, `noUnusedParameters`.

**Spec:** `docs/superpowers/specs/2026-10-13-main-window-redesign-design.md`, delivery step 5; sections "Meeting detail", "Layout", "Motion", "Tokens", "Components".

## Global Constraints

- Read `AGENTS.md` and every file in `.codex/rules/` before changing code. Guard rails (`eslint.config.js:17-20`): 250 useful lines per file, 80 per function (tests exempt from the function limit, not from the file limit), cyclomatic complexity 12, depth 3, no nested ternary, no component declared inside another, no cast, `!` or `eslint-disable` to silence a check.
- Renderer imports: no `node:*`, `electron`, `main/**` or backend infrastructure (`eslint.config.js:49-71`). Cross-feature imports inside `src/renderer/features` are allowed (`ListFooter.tsx:4` already does it).
- UI copy, exact, with the typographic apostrophe used everywhere in the code (`’`): « Dossier de la réunion » (accessible name of the folder control), « Ajouter à un dossier… », « Sans dossier », « Nouveau dossier… », « Nom du dossier », « Date inconnue », « Analyse en cours · 3 segments sur 12 », « Analyse en cours · 1 segment sur 3 », « Analyse en cours · rédaction du compte rendu », « environ 4 min », « Contenu de la réunion » (tablist), « Notes », « Transcription », « Résumé », « Points clés », « Décisions », « Actions », « À clarifier », « Précisions », « Écouter à 4:12 » (name of a timestamp whose text is `4:12`), « Actualiser les notes », « Inclut vos précisions enregistrées. », « Prêt pour l’analyse. », « Transcrire et créer le compte rendu », « Aucun audio n’a été enregistré. », « Configurer l’analyse », « L’analyse n’a pas abouti. », « Réessayer l’analyse », « Ajouter une précision », « Votre précision », « Moment », « Ajouter », « Annuler », « Indiquez un moment au format mm:ss, par exemple 04:12. », « Ce moment dépasse la fin de la réunion (52:10). », « Lire », « Mettre en pause », « Position de lecture », « 04:12 sur 52:10 », « Ce passage ne peut pas être lu. », « Actions de la réunion », « Copier les notes », « Notes copiées. », « La copie a échoué. Réessayez. », « Exporter », « Supprimer la réunion »; the delete dialog keeps « Supprimer cette réunion ? », « Les notes et les enregistrements locaux seront supprimés. Cette action est définitive. », « Annuler », « Supprimer » (`DeleteMeetingDialog.tsx:18-24`).
- Formats: meta date `12 oct. 2026` (`Intl` `fr-CH`, day, short month, year, no time); duration `45 s`, `52 min`, `1 h 02`; note and clarification timestamps `m:ss` (`4:12`, `0:31`, `62:03`); the player and the `Moment` field `mm:ss` through the existing `timeLabel` (`src/shared/format.ts:1`).
- Tokens added: `--space-6` 32 px (between note sections), `--reading-width` 680 px. No new colour, size, radius or duration literal; `design-tokens.test.ts`, `motion-guard.test.ts` and `chrome.test.ts` stay green. No `--duration-slow`: `motion-guard.test.ts:20-26` pins the list and nothing here needs 220 ms.
- Motion: only what the spec lists. Analysis line `transform: scaleX` 200 ms, no transition under reduced motion (rule in `styles.css` only); tab, chip, timestamp hover `background-color`/`color` 120 ms; switching tabs, the timer, the progress fill and counters never animate; no `height` animation for the clarification form.
- No data model change, no new IPC channel. Out of scope: the transcript itself (lot 6: the timestamp click switching to « Transcription », highlighting the turn and « Retour aux notes »), the recording screen and the dialogs (lot 7), settings and onboarding (lot 8), chat.
- `npm run check` green at the end of every task. Commits under `0x2e73`, conventional messages, no AI attribution.
- Branch: `redesign/meeting-detail` (already checked out).

## Review Focus

1. **Audio split into extracts plays as one meeting.** Recordings rotate their audio every 60 s (`capture-session.ts:63-77`), so a one-hour meeting is about sixty files. Reaching the end of one must start the next at its first second without a click, without the play button flickering, and the last one must stop at the full duration and start over from 0 on « Lire ». Pinned in Task 3 (`locate`, `resumePoint`) and Task 5 (« plays the extracts one after the other as one timeline », « stops at the end of the last extract and starts over from the beginning »).
2. **Seeking into an extract that is not loaded.** A timestamp at 2:30 or a click on the bar must change the source, wait for its metadata, then set the offset (30 s) and play; setting `currentTime` before is lost. Several seeks during the load keep only the last one; a pause during the load cancels the queued play. Pinned in Task 4 (`MediaDriver` cases) and Task 5 (« waits for an extract that is not loaded before seeking into it », « stays paused when the person pauses while the next extract loads »), and Task 11 (« plays a note from its timestamp »).
3. **A missing or unreadable extract.** The bar says « Ce passage ne peut pas être lu. », the button returns to « Lire », and « Lire » resumes at the next extract instead of failing forever; seeking back into the failed one fetches it again. Pinned in Task 3 (`resumePoint` skips), Task 5 (« says an extract cannot be read and resumes after it », « fetches a failed extract again when the person seeks back into it ») and Task 10 (the message in the bar).
4. **The meeting changes during playback.** Selecting another meeting in the list must stop the sound of the first one and open the second at 00:00, paused, on its own first extract. Pinned in Task 5 (« stops the sound when the player goes away ») and Task 11 (`MeetingDetail.playback.test.tsx`, « stops the sound and opens the next meeting from the start »).
5. **The 2 s poll during an analysis.** While any meeting is analysed, `useMeetings` replaces every meeting object every 2 s (`use-meetings.ts:53-60`). The displayed meeting must keep its source and position (no reload, no jump), its tab, its scroll position and the clarification draft, and the meta line must move from « 3 segments sur 12 » to « 4 segments sur 12 » without the « Prêt pour l’analyse. » prompt flashing in between. Pinned in Task 5 (« keeps the source and the position when the poll refreshes the same meeting ») and Task 11 (« keeps the tab and the draft when the poll hands over the same meeting », « follows the analysis as the poll brings new segments »).

---

## File Structure

| File                                                                                                                               | Change                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/renderer/features/meetings/detail-format.ts` (+ test)                                                                         | New: `meetingDateLabel`, `durationLabel`, `shortTimeLabel`                                                       |
| `src/renderer/features/meetings/moment.ts` (+ test)                                                                                | New: `parseMoment` (`mm:ss`, `m:ss`, seconds, `h:mm:ss` → seconds)                                               |
| `src/renderer/features/meetings/analysis-progress.ts` (+ test)                                                                     | New: `analysisProgress`, `analysisRatio`, `analysisLabel`, `remainingLabel`                                      |
| `src/renderer/features/list/RowStatus.tsx`                                                                                         | Uses `analysisRatio` instead of its private copy                                                                 |
| `src/renderer/features/meetings/detail-notices.ts` (+ test), `DetailNotices.tsx` (+ test)                                          | New: which notices the detail shows; the amber band with « Réessayer l’analyse »                                 |
| `src/renderer/components/Notice.tsx` (+ test)                                                                                      | `action` slot                                                                                                    |
| `src/renderer/features/meetings/playback-timeline.ts` (+ test)                                                                     | New: `playbackSources`, `timelineEnd`, `locate`, `timelineTime`, `resumePoint`                                   |
| `src/renderer/features/meetings/media-driver.ts` (+ test)                                                                          | New: `MediaDriver`, `MediaLike`                                                                                  |
| `src/renderer/features/meetings/use-media-playback.ts` (+ new test), `src/renderer/test-setup.ts`                                  | Rewritten: one continuous timeline; jsdom media stubs                                                            |
| `src/renderer/components/Segmented.tsx` (+ test), `ui.tsx`, `styles/segmented.css`                                                 | New primitive                                                                                                    |
| `src/renderer/features/meetings/use-tab-scroll.ts` (+ test)                                                                        | New: per-tab scroll memory in one scroll container                                                               |
| `src/renderer/features/meetings/FolderControl.tsx` (+ test)                                                                        | New: « Acme ⌄ » chip over a native select, « Nouveau dossier… »                                                  |
| `src/renderer/features/meetings/AnalysisStatus.tsx` (+ test)                                                                       | New: `AnalysisStatus` (meta line), `AnalysisLine` (2 px on the card)                                             |
| `src/renderer/features/meetings/ClarificationForm.tsx` (+ test), `Clarifications.tsx` (+ test)                                     | Rewritten form (`mm:ss`), new « Précisions » section                                                             |
| `src/renderer/features/meetings/meeting-format.ts` (+ new test)                                                                    | `noteSources`, `notesMarkdown`; `meetingMarkdown` built on it                                                    |
| `src/renderer/features/meetings/NoteSection.tsx`, `AnalysisPrompt.tsx`, `NotesView.tsx` (+ test)                                   | Rewritten section, new prompt and notes view                                                                     |
| `src/renderer/features/meetings/PlaybackBar.tsx` (+ test), `MeetingActions.tsx` (+ test), `use-copy-notes.ts`                      | New footer pieces                                                                                                |
| `src/main/capture-permissions.ts` (+ test)                                                                                         | Allows `clipboard-sanitized-write` for the app window                                                            |
| `src/renderer/features/meetings/MeetingHeader.tsx` (+ test), `MeetingContent.tsx`, `MeetingDetail.tsx` (+ tests), `Transcript.tsx` | Rewritten detail                                                                                                 |
| `src/renderer/WorkspaceContent.tsx`, `src/renderer/App.tsx`                                                                        | `onCreateFolder`                                                                                                 |
| `src/renderer/styles/meeting-detail.css`, `meeting-notes.css`, `playback-bar.css`                                                  | New sheets                                                                                                       |
| `src/renderer/styles.css`, `styles/meetings.css`, `styles/shared.css`, `styles/recording.css`, `main.tsx`, `chrome.test.ts`        | Tokens, reduced motion, sheet imports, dead rules out, layout guards                                             |
| Deleted                                                                                                                            | `MeetingNotes.tsx`, `MeetingContext.tsx`, `MediaPlayer.tsx`, `AnalysisProgress.tsx`, `AnalysisProgress.test.tsx` |

### Where the existing tests go

| Old test                                                                                                                                                                                                                                             | New home                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AnalysisProgress.test.tsx` « shows transcript progress and a measured remaining-time estimate »                                                                                                                                                     | Same numbers (1 of 3 segments, started 12:00, now 12:02, « environ 4 min »): `analysis-progress.test.ts` « counts transcribed segments and estimates the rest from the measured pace » and `AnalysisStatus.test.tsx` « says how far the analysis is, then how long it should last » |
| `ClarificationForm.test.tsx` « keeps the moment field and submits a clarification at the selected time »                                                                                                                                             | `ClarificationForm.test.tsx` « prefills the moment with the playback position and submits it in seconds » (moment field kept, now `mm:ss`; the caption « Un « ça » un peu flou ? … » still asserted; the form closes instead of clearing)                                           |
| `MeetingHeader.test.tsx` « files the meeting from the header », « takes the meeting out of its folder », « keeps the folder while %s », « opens a meeting whose date is unreadable »                                                                 | `MeetingHeader.test.tsx`, same names and the same `combobox` « Dossier de la réunion » (Task 11)                                                                                                                                                                                    |
| `MeetingDetail.test.tsx` « opens without a way back: the list is the navigation », « hands the deletion over once the meeting is gone »                                                                                                              | `MeetingDetail.test.tsx`, same names; « Supprimer la réunion » now lives in the footer pill (Task 11)                                                                                                                                                                               |
| `DeleteMeetingDialog.test.tsx` (2 cases)                                                                                                                                                                                                             | Unchanged                                                                                                                                                                                                                                                                           |
| `Transcript.test.tsx` (6 cases)                                                                                                                                                                                                                      | Unchanged; « ne propose pas de recherche sans transcription » still matches the empty copy, which now names « l’onglet Notes »                                                                                                                                                      |
| `App.selection.test.tsx` « follows a meeting moved out of the filtered folder » (selects `''` in the combobox), the three « After a deletion » cases, `App.list.test.tsx` « falls back to the most recent meeting when the selected one is deleted » | Unchanged: the folder control stays a `combobox` with the same name and an empty value for « Sans dossier », and « Supprimer la réunion » keeps its name                                                                                                                            |
| `MeetingList.test.tsx` status rows (`RowStatus`)                                                                                                                                                                                                     | Unchanged; `RowStatus` imports `analysisRatio` (Task 2)                                                                                                                                                                                                                             |

`MeetingNotes`, `NoteSection`, `MeetingContext` and `MediaPlayer` had no tests of their own; their behaviour gets new ones in Tasks 5, 8, 9 and 10.

---

### Task 1: Detail formats and `mm:ss` moments

**Files:**

- Create: `src/renderer/features/meetings/detail-format.ts`, `src/renderer/features/meetings/detail-format.test.ts`
- Create: `src/renderer/features/meetings/moment.ts`, `src/renderer/features/meetings/moment.test.ts`

**Interfaces:**

- Consumes: `timeLabel(seconds: number): string` from `src/shared/format.ts` (`mm:ss`, minutes unbounded, floors).
- Produces: `meetingDateLabel(createdAt: string): string`; `durationLabel(seconds: number): string`; `shortTimeLabel(seconds: number): string`; `type MomentResult = { ok: true; seconds: number } | { ok: false; error: string }`; `parseMoment(input: string, duration: number): MomentResult`.

The expected values below were run in Node 26 with `TZ=Europe/Zurich` before being written down.

- [ ] **Step 1: Write the failing tests**

`src/renderer/features/meetings/detail-format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { durationLabel, meetingDateLabel, shortTimeLabel } from './detail-format';

describe('meetingDateLabel', () => {
  it.each([
    ['2026-10-12T08:00:00Z', '12 oct. 2026'],
    ['2026-05-03T10:00:00Z', '3 mai 2026'],
    ['2026-10-14T22:30:00Z', '15 oct. 2026'],
    ['2026-12-31T23:30:00Z', '1 janv. 2027'],
    ['nope', 'Date inconnue'],
    ['', 'Date inconnue'],
  ])('dates %s as « %s » in Zurich', (createdAt, label) => {
    expect(meetingDateLabel(createdAt)).toBe(label);
  });
});

describe('durationLabel', () => {
  it.each([
    [0, '0 s'],
    [-5, '0 s'],
    [Number.NaN, '0 s'],
    [Number.POSITIVE_INFINITY, '0 s'],
    [45.9, '45 s'],
    [59.99, '59 s'],
    [60, '1 min'],
    [89, '1 min'],
    [90, '2 min'],
    [3130, '52 min'],
    [3569, '59 min'],
    [3570, '1 h 00'],
    [3723, '1 h 02'],
    [7205, '2 h 00'],
  ])('reads %s s as « %s »', (seconds, label) => {
    expect(durationLabel(seconds)).toBe(label);
  });
});

describe('shortTimeLabel', () => {
  it.each([
    [0, '0:00'],
    [4.9, '0:04'],
    [31, '0:31'],
    [252, '4:12'],
    [252.99, '4:12'],
    [3723, '62:03'],
    [-3, '0:00'],
    [Number.NaN, '0:00'],
  ])('stamps %s s as %s', (seconds, label) => {
    expect(shortTimeLabel(seconds)).toBe(label);
  });
});
```

`src/renderer/features/meetings/moment.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { timeLabel } from '../../../shared/format';
import { parseMoment } from './moment';

const FORMAT = 'Indiquez un moment au format mm:ss, par exemple 04:12.';
const PAST_END = 'Ce moment dépasse la fin de la réunion (52:10).';
const duration = 3130.4;

describe('parseMoment', () => {
  it.each([
    ['04:12', 252],
    ['4:12', 252],
    ['1:5', 65],
    ['75', 75],
    ['00:00', 0],
    ['52:10', 3130],
    ['  1:05  ', 65],
  ])('reads « %s » as %s s', (input, seconds) => {
    expect(parseMoment(input, duration)).toEqual({ ok: true, seconds });
  });

  it('reads hours on a long meeting', () => {
    expect(parseMoment('01:02:03', 7205)).toEqual({ ok: true, seconds: 3723 });
    expect(parseMoment('2:00:05', 7205)).toEqual({ ok: true, seconds: 7205 });
  });

  it.each(['', ' ', '-1:00', '1:60', '1:02:60', '1:60:00', '1.5', '4:12:', ':30', 'quatre'])(
    'refuses « %s »',
    (input) => {
      expect(parseMoment(input, duration)).toEqual({ ok: false, error: FORMAT });
    },
  );

  it.each(['52:11', '75:00', '01:02:03', '1:2:3', '99999999999999999999'])(
    'refuses « %s », past the end',
    (input) => {
      expect(parseMoment(input, duration)).toEqual({ ok: false, error: PAST_END });
    },
  );

  it('names the end in the player’s format', () => {
    expect(parseMoment('2:00:06', 7205)).toEqual({
      ok: false,
      error: 'Ce moment dépasse la fin de la réunion (120:05).',
    });
  });

  it.each([0, 4.9, 252.7, 3130.4])('reads back the prefilled %s s, to the second', (seconds) => {
    expect(parseMoment(timeLabel(seconds), duration)).toEqual({
      ok: true,
      seconds: Math.floor(seconds),
    });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/features/meetings/detail-format.test.ts src/renderer/features/meetings/moment.test.ts`
Expected: FAIL, « Failed to resolve import "./detail-format" » and « "./moment" ».

- [ ] **Step 3: Implement**

`src/renderer/features/meetings/detail-format.ts`:

```ts
const mediumDate = new Intl.DateTimeFormat('fr-CH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function meetingDateLabel(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? 'Date inconnue' : mediumDate.format(date);
}

/** The length in the meta line: « 45 s », « 52 min », « 1 h 02 ». */
export function durationLabel(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (total < 60) return `${Math.floor(total)} s`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/** Note timestamps drop the leading zero: « 4:12 », « 0:31 ». */
export function shortTimeLabel(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
```

`src/renderer/features/meetings/moment.ts`:

```ts
import { timeLabel } from '../../../shared/format';

export type MomentResult = { ok: true; seconds: number } | { ok: false; error: string };

const FORMAT_ERROR = 'Indiquez un moment au format mm:ss, par exemple 04:12.';

// Bare seconds (« 75 »), m:ss with one or two second digits (« 1:5 » is 1:05), or h:mm:ss.
function toSeconds(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text);
  const parts = /^(?:(\d+):)?(\d+):(\d{1,2})$/.exec(text);
  if (!parts) return null;
  const [, hours, minutes = '', seconds = ''] = parts;
  if (Number(seconds) > 59) return null;
  if (hours !== undefined && Number(minutes) > 59) return null;
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/** Reads the « Moment » field; the backend refuses a moment past the meeting too (meeting-rules.ts:29). */
export function parseMoment(input: string, duration: number): MomentResult {
  const seconds = toSeconds(input.trim());
  if (seconds === null) return { ok: false, error: FORMAT_ERROR };
  if (seconds > duration) {
    return {
      ok: false,
      error: `Ce moment dépasse la fin de la réunion (${timeLabel(duration)}).`,
    };
  }
  return { ok: true, seconds };
}
```

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/features/meetings/detail-format.test.ts src/renderer/features/meetings/moment.test.ts
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings/detail-format.ts src/renderer/features/meetings/detail-format.test.ts src/renderer/features/meetings/moment.ts src/renderer/features/meetings/moment.test.ts
git commit -m "feat: meta line formats and mm:ss moments for the meeting detail"
```

---

### Task 2: Analysis progress and the detail notices

**Files:**

- Create: `src/renderer/features/meetings/analysis-progress.ts`, `analysis-progress.test.ts`
- Create: `src/renderer/features/meetings/detail-notices.ts`, `detail-notices.test.ts`
- Create: `src/renderer/features/meetings/DetailNotices.tsx`, `DetailNotices.test.tsx`
- Modify: `src/renderer/features/list/RowStatus.tsx:1-9` (drop the private `analysisRatio`)
- Modify: `src/renderer/components/Notice.tsx`, `src/renderer/components/Notice.test.tsx`

**Interfaces:**

- Produces: `interface AnalysisProgress { done: number; total: number }`; `analysisProgress(meeting: Pick<Meeting, 'audioChunks'>): AnalysisProgress`; `analysisRatio(meeting: Pick<Meeting, 'audioChunks'>): number`; `analysisLabel(meeting: Pick<Meeting, 'audioChunks'>): string`; `remainingLabel(meeting: Pick<Meeting, 'audioChunks' | 'processingStartedAt'>, now: number): string | null`.
- Produces: `interface DetailNotice { key: 'action' | 'analysis' | 'meeting'; tone: 'danger' | 'warning'; message: string; detail: string | null; retry: boolean }`; `detailNotices(meeting: Pick<Meeting, 'status' | 'error'>, actionError: string, analyzing: boolean): DetailNotice[]`.
- Produces: `DetailNotices` props `{ notices: DetailNotice[]; canRetry: boolean; onRetry(): void }`.
- Produces: `Notice` gains `action?: ReactNode`, rendered after the message.

- [ ] **Step 1: Write the failing tests**

`src/renderer/features/meetings/analysis-progress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AudioChunk } from '../../../shared/contracts';
import {
  analysisLabel,
  analysisProgress,
  analysisRatio,
  remainingLabel,
} from './analysis-progress';

function chunks(total: number, done: number): AudioChunk[] {
  return Array.from({ length: total }, (_, index) => ({
    index,
    start: index * 60,
    duration: 60,
    transcript: index < done ? [] : null,
  }));
}

const now = Date.parse('2026-09-12T12:02:00Z');
const started = '2026-09-12T12:00:00Z';

describe('analysis progress', () => {
  it('counts the transcribed segments', () => {
    expect(analysisProgress({ audioChunks: chunks(12, 3) })).toEqual({ done: 3, total: 12 });
    expect(analysisRatio({ audioChunks: chunks(12, 3) })).toBe(0.25);
    expect(analysisRatio({ audioChunks: [] })).toBe(0);
  });

  it.each([
    [12, 3, 'Analyse en cours · 3 segments sur 12'],
    [3, 1, 'Analyse en cours · 1 segment sur 3'],
    [12, 0, 'Analyse en cours · 0 segment sur 12'],
    [12, 12, 'Analyse en cours · rédaction du compte rendu'],
    [0, 0, 'Analyse en cours'],
  ])('labels %s segments with %s done', (total, done, label) => {
    expect(analysisLabel({ audioChunks: chunks(total, done) })).toBe(label);
  });

  it('counts transcribed segments and estimates the rest from the measured pace', () => {
    const meeting = { audioChunks: chunks(3, 1), processingStartedAt: started };
    expect(analysisLabel(meeting)).toBe('Analyse en cours · 1 segment sur 3');
    expect(remainingLabel(meeting, now)).toBe('environ 4 min');
  });

  it.each([
    ['before the first segment', chunks(12, 0), started, null],
    ['while the notes are written', chunks(12, 12), started, null],
    ['without a start time', chunks(3, 1), undefined, null],
    ['with an unreadable start time', chunks(2, 1), 'nope', null],
    ['with a start ahead of the clock', chunks(3, 1), '2026-09-12T12:05:00Z', 'environ 1 min'],
    ['after a few seconds', chunks(12, 1), '2026-09-12T12:01:50Z', 'environ 2 min'],
  ])('estimates %s', (_case, audioChunks, processingStartedAt, label) => {
    expect(remainingLabel({ audioChunks, processingStartedAt }, now)).toBe(label);
  });
});
```

`src/renderer/features/meetings/detail-notices.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detailNotices } from './detail-notices';

const reason = 'Aucune parole détectée dans cet enregistrement.';
const settingsError = 'Configurez la transcription et le compte rendu dans les paramètres.';
const band = {
  key: 'analysis',
  tone: 'warning',
  message: 'L’analyse n’a pas abouti.',
  detail: reason,
  retry: true,
};

describe('detailNotices', () => {
  it('shows nothing for a quiet meeting', () => {
    expect(detailNotices({ status: 'ready', error: null }, '', false)).toEqual([]);
  });

  it('reports a failed action', () => {
    expect(detailNotices({ status: 'recorded', error: null }, settingsError, false)).toEqual([
      { key: 'action', tone: 'danger', message: settingsError, detail: null, retry: false },
    ]);
  });

  it('turns a failed analysis into one amber band with its reason and a retry', () => {
    expect(detailNotices({ status: 'error', error: reason }, '', false)).toEqual([band]);
  });

  it('says a failed retry once', () => {
    expect(detailNotices({ status: 'error', error: reason }, reason, false)).toEqual([band]);
  });

  it('keeps a different action error next to the band', () => {
    expect(detailNotices({ status: 'error', error: reason }, settingsError, false)).toEqual([
      { key: 'action', tone: 'danger', message: settingsError, detail: null, retry: false },
      band,
    ]);
  });

  it('keeps the message of an interrupted session', () => {
    const error = 'Session interrompue. Les fichiers sauvegardés sont conservés.';
    expect(detailNotices({ status: 'recorded', error }, '', false)).toEqual([
      { key: 'meeting', tone: 'warning', message: error, detail: null, retry: false },
    ]);
  });

  it('says nothing about the last failure while the analysis runs again', () => {
    expect(detailNotices({ status: 'error', error: reason }, '', true)).toEqual([]);
  });
});
```

`src/renderer/features/meetings/DetailNotices.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailNotices } from './DetailNotices';
import { detailNotices } from './detail-notices';

afterEach(cleanup);

const failed = detailNotices(
  { status: 'error', error: 'Aucune parole détectée dans cet enregistrement.' },
  '',
  false,
);

it('retries a failed analysis from the amber band', async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  render(<DetailNotices notices={failed} canRetry onRetry={onRetry} />);
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('L’analyse n’a pas abouti.');
  expect(alert).toHaveTextContent('Aucune parole détectée dans cet enregistrement.');
  await user.click(within(alert).getByRole('button', { name: 'Réessayer l’analyse' }));
  expect(onRetry).toHaveBeenCalledOnce();
});

it('explains why a failed meeting without audio cannot be retried', () => {
  render(<DetailNotices notices={failed} canRetry={false} onRetry={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Réessayer l’analyse' })).toBeDisabled();
  expect(screen.getByText('Aucun audio n’a été enregistré.')).toBeInTheDocument();
});

it('renders nothing without notices', () => {
  const { container } = render(<DetailNotices notices={[]} canRetry onRetry={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});
```

In `src/renderer/components/Notice.test.tsx`, change the imports to `import { afterEach, expect, it, vi } from 'vitest';` and `import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';`, then append:

```tsx
it('holds an action next to its message', () => {
  const onRetry = vi.fn();
  render(
    <Notice tone="warning" action={<button onClick={onRetry}>Réessayer l’analyse</button>}>
      L’analyse n’a pas abouti.
    </Notice>,
  );
  const alert = screen.getByRole('alert');
  fireEvent.click(within(alert).getByRole('button', { name: 'Réessayer l’analyse' }));
  expect(onRetry).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/features/meetings/analysis-progress.test.ts src/renderer/features/meetings/detail-notices.test.ts src/renderer/features/meetings/DetailNotices.test.tsx src/renderer/components/Notice.test.tsx`
Expected: FAIL: the three modules do not resolve; `Notice` ignores `action`, so `within(alert).getByRole('button')` finds nothing.

- [ ] **Step 3: Implement**

`src/renderer/features/meetings/analysis-progress.ts`:

```ts
import type { Meeting } from '../../../shared/contracts';

export interface AnalysisProgress {
  done: number;
  total: number;
}

type Chunked = Pick<Meeting, 'audioChunks'>;

export function analysisProgress(meeting: Chunked): AnalysisProgress {
  const total = meeting.audioChunks.length;
  const done = meeting.audioChunks.filter((chunk) => chunk.transcript !== null).length;
  return { done, total };
}

// Chunks report their transcription; the notes phase shows a full line.
export function analysisRatio(meeting: Chunked): number {
  const { done, total } = analysisProgress(meeting);
  return total === 0 ? 0 : done / total;
}

export function analysisLabel(meeting: Chunked): string {
  const { done, total } = analysisProgress(meeting);
  if (total === 0) return 'Analyse en cours';
  if (done >= total) return 'Analyse en cours · rédaction du compte rendu';
  return `Analyse en cours · ${done} segment${done > 1 ? 's' : ''} sur ${total}`;
}

/** Measured pace of the segments done so far; nothing before the first one. */
export function remainingLabel(
  meeting: Pick<Meeting, 'audioChunks' | 'processingStartedAt'>,
  now: number,
): string | null {
  const { done, total } = analysisProgress(meeting);
  if (done === 0 || done >= total) return null;
  const started = meeting.processingStartedAt
    ? Date.parse(meeting.processingStartedAt)
    : Number.NaN;
  if (!Number.isFinite(started)) return null;
  const elapsed = Math.max(0, (now - started) / 1_000);
  const minutes = Math.max(1, Math.ceil((elapsed * (total - done)) / done / 60));
  return `environ ${minutes} min`;
}
```

`src/renderer/features/list/RowStatus.tsx`: delete the comment and the private `analysisRatio` function (lines 4-9) and add `import { analysisRatio } from '../meetings/analysis-progress';` after the `statusLabels` import. The JSX keeps `analysisRatio(meeting)`.

`src/renderer/features/meetings/detail-notices.ts`:

```ts
import type { Meeting } from '../../../shared/contracts';

export interface DetailNotice {
  key: 'action' | 'analysis' | 'meeting';
  tone: 'danger' | 'warning';
  message: string;
  detail: string | null;
  retry: boolean;
}

export function detailNotices(
  meeting: Pick<Meeting, 'status' | 'error'>,
  actionError: string,
  analyzing: boolean,
): DetailNotice[] {
  const failed = meeting.status === 'error' && !analyzing;
  const notices: DetailNotice[] = [];
  // A failed retry reports its reason twice: from the call and on the restored meeting.
  if (actionError && !(failed && actionError === meeting.error)) {
    notices.push({
      key: 'action',
      tone: 'danger',
      message: actionError,
      detail: null,
      retry: false,
    });
  }
  if (failed) {
    notices.push({
      key: 'analysis',
      tone: 'warning',
      message: 'L’analyse n’a pas abouti.',
      detail: meeting.error,
      retry: true,
    });
  } else if (meeting.error && !analyzing) {
    notices.push({
      key: 'meeting',
      tone: 'warning',
      message: meeting.error,
      detail: null,
      retry: false,
    });
  }
  return notices;
}
```

`src/renderer/components/Notice.tsx`: add `action?: ReactNode;` to `NoticeProps`, destructure it, and render it after the `retry` button:

```tsx
export function Notice({
  children,
  tone = 'danger',
  retry,
  action,
  floating = false,
}: NoticeProps) {
  const Icon = tone === 'info' ? Info : AlertCircle;
  return (
    <div
      className={`notice notice-${tone}${floating ? ' notice-floating' : ''}`}
      role={tone === 'info' ? 'status' : 'alert'}
    >
      <Icon size={17} aria-hidden="true" />
      <span>{children}</span>
      {retry && (
        <Button variant="ghost" onClick={retry}>
          Réessayer
        </Button>
      )}
      {action}
    </div>
  );
}
```

`src/renderer/features/meetings/DetailNotices.tsx`:

```tsx
import { Button, Notice } from '../../components/ui';
import type { DetailNotice } from './detail-notices';

interface DetailNoticesProps {
  notices: DetailNotice[];
  canRetry: boolean;
  onRetry(): void;
}

interface NoticeDetailProps {
  notice: DetailNotice;
  canRetry: boolean;
}

function NoticeDetail({ notice, canRetry }: NoticeDetailProps) {
  return (
    <>
      {notice.detail && <span className="notice-detail">{notice.detail}</span>}
      {notice.retry && !canRetry && (
        <span className="notice-detail">Aucun audio n’a été enregistré.</span>
      )}
    </>
  );
}

export function DetailNotices({ notices, canRetry, onRetry }: DetailNoticesProps) {
  if (!notices.length) return null;
  return (
    <div className="detail-notices">
      {notices.map((notice) => (
        <Notice
          key={notice.key}
          tone={notice.tone}
          action={
            notice.retry ? (
              <Button variant="secondary" disabled={!canRetry} onClick={onRetry}>
                Réessayer l’analyse
              </Button>
            ) : undefined
          }
        >
          {notice.message}
          <NoticeDetail notice={notice} canRetry={canRetry} />
        </Notice>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/features/meetings src/renderer/features/list src/renderer/components
npm run check
```

Expected: PASS, `MeetingList.test.tsx` included.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings/analysis-progress.ts src/renderer/features/meetings/analysis-progress.test.ts src/renderer/features/meetings/detail-notices.ts src/renderer/features/meetings/detail-notices.test.ts src/renderer/features/meetings/DetailNotices.tsx src/renderer/features/meetings/DetailNotices.test.tsx src/renderer/features/list/RowStatus.tsx src/renderer/components/Notice.tsx src/renderer/components/Notice.test.tsx
git commit -m "feat: analysis progress and one amber band for a failed analysis"
```

---

### Task 3: One timeline over the audio extracts

**Files:**

- Create: `src/renderer/features/meetings/playback-timeline.ts`, `playback-timeline.test.ts`

**Interfaces:**

- Produces: `interface PlaybackSource { src: string; start: number; duration: number }`; `interface PlaybackTarget { position: number; offset: number }`; `playbackSources(meeting: Pick<Meeting, 'id' | 'hasVideo' | 'duration' | 'audioChunks'>): PlaybackSource[]`; `timelineEnd(sources: readonly PlaybackSource[], duration: number): number`; `locate(sources: readonly PlaybackSource[], at: number): PlaybackTarget | null`; `timelineTime(source: PlaybackSource, currentTime: number): number`; `resumePoint(state: ResumeState): number | null` with `interface ResumeState { sources: readonly PlaybackSource[]; position: number; at: number; duration: number; failed: boolean }`.

**How the continuous timeline works** (the riskiest part of the lot, read it before Tasks 4 and 5):

- Each recorded extract is its own WebM file served at `meeting-media://local/<id>/audio/<index>` (`media-protocol.ts:19-22`, range requests supported). Its place in the meeting is `chunk.start` and its length `chunk.duration`, both measured by the capture clock (`capture-session.ts:92-101`). MediaRecorder WebM files carry no reliable duration, so the timeline never reads `element.duration`: it trusts the model.
- `playbackSources` turns the chunks into an ordered list of sources (by `start`, then `index`), dropping any chunk whose start or duration is not a finite, positive number. A meeting with video has one source, the video file, which carries the sound: the timeline is `[0, meeting.duration]`.
- `locate(sources, at)` maps a meeting time to `{ position, offset }`: the last source that starts at or before `at`; inside it, `offset = at - start`. A time in a gap between two extracts (the 0.1 s hand-over, or a missing minute) goes to the start of the next extract; a time before the first goes to its start; past the end, the last extract at its full length (playing it ends at once). Non-finite input counts as 0.
- `timelineTime(source, currentTime)` maps the element back: `source.start + clamp(currentTime, 0, source.duration)`.
- `timelineEnd` is the larger of the last extract's end and the recorded duration.
- `resumePoint` decides where « Lire » starts when playback is not simply resumed: after an unreadable extract, at the next extract (or the same one if none follows); at or after the end, at 0.

Values computed in Node 26 before writing them down: with extracts `[0,60) [60,120) [120,180)`, `locate(150)` is `{ position: 2, offset: 30 }`, `locate(60)` `{ 1, 0 }`, `locate(500)` `{ 2, 60 }`; with `[0,60) [120,180)`, `locate(90)` is `{ 1, 0 }`; with real hand-over gaps (`0+60.2`, `60.3+60`, `120.4+61.1`), `locate(60.25)` is `{ 1, 0 }` and `locate(150)` gives offset `29.599999999999994`, hence `toBeCloseTo`.

- [ ] **Step 1: Write the failing test**

`src/renderer/features/meetings/playback-timeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AudioChunk } from '../../../shared/contracts';
import {
  locate,
  playbackSources,
  resumePoint,
  timelineEnd,
  timelineTime,
  type PlaybackSource,
} from './playback-timeline';

const chunk = (index: number, start: number, duration = 60): AudioChunk => ({
  index,
  start,
  duration,
  transcript: null,
});
const audio = (audioChunks: AudioChunk[], duration = 180) => ({
  id: 'm1',
  hasVideo: false,
  duration,
  audioChunks,
});
const three = playbackSources(audio([chunk(0, 0), chunk(1, 60), chunk(2, 120)]));

describe('playbackSources', () => {
  it('orders the extracts by time without touching the meeting', () => {
    const chunks = [chunk(2, 120), chunk(0, 0), chunk(1, 60)];
    expect(playbackSources(audio(chunks)).map((source) => source.src)).toEqual([
      'meeting-media://local/m1/audio/0',
      'meeting-media://local/m1/audio/1',
      'meeting-media://local/m1/audio/2',
    ]);
    expect(chunks.map((item) => item.index)).toEqual([2, 0, 1]);
  });

  it('leaves out the extracts it cannot place', () => {
    const chunks = [
      chunk(0, 0, 0),
      chunk(1, Number.NaN, 10),
      chunk(2, -1, 10),
      chunk(3, 0, Number.POSITIVE_INFINITY),
      chunk(4, 10, 20),
    ];
    expect(playbackSources(audio(chunks))).toEqual([
      { src: 'meeting-media://local/m1/audio/4', start: 10, duration: 20 },
    ]);
  });

  it('plays the video as one source, its sound included', () => {
    expect(playbackSources({ ...audio([chunk(0, 0)]), hasVideo: true, duration: 3130.4 })).toEqual([
      { src: 'meeting-media://local/m1/video', start: 0, duration: 3130.4 },
    ]);
  });

  it('has nothing to play without audio', () => {
    expect(playbackSources(audio([]))).toEqual([]);
  });
});

describe('timelineEnd', () => {
  it('covers the last extract and the recorded duration', () => {
    expect(timelineEnd(three, 181.5)).toBe(181.5);
    expect(timelineEnd(three, 100)).toBe(180);
    expect(timelineEnd([], 42)).toBe(42);
    expect(timelineEnd([], Number.NaN)).toBe(0);
  });
});

describe('locate', () => {
  it.each([
    [0, 0, 0],
    [30, 0, 30],
    [60, 1, 0],
    [150, 2, 30],
    [179.5, 2, 59.5],
    [180, 2, 60],
    [500, 2, 60],
    [-4, 0, 0],
    [Number.NaN, 0, 0],
  ])('finds %s s in extract %s at %s s', (at, position, offset) => {
    expect(locate(three, at)).toEqual({ position, offset });
  });

  it('jumps over a missing minute to the next extract', () => {
    const gap = playbackSources(audio([chunk(0, 0), chunk(2, 120)]));
    expect(locate(gap, 59.5)).toEqual({ position: 0, offset: 59.5 });
    expect(locate(gap, 90)).toEqual({ position: 1, offset: 0 });
    expect(locate(gap, 150)).toEqual({ position: 1, offset: 30 });
  });

  it('starts at the first extract when the recording began late', () => {
    const late = playbackSources(audio([chunk(0, 5)]));
    expect(locate(late, 2)).toEqual({ position: 0, offset: 0 });
  });

  it('crosses the tenth of a second between two real extracts', () => {
    const real = playbackSources(
      audio([chunk(0, 0, 60.2), chunk(1, 60.3, 60), chunk(2, 120.4, 61.1)], 181.5),
    );
    expect(locate(real, 60.25)).toEqual({ position: 1, offset: 0 });
    const inside = locate(real, 150);
    expect(inside?.position).toBe(2);
    expect(inside?.offset).toBeCloseTo(29.6);
  });

  it('has no target without sources', () => {
    expect(locate([], 10)).toBeNull();
  });
});

describe('timelineTime', () => {
  const second: PlaybackSource = {
    src: 'meeting-media://local/m1/audio/1',
    start: 60,
    duration: 60,
  };

  it.each([
    [0, 60],
    [12, 72],
    [60, 120],
    [75, 120],
    [-1, 60],
    [Number.NaN, 60],
  ])('maps %s s in the extract to %s s in the meeting', (currentTime, at) => {
    expect(timelineTime(second, currentTime)).toBe(at);
  });
});

describe('resumePoint', () => {
  const base = { sources: three, position: 0, at: 30, duration: 180, failed: false };

  it('carries on where playback stopped', () => {
    expect(resumePoint(base)).toBeNull();
  });

  it('starts over after the end', () => {
    expect(resumePoint({ ...base, position: 2, at: 180 })).toBe(0);
  });

  it('skips an extract that cannot be read', () => {
    expect(resumePoint({ ...base, position: 1, at: 60, failed: true })).toBe(120);
  });

  it('tries the last extract again when nothing follows', () => {
    expect(resumePoint({ ...base, position: 2, at: 120, failed: true })).toBe(120);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/renderer/features/meetings/playback-timeline.test.ts`
Expected: FAIL, « Failed to resolve import "./playback-timeline" ».

- [ ] **Step 3: Implement**

`src/renderer/features/meetings/playback-timeline.ts`:

```ts
import type { Meeting } from '../../../shared/contracts';

export interface PlaybackSource {
  src: string;
  /** Seconds from the start of the meeting. */
  start: number;
  duration: number;
}

export interface PlaybackTarget {
  position: number;
  offset: number;
}

export interface ResumeState {
  sources: readonly PlaybackSource[];
  position: number;
  at: number;
  duration: number;
  failed: boolean;
}

type PlayableMeeting = Pick<Meeting, 'id' | 'hasVideo' | 'duration' | 'audioChunks'>;

const finite = (value: number) => Number.isFinite(value);

/** The video carries the sound; otherwise one source per recorded extract, in time order. */
export function playbackSources(meeting: PlayableMeeting): PlaybackSource[] {
  const base = `meeting-media://local/${meeting.id}`;
  if (meeting.hasVideo) {
    const duration = finite(meeting.duration) ? Math.max(0, meeting.duration) : 0;
    return [{ src: `${base}/video`, start: 0, duration }];
  }
  return meeting.audioChunks
    .filter(
      (chunk) =>
        finite(chunk.start) && chunk.start >= 0 && finite(chunk.duration) && chunk.duration > 0,
    )
    .sort((a, b) => a.start - b.start || a.index - b.index)
    .map((chunk) => ({
      src: `${base}/audio/${chunk.index}`,
      start: chunk.start,
      duration: chunk.duration,
    }));
}

export function timelineEnd(sources: readonly PlaybackSource[], duration: number): number {
  const last = sources.at(-1);
  const end = last ? last.start + last.duration : 0;
  return Math.max(end, finite(duration) ? duration : 0);
}

/** A time in a gap between two extracts plays from the start of the next one. */
export function locate(sources: readonly PlaybackSource[], at: number): PlaybackTarget | null {
  const time = finite(at) ? Math.max(0, at) : 0;
  const position = Math.max(
    0,
    sources.findLastIndex((source) => source.start <= time),
  );
  const source = sources[position];
  if (!source) return null;
  const offset = time - source.start;
  if (offset < source.duration) return { position, offset: Math.max(0, offset) };
  if (position + 1 < sources.length) return { position: position + 1, offset: 0 };
  return { position, offset: source.duration };
}

export function timelineTime(source: PlaybackSource, currentTime: number): number {
  const offset = finite(currentTime) ? Math.min(Math.max(0, currentTime), source.duration) : 0;
  return source.start + offset;
}

/** Where « Lire » starts when it does not simply carry on: null means carry on. */
export function resumePoint({
  sources,
  position,
  at,
  duration,
  failed,
}: ResumeState): number | null {
  if (failed) return sources[position + 1]?.start ?? at;
  if (at >= duration) return 0;
  return null;
}
```

- [ ] **Step 4: Run the test and the project checks**

```bash
npx vitest run src/renderer/features/meetings/playback-timeline.test.ts
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings/playback-timeline.ts src/renderer/features/meetings/playback-timeline.test.ts
git commit -m "feat: one playback timeline over the recorded audio extracts"
```

---

### Task 4: Media driver

**Files:**

- Create: `src/renderer/features/meetings/media-driver.ts`, `media-driver.test.ts`

**Interfaces:**

- Produces: `interface MediaLike { currentTime: number; readonly ended: boolean; play(): Promise<void>; pause(): void; load(): void }` (an `HTMLMediaElement` satisfies it); `class MediaDriver` with `attach(media: MediaLike | null): void`, `get waiting(): boolean`, `get ended(): boolean`, `queue(offset: number, play: boolean): void`, `retry(offset: number, play: boolean): void`, `seek(offset: number, play: boolean): void`, `setPlaying(play: boolean): void`, `loadedMetadata(): void`, `failed(): void`, `stop(): void`.

The driver owns the element-level rules, so they are tested in Node with a plain object:

- a target aimed at a source that is not loaded (`queue`, or `seek` before the first metadata) waits; `loadedMetadata` applies the offset, then plays if asked;
- later targets replace earlier ones; `setPlaying(false)` during a load cancels the queued play;
- `retry` asks the element to fetch the same source again (`load()`), for a source that failed;
- `failed` drops the target;
- `attach(null)` is ignored: React detaches the ref before the unmount cleanup runs, and `stop()` must still reach the element;
- a rejected `play()` (`AbortError` when the source changes) is swallowed.

- [ ] **Step 1: Write the failing test**

`src/renderer/features/meetings/media-driver.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { MediaDriver, type MediaLike } from './media-driver';

function fakeMedia(play: () => Promise<void> = async () => undefined) {
  return {
    currentTime: 0,
    ended: false,
    play: vi.fn(play),
    pause: vi.fn(),
    load: vi.fn(),
  } satisfies MediaLike;
}

function loadedDriver(media: MediaLike): MediaDriver {
  const driver = new MediaDriver();
  driver.attach(media);
  driver.loadedMetadata();
  return driver;
}

describe('MediaDriver', () => {
  it('seeks inside the loaded source at once', () => {
    const media = fakeMedia();
    loadedDriver(media).seek(30, true);
    expect(media.currentTime).toBe(30);
    expect(media.play).toHaveBeenCalledOnce();
  });

  it('waits for the metadata of the next source before seeking and playing', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    media.currentTime = 59;
    driver.queue(30, true);
    expect(driver.waiting).toBe(true);
    expect(media.currentTime).toBe(59);
    expect(media.play).not.toHaveBeenCalled();
    driver.loadedMetadata();
    expect(media.currentTime).toBe(30);
    expect(media.play).toHaveBeenCalledOnce();
    expect(driver.waiting).toBe(false);
  });

  it('keeps only the last target while a source loads', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    driver.queue(10, false);
    driver.seek(40, true);
    driver.loadedMetadata();
    expect(media.currentTime).toBe(40);
    expect(media.play).toHaveBeenCalledOnce();
  });

  it('keeps a seek made before the first metadata', () => {
    const media = fakeMedia();
    const driver = new MediaDriver();
    driver.attach(media);
    driver.seek(12, false);
    expect(media.currentTime).toBe(0);
    driver.loadedMetadata();
    expect(media.currentTime).toBe(12);
    expect(media.play).not.toHaveBeenCalled();
  });

  it('cancels a queued play when paused meanwhile', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    driver.queue(0, true);
    driver.setPlaying(false);
    driver.loadedMetadata();
    expect(media.play).not.toHaveBeenCalled();
  });

  it('plays and pauses the loaded source', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    driver.setPlaying(true);
    driver.setPlaying(false);
    expect(media.play).toHaveBeenCalledOnce();
    expect(media.pause).toHaveBeenCalledOnce();
  });

  it('fetches a failed source again', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    driver.failed();
    driver.retry(30, true);
    expect(media.load).toHaveBeenCalledOnce();
    driver.loadedMetadata();
    expect(media.currentTime).toBe(30);
    expect(media.play).toHaveBeenCalledOnce();
  });

  it('drops the target of a source that fails', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    driver.queue(30, true);
    driver.failed();
    expect(driver.waiting).toBe(false);
    driver.loadedMetadata();
    expect(media.currentTime).toBe(0);
  });

  it('still stops the element after React detached its ref', () => {
    const media = fakeMedia();
    const driver = new MediaDriver();
    driver.attach(media);
    driver.attach(null);
    driver.stop();
    expect(media.pause).toHaveBeenCalledOnce();
  });

  it('ignores a play interrupted by a source change', async () => {
    const media = fakeMedia(() => Promise.reject(new DOMException('interrupted', 'AbortError')));
    loadedDriver(media).setPlaying(true);
    await Promise.resolve();
    expect(media.play).toHaveBeenCalledOnce();
  });

  it('reports the end of the element', () => {
    const media = fakeMedia();
    const driver = loadedDriver(media);
    expect(driver.ended).toBe(false);
    media.ended = true;
    expect(driver.ended).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/renderer/features/meetings/media-driver.test.ts`
Expected: FAIL, « Failed to resolve import "./media-driver" ».

- [ ] **Step 3: Implement**

`src/renderer/features/meetings/media-driver.ts`:

```ts
/** What the driver needs from an <audio> or <video> element; a plain object in the tests. */
export interface MediaLike {
  currentTime: number;
  readonly ended: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
}

interface Target {
  offset: number;
  play: boolean;
}

/**
 * Drives the one media element of a meeting. A target aimed at a source that is not
 * loaded waits for its metadata: a currentTime set earlier is lost when the source changes.
 */
export class MediaDriver {
  private media: MediaLike | null = null;
  private loaded = false;
  private target: Target | null = null;

  /** React detaches the ref before the unmount cleanup: keep the last element for stop(). */
  attach(media: MediaLike | null): void {
    if (media) this.media = media;
  }

  get waiting(): boolean {
    return this.target !== null;
  }

  get ended(): boolean {
    return this.media?.ended ?? false;
  }

  /** The element is about to receive another source. */
  queue(offset: number, play: boolean): void {
    this.loaded = false;
    this.target = { offset, play };
  }

  /** The same source failed: the element fetches it again. */
  retry(offset: number, play: boolean): void {
    this.queue(offset, play);
    this.media?.load();
  }

  seek(offset: number, play: boolean): void {
    if (!this.loaded || !this.media) {
      this.target = { offset, play };
      return;
    }
    this.media.currentTime = offset;
    this.setPlaying(play);
  }

  setPlaying(play: boolean): void {
    if (this.target) {
      this.target = { ...this.target, play };
      return;
    }
    if (play) this.resume();
    else this.media?.pause();
  }

  loadedMetadata(): void {
    this.loaded = true;
    const target = this.target;
    if (!target || !this.media) return;
    this.target = null;
    this.media.currentTime = target.offset;
    if (target.play) this.resume();
  }

  failed(): void {
    this.loaded = false;
    this.target = null;
  }

  stop(): void {
    this.media?.pause();
  }

  private resume(): void {
    // A play interrupted by a source change rejects; the queued target starts it again.
    void this.media?.play().catch(() => undefined);
  }
}
```

- [ ] **Step 4: Run the test and the project checks**

```bash
npx vitest run src/renderer/features/meetings/media-driver.test.ts
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings/media-driver.ts src/renderer/features/meetings/media-driver.test.ts
git commit -m "feat: media driver that waits for a source before seeking into it"
```

---

### Task 5: `useMediaPlayback` on the continuous timeline

**Files:**

- Modify (rewrite): `src/renderer/features/meetings/use-media-playback.ts`
- Create: `src/renderer/features/meetings/use-media-playback.test.tsx`
- Modify: `src/renderer/test-setup.ts` (jsdom media stubs)
- Modify: `src/renderer/features/meetings/MediaPlayer.tsx` (bridge until Task 11 deletes it)

**Interfaces:**

- Consumes: `playbackSources`, `timelineEnd`, `locate`, `timelineTime`, `resumePoint` (Task 3); `MediaDriver` (Task 4).
- Produces:

```ts
export interface MediaElementProps {
  ref(element: HTMLMediaElement | null): void;
  src: string | undefined;
  preload: 'metadata';
  onLoadedMetadata(): void;
  onTimeUpdate(event: SyntheticEvent<HTMLMediaElement>): void;
  onPlay(): void;
  onPause(): void;
  onEnded(): void;
  onError(): void;
}

export interface Playback {
  available: boolean;
  playing: boolean;
  failed: boolean;
  /** Seconds from the start of the meeting. */
  at: number;
  duration: number;
  /** Spread on the one <audio> (footer) or <video> (top of the content). */
  mediaProps: MediaElementProps;
  toggle(): void;
  seek(at: number): void;
  playAt(at: number): void;
}

export function useMediaPlayback(meeting: Meeting): Playback;
```

`PlayerHandle` leaves this module (it moves into `MediaPlayer.tsx` until Task 11).

How the hook uses the timeline:

- `sources` is rebuilt on every render from `meeting`: the 2 s poll hands over a new meeting object with equal sources, so `src` keeps the same string and React does not touch the element. No effect depends on `sources`.
- State: `position` (current source), `at` (meeting time shown), `playing` (intent, confirmed by `play`/`pause` events), `failed`.
- `goTo(time, play)`: `locate`, then `at` jumps to the target at once; another source → `driver.queue` + new `position` (React sets the new `src`, the element loads, `loadedmetadata` applies the target); the same failed source → `driver.retry`; otherwise `driver.seek`.
- `seek(at)` keeps playing or paused (the progress bar); `playAt(at)` plays (a timestamp asks to hear the passage).
- `ended` on an extract: the next one is queued at 0 with play, `position` moves on, `at` jumps to its start. On the last one: `playing` false, `at` = `duration`.
- `pause` fires before `ended` at the end of an extract: `onPause` ignores it while `element.ended`, so the button does not flicker during the hand-over.
- `timeupdate` is ignored while a target waits: the element still reports the previous source.
- `error`: `failed` true, playing false; « Lire » then goes to `resumePoint` (the next extract).
- Unmount (another meeting is selected: `WorkspaceContent.tsx:44` keys the detail by id) calls `driver.stop()`.

- [ ] **Step 1: Stub the media element in jsdom**

jsdom has no media pipeline: `play`, `pause` and `load` only report « Not implemented ». Append to `src/renderer/test-setup.ts`:

```ts
// jsdom has no media pipeline: play and pause only report the change, as a browser would.
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  };
  HTMLMediaElement.prototype.load = () => undefined;
}
```

- [ ] **Step 2: Write the failing test**

`src/renderer/features/meetings/use-media-playback.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AudioChunk, Meeting } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { useMediaPlayback } from './use-media-playback';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const chunk = (index: number, start: number, duration = 60): AudioChunk => ({
  index,
  start,
  duration,
  transcript: null,
});
const threeMinutes = meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', {
  duration: 180,
  audioChunks: [chunk(0, 0), chunk(1, 60), chunk(2, 120)],
});

function Harness({ meeting }: { meeting: Meeting }) {
  const playback = useMediaPlayback(meeting);
  return (
    <>
      <audio data-testid="media" {...playback.mediaProps} />
      <p data-testid="at">{playback.at}</p>
      <p data-testid="duration">{playback.duration}</p>
      {playback.failed && <p>Échec</p>}
      <button onClick={playback.toggle}>{playback.playing ? 'Pause' : 'Lire'}</button>
      <button onClick={() => playback.playAt(150)}>2:30</button>
      <button onClick={() => playback.seek(90)}>1:30</button>
      <button onClick={() => playback.seek(30)}>0:30</button>
    </>
  );
}

const media = () => screen.getByTestId<HTMLAudioElement>('media');
const at = () => Number(screen.getByTestId('at').textContent);
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

function renderLoaded(meeting: Meeting = threeMinutes) {
  const view = render(<Harness meeting={meeting} />);
  fireEvent.loadedMetadata(media());
  return view;
}

it('plays the extracts one after the other as one timeline', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  renderLoaded();
  click('Lire');
  media().currentTime = 59;
  fireEvent.timeUpdate(media());
  expect(at()).toBe(59);
  fireEvent.ended(media());
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/1');
  expect(at()).toBe(60);
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  fireEvent.loadedMetadata(media());
  expect(media().currentTime).toBe(0);
  expect(play).toHaveBeenCalledTimes(2);
  media().currentTime = 12;
  fireEvent.timeUpdate(media());
  expect(at()).toBe(72);
});

it('stops at the end of the last extract and starts over from the beginning', () => {
  renderLoaded();
  click('2:30');
  fireEvent.loadedMetadata(media());
  fireEvent.ended(media());
  expect(at()).toBe(180);
  expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
  click('Lire');
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/0');
  expect(at()).toBe(0);
});

it('waits for an extract that is not loaded before seeking into it', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  renderLoaded();
  click('2:30');
  expect(at()).toBe(150);
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/2');
  expect(play).not.toHaveBeenCalled();
  media().currentTime = 0;
  fireEvent.timeUpdate(media());
  expect(at()).toBe(150);
  fireEvent.loadedMetadata(media());
  expect(media().currentTime).toBe(30);
  expect(play).toHaveBeenCalledOnce();
});

it('seeks from the bar without starting playback', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  renderLoaded();
  click('1:30');
  fireEvent.loadedMetadata(media());
  expect(media().currentTime).toBe(30);
  expect(play).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
});

it('stays paused when the person pauses while the next extract loads', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  renderLoaded();
  click('Lire');
  fireEvent.ended(media());
  click('Pause');
  fireEvent.loadedMetadata(media());
  expect(play).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
});

it('says an extract cannot be read and resumes after it', () => {
  renderLoaded();
  click('1:30');
  fireEvent.error(media());
  expect(screen.getByText('Échec')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
  click('Lire');
  expect(screen.queryByText('Échec')).toBeNull();
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/2');
  expect(at()).toBe(120);
});

it('fetches a failed extract again when the person seeks back into it', () => {
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load');
  renderLoaded();
  fireEvent.error(media());
  click('0:30');
  expect(load).toHaveBeenCalledOnce();
  expect(screen.queryByText('Échec')).toBeNull();
  fireEvent.loadedMetadata(media());
  expect(media().currentTime).toBe(30);
});

it('keeps the source and the position when the poll refreshes the same meeting', () => {
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load');
  const { rerender } = renderLoaded();
  click('2:30');
  fireEvent.loadedMetadata(media());
  media().currentTime = 40;
  fireEvent.timeUpdate(media());
  const refreshed: Meeting = {
    ...threeMinutes,
    status: 'processing',
    audioChunks: threeMinutes.audioChunks.map((item) => ({ ...item, transcript: [] })),
  };
  rerender(<Harness meeting={refreshed} />);
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/2');
  expect(media().currentTime).toBe(40);
  expect(at()).toBe(160);
  expect(load).not.toHaveBeenCalled();
});

it('orders the extracts by time and measures the whole meeting', () => {
  render(
    <Harness
      meeting={{
        ...threeMinutes,
        duration: 181.5,
        audioChunks: [chunk(2, 120), chunk(0, 0), chunk(1, 60)],
      }}
    />,
  );
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/0');
  expect(screen.getByTestId('duration')).toHaveTextContent('181.5');
});

it('drives the video as one source', () => {
  render(<Harness meeting={{ ...threeMinutes, hasVideo: true }} />);
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/video');
});

it('has nothing to play without audio', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  render(<Harness meeting={meetingFixture('m2', 'Vide', '2026-10-14T08:00:00Z')} />);
  expect(media()).not.toHaveAttribute('src');
  click('Lire');
  expect(play).not.toHaveBeenCalled();
});

it('stops the sound when the player goes away', () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
  const { unmount } = renderLoaded();
  click('Lire');
  unmount();
  expect(pause).toHaveBeenCalled();
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/renderer/features/meetings/use-media-playback.test.tsx`
Expected: FAIL: the current hook takes `(meeting, onTime, ref)`, has no `toggle`, `at` or `playAt`, and returns no `src` in `mediaProps`.

- [ ] **Step 4: Implement**

`src/renderer/features/meetings/use-media-playback.ts` (whole file):

```ts
import { useEffect, useState, type SyntheticEvent } from 'react';
import type { Meeting } from '../../../shared/contracts';
import { MediaDriver } from './media-driver';
import {
  locate,
  playbackSources,
  resumePoint,
  timelineEnd,
  timelineTime,
} from './playback-timeline';

export interface MediaElementProps {
  ref(element: HTMLMediaElement | null): void;
  src: string | undefined;
  preload: 'metadata';
  onLoadedMetadata(): void;
  onTimeUpdate(event: SyntheticEvent<HTMLMediaElement>): void;
  onPlay(): void;
  onPause(): void;
  onEnded(): void;
  onError(): void;
}

export interface Playback {
  available: boolean;
  playing: boolean;
  failed: boolean;
  /** Seconds from the start of the meeting. */
  at: number;
  duration: number;
  /** Spread on the one <audio> (footer) or <video> (top of the content). */
  mediaProps: MediaElementProps;
  toggle(): void;
  /** Moves the position and keeps playing or paused: the progress bar. */
  seek(at: number): void;
  /** Moves the position and plays: a timestamp asks to hear the passage. */
  playAt(at: number): void;
}

interface ElementEvents {
  onTimeUpdate(event: SyntheticEvent<HTMLMediaElement>): void;
  onEnded(): void;
  onError(): void;
  setPlaying(playing: boolean): void;
}

function elementProps(
  driver: MediaDriver,
  src: string | undefined,
  events: ElementEvents,
): MediaElementProps {
  return {
    ref: (element) => driver.attach(element),
    src,
    preload: 'metadata',
    onLoadedMetadata: () => driver.loadedMetadata(),
    onTimeUpdate: events.onTimeUpdate,
    onPlay: () => events.setPlaying(true),
    // An extract that reaches its end pauses before `ended`: the hand-over keeps the button.
    onPause: () => {
      if (!driver.ended) events.setPlaying(false);
    },
    onEnded: events.onEnded,
    onError: events.onError,
  };
}

export function useMediaPlayback(meeting: Meeting): Playback {
  // Rebuilt each render: the 2 s poll hands over equal sources, so `src` does not change.
  const sources = playbackSources(meeting);
  const duration = timelineEnd(sources, meeting.duration);
  const [driver] = useState(() => new MediaDriver());
  const [position, setPosition] = useState(0);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const source = sources[position];

  useEffect(() => () => driver.stop(), [driver]);

  function goTo(time: number, play: boolean): void {
    const target = locate(sources, time);
    const next = target ? sources[target.position] : undefined;
    if (!target || !next) return;
    setAt(next.start + target.offset);
    setPlaying(play);
    setFailed(false);
    if (target.position !== position) {
      driver.queue(target.offset, play);
      setPosition(target.position);
    } else if (failed) {
      driver.retry(target.offset, play);
    } else {
      driver.seek(target.offset, play);
    }
  }

  function toggle(): void {
    if (!source) return;
    if (playing) {
      setPlaying(false);
      driver.setPlaying(false);
      return;
    }
    const from = resumePoint({ sources, position, at, duration, failed });
    if (from !== null) {
      goTo(from, true);
      return;
    }
    setPlaying(true);
    driver.setPlaying(true);
  }

  function handleEnded(): void {
    const next = sources[position + 1];
    if (!next) {
      setPlaying(false);
      setAt(duration);
      return;
    }
    driver.queue(0, true);
    setAt(next.start);
    setPosition(position + 1);
  }

  function handleTimeUpdate(event: SyntheticEvent<HTMLMediaElement>): void {
    // While another source loads, the element still reports the previous one.
    if (!source || driver.waiting) return;
    setAt(timelineTime(source, event.currentTarget.currentTime));
  }

  function handleError(): void {
    driver.failed();
    setFailed(true);
    setPlaying(false);
  }

  return {
    available: sources.length > 0,
    playing,
    failed,
    at,
    duration,
    mediaProps: elementProps(driver, source?.src, {
      onTimeUpdate: handleTimeUpdate,
      onEnded: handleEnded,
      onError: handleError,
      setPlaying,
    }),
    toggle,
    seek: (time) => goTo(time, playing),
    playAt: (time) => goTo(time, true),
  };
}
```

`src/renderer/features/meetings/MediaPlayer.tsx` (whole file, a bridge that Task 11 deletes; it keeps `MeetingContext` and `MeetingDetail` compiling):

```tsx
import { useEffect, useImperativeHandle, type Ref } from 'react';
import type { Meeting } from '../../../shared/contracts';
import { useMediaPlayback } from './use-media-playback';

export interface PlayerHandle {
  seek(at: number): void;
}

interface MediaPlayerProps {
  meeting: Meeting;
  onTime(at: number): void;
  ref?: Ref<PlayerHandle>;
}

// Bridge to the new hook until the detail is rebuilt around the player bar (Task 11).
export function MediaPlayer({ meeting, onTime, ref }: MediaPlayerProps) {
  const playback = useMediaPlayback(meeting);
  const { at, playAt } = playback;
  useImperativeHandle(ref, () => ({ seek: playAt }), [playAt]);
  useEffect(() => onTime(at), [at, onTime]);

  return (
    <div className="media-player">
      {meeting.hasVideo ? (
        <video {...playback.mediaProps} controls />
      ) : (
        <audio {...playback.mediaProps} controls />
      )}
      {!playback.available && <p className="muted">Aucun média disponible.</p>}
      {playback.failed && <p className="caption">Ce passage ne peut pas être lu.</p>}
    </div>
  );
}
```

`MeetingContext.tsx:26` already passes `ref={props.playerRef}`; React 19 hands it to the function component as a prop, so that file does not change.

- [ ] **Step 5: Run the tests and the project checks**

```bash
npx vitest run src/renderer
npm run check
```

Expected: PASS; the App tests still render the detail with the bridge.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/features/meetings/use-media-playback.ts src/renderer/features/meetings/use-media-playback.test.tsx src/renderer/features/meetings/MediaPlayer.tsx src/renderer/test-setup.ts
git commit -m "feat: continuous playback across the audio extracts of a meeting"
```

---

### Task 6: Segmented control and per-tab scroll memory

**Files:**

- Create: `src/renderer/components/Segmented.tsx`, `src/renderer/components/Segmented.test.tsx`
- Modify: `src/renderer/components/ui.tsx`
- Create: `src/renderer/styles/segmented.css`
- Modify: `src/renderer/main.tsx` (import the sheet after `./styles/meetings.css`), `src/renderer/styles.css:194-215` (`.tabs button` becomes `.segmented-tab` in the grouped colour transition)
- Create: `src/renderer/features/meetings/use-tab-scroll.ts`, `use-tab-scroll.test.tsx`

**Interfaces:**

- Produces: `interface SegmentedOption<T extends string> { value: T; label: string; panelId: string }`; `Segmented<T extends string>(props: { label: string; options: readonly SegmentedOption<T>[]; value: T; onChange(value: T): void })`; `tabId(panelId: string): string` (`${panelId}-tab`, for `aria-labelledby` on the panel). Exported from `ui.tsx`.
- Produces: `restoredScroll(saved: number | undefined, previousTop: number, anchorTop: number): number`; `useTabScroll<T extends string>(initial: T): { tab: T; select(next: T): void; scrollerRef: RefObject<HTMLDivElement | null>; anchorRef: RefObject<HTMLDivElement | null> }`.

The detail has one scroll container holding the header, the sticky tab bar and the active panel. Switching tabs saves the position of the tab being left and, once the other panel has rendered (`useLayoutEffect`), restores its saved position. The first visit to a tab keeps the tab bar where it is: `min(previous position, anchor)`, where the anchor is an empty element just above the tab bar (its `offsetTop` is not affected by stickiness).

- [ ] **Step 1: Write the failing tests**

`src/renderer/components/Segmented.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Segmented, type SegmentedOption } from './Segmented';

afterEach(cleanup);

type View = 'notes' | 'transcript' | 'video';
const options: readonly SegmentedOption<View>[] = [
  { value: 'notes', label: 'Notes', panelId: 'p-notes' },
  { value: 'transcript', label: 'Transcription', panelId: 'p-transcript' },
  { value: 'video', label: 'Vidéo', panelId: 'p-video' },
];

function Harness({ onChange = vi.fn() }: { onChange?: (value: View) => void }) {
  const [value, setValue] = useState<View>('notes');
  return (
    <Segmented
      label="Contenu de la réunion"
      options={options}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const tab = (name: string) => screen.getByRole('tab', { name });

it('selects a tab by click and names the panel it controls', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.getByRole('tablist', { name: 'Contenu de la réunion' })).toBeInTheDocument();
  await user.click(tab('Transcription'));
  expect(tab('Transcription')).toHaveAttribute('aria-selected', 'true');
  expect(tab('Notes')).toHaveAttribute('aria-selected', 'false');
  expect(tab('Transcription')).toHaveAttribute('aria-controls', 'p-transcript');
  expect(tab('Transcription')).toHaveAttribute('id', 'p-transcript-tab');
});

it('moves with the arrows, Home and End, and wraps around', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(tab('Notes'));
  await user.keyboard('{ArrowRight}');
  expect(tab('Transcription')).toHaveFocus();
  expect(tab('Transcription')).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{End}');
  expect(tab('Vidéo')).toHaveFocus();
  await user.keyboard('{ArrowRight}');
  expect(tab('Notes')).toHaveFocus();
  await user.keyboard('{ArrowLeft}');
  expect(tab('Vidéo')).toHaveFocus();
  await user.keyboard('{Home}');
  expect(tab('Notes')).toHaveFocus();
  expect(tab('Notes')).toHaveAttribute('aria-selected', 'true');
});

it('keeps only the selected tab in the tab order', () => {
  render(<Harness />);
  expect(tab('Notes')).toHaveAttribute('tabindex', '0');
  expect(tab('Transcription')).toHaveAttribute('tabindex', '-1');
  expect(tab('Vidéo')).toHaveAttribute('tabindex', '-1');
});

it('ignores the other keys', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  await user.click(tab('Notes'));
  await user.keyboard('a{ArrowDown}');
  expect(onChange).toHaveBeenCalledOnce();
});
```

`src/renderer/features/meetings/use-tab-scroll.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { restoredScroll, useTabScroll } from './use-tab-scroll';

afterEach(cleanup);

function Harness() {
  const { tab, select, scrollerRef, anchorRef } = useTabScroll<'notes' | 'transcript'>('notes');
  return (
    <div data-testid="scroller" ref={scrollerRef}>
      <div ref={anchorRef} />
      <button onClick={() => select('notes')}>Notes</button>
      <button onClick={() => select('transcript')}>Transcription</button>
      <p>{tab}</p>
    </div>
  );
}

describe('restoredScroll', () => {
  it.each([
    [undefined, 900, 240, 240],
    [undefined, 100, 240, 100],
    [500, 0, 240, 500],
    [0, 900, 240, 0],
  ])('saved %s, left at %s, anchor at %s: %s', (saved, previous, anchor, expected) => {
    expect(restoredScroll(saved, previous, anchor)).toBe(expected);
  });
});

describe('useTabScroll', () => {
  it('gives each tab back its own scroll position', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const scroller = screen.getByTestId('scroller');
    scroller.scrollTop = 300;
    await user.click(screen.getByRole('button', { name: 'Transcription' }));
    // First visit: the tab bar stays at its anchor, 0 in jsdom.
    expect(scroller.scrollTop).toBe(0);
    scroller.scrollTop = 120;
    await user.click(screen.getByRole('button', { name: 'Notes' }));
    expect(scroller.scrollTop).toBe(300);
    await user.click(screen.getByRole('button', { name: 'Transcription' }));
    expect(scroller.scrollTop).toBe(120);
  });

  it('leaves the scroll alone when the current tab is chosen again', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const scroller = screen.getByTestId('scroller');
    scroller.scrollTop = 300;
    await user.click(screen.getByRole('button', { name: 'Notes' }));
    expect(scroller.scrollTop).toBe(300);
    expect(screen.getByText('notes')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/components/Segmented.test.tsx src/renderer/features/meetings/use-tab-scroll.test.tsx`
Expected: FAIL, the two modules do not resolve.

- [ ] **Step 3: Implement**

`src/renderer/components/Segmented.tsx`:

```tsx
import { useRef, type KeyboardEvent } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Id of the tabpanel this tab shows. */
  panelId: string;
}

interface SegmentedProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange(value: T): void;
}

export const tabId = (panelId: string) => `${panelId}-tab`;

function targetIndex(key: string, index: number, count: number): number | null {
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/** Tabs with automatic activation: the arrows move the focus and the selection together. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const next = targetIndex(event.key, index, options.length);
    if (next === null) return;
    const option = options[next];
    if (!option) return;
    event.preventDefault();
    onChange(option.value);
    tabs.current[next]?.focus();
  }

  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={tabId(option.panelId)}
            className="segmented-tab"
            aria-selected={selected}
            aria-controls={option.panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
```

`src/renderer/components/ui.tsx`, append:

```ts
export { Segmented, tabId, type SegmentedOption } from './Segmented';
```

`src/renderer/styles/segmented.css`:

```css
.segmented {
  display: grid;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
  gap: var(--space-1);
  padding: 2px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}
.segmented-tab {
  height: 26px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--text-control);
  font-weight: 500;
}
.segmented-tab:hover {
  color: var(--color-text);
}
.segmented-tab[aria-selected='true'] {
  background: var(--color-surface-raised);
  color: var(--color-text);
}
```

`src/renderer/main.tsx`: add `import './styles/segmented.css';` right after `import './styles/meetings.css';`.

`src/renderer/styles.css`: in the grouped selector before `transition:` (lines 195-210), replace `.tabs button,` with `.segmented-tab,`.

`src/renderer/features/meetings/use-tab-scroll.ts`:

```ts
import { useLayoutEffect, useRef, useState } from 'react';

/** First visit keeps the tab bar where it is: never further down than its anchor. */
export function restoredScroll(
  saved: number | undefined,
  previousTop: number,
  anchorTop: number,
): number {
  return saved ?? Math.min(previousTop, anchorTop);
}

/** One scroll container for every tab; each tab gets its own position back. */
export function useTabScroll<T extends string>(initial: T) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<T, number>());
  const leftAt = useRef<number | null>(null);
  const [tab, setTab] = useState(initial);

  function select(next: T): void {
    if (next === tab) return;
    const scroller = scrollerRef.current;
    if (scroller) {
      positions.current.set(tab, scroller.scrollTop);
      leftAt.current = scroller.scrollTop;
    }
    setTab(next);
  }

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const previous = leftAt.current;
    if (!scroller || previous === null) return;
    leftAt.current = null;
    const anchor = anchorRef.current?.offsetTop ?? 0;
    scroller.scrollTop = restoredScroll(positions.current.get(tab), previous, anchor);
  }, [tab]);

  return { tab, select, scrollerRef, anchorRef };
}
```

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/components src/renderer/features/meetings/use-tab-scroll.test.tsx src/renderer/design-tokens.test.ts src/renderer/motion-guard.test.ts
npm run check
```

Expected: PASS; `segmented.css` passes both guards.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/Segmented.tsx src/renderer/components/Segmented.test.tsx src/renderer/components/ui.tsx src/renderer/styles/segmented.css src/renderer/main.tsx src/renderer/styles.css src/renderer/features/meetings/use-tab-scroll.ts src/renderer/features/meetings/use-tab-scroll.test.tsx
git commit -m "feat: segmented tabs and a scroll position per tab"
```

---

### Task 7: Folder chip and analysis status for the meta line

**Files:**

- Create: `src/renderer/features/meetings/FolderControl.tsx`, `FolderControl.test.tsx`
- Create: `src/renderer/features/meetings/AnalysisStatus.tsx`, `AnalysisStatus.test.tsx`
- Create: `src/renderer/styles/meeting-detail.css`
- Modify: `src/renderer/main.tsx` (import the sheet after `./styles/segmented.css`)

**Interfaces:**

- Consumes: `useFolderEditor({ onCreate, onRename })` and `FolderNameField` from `features/list` (`useFolderEditor.ts:9`, `FolderNameField.tsx:14`); `useCurrentDate(intervalMs)` (`use-current-date.ts:4`); `analysisLabel`, `analysisRatio`, `remainingLabel` (Task 2).
- Produces: `FolderControl` props `{ meeting: Meeting; folders: Folder[]; onMove(folderId: string | null): void; onCreate(name: string): Promise<Folder | null> }`; `AnalysisStatus` props `{ meeting: Meeting }`; `AnalysisLine` props `{ meeting: Meeting }`.

The folder control is a chip face (« Acme ⌄ » or « Ajouter à un dossier… ») with a transparent native `<select>` laid over it: the macOS menu, the keyboard and the accessible name « Dossier de la réunion » come from the select, and the App tests that select `''` keep working (`App.selection.test.tsx:68`). « Nouveau dossier… » swaps the chip for the existing inline `FolderNameField`; a created folder files the meeting at once.

- [ ] **Step 1: Write the failing tests**

`src/renderer/features/meetings/FolderControl.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Folder, Meeting } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { FolderControl } from './FolderControl';

afterEach(cleanup);

const folders: Folder[] = [
  { id: 'f1', name: 'Acme', createdAt: '' },
  { id: 'f2', name: 'Interne', createdAt: '' },
];
const unfiled = meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z');

type CreateFolder = (name: string) => Promise<Folder | null>;

function renderControl(
  meeting: Meeting,
  onCreate: CreateFolder = vi.fn(async (name: string) => ({ id: 'f3', name, createdAt: '' })),
) {
  const onMove = vi.fn();
  render(<FolderControl meeting={meeting} folders={folders} onMove={onMove} onCreate={onCreate} />);
  return { onMove, onCreate };
}

const select = () => screen.getByRole('combobox', { name: 'Dossier de la réunion' });

it('invites to file a meeting that has no folder', () => {
  renderControl(unfiled);
  expect(screen.getByText('Ajouter à un dossier…')).toBeInTheDocument();
  expect(select()).toHaveDisplayValue('Sans dossier');
  expect(
    within(select())
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['Sans dossier', 'Acme', 'Interne', 'Nouveau dossier…']);
});

it('names the folder of the meeting', () => {
  renderControl({ ...unfiled, folderId: 'f1' });
  expect(select()).toHaveDisplayValue('Acme');
  expect(screen.queryByText('Ajouter à un dossier…')).toBeNull();
});

it('creates a folder and files the meeting in it', async () => {
  const user = userEvent.setup();
  const { onMove, onCreate } = renderControl(unfiled);
  await user.selectOptions(select(), 'Nouveau dossier…');
  expect(onMove).not.toHaveBeenCalled();
  await user.type(screen.getByRole('textbox', { name: 'Nom du dossier' }), 'Clients{Enter}');
  expect(onCreate).toHaveBeenCalledWith('Clients');
  await vi.waitFor(() => expect(onMove).toHaveBeenCalledWith('f3'));
  expect(
    await screen.findByRole('combobox', { name: 'Dossier de la réunion' }),
  ).toBeInTheDocument();
});

it('stays on the field when the folder cannot be created', async () => {
  const user = userEvent.setup();
  const { onMove } = renderControl(
    unfiled,
    vi.fn(async () => null),
  );
  await user.selectOptions(select(), 'Nouveau dossier…');
  await user.type(screen.getByRole('textbox', { name: 'Nom du dossier' }), 'Clients{Enter}');
  expect(screen.getByRole('textbox', { name: 'Nom du dossier' })).toBeInTheDocument();
  expect(onMove).not.toHaveBeenCalled();
});

it('cancels the new folder with Escape', async () => {
  const user = userEvent.setup();
  const { onCreate } = renderControl(unfiled);
  await user.selectOptions(select(), 'Nouveau dossier…');
  await user.keyboard('{Escape}');
  expect(select()).toBeInTheDocument();
  expect(onCreate).not.toHaveBeenCalled();
});
```

`src/renderer/features/meetings/AnalysisStatus.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { AudioChunk } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { AnalysisStatus } from './AnalysisStatus';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const chunks = (total: number, done: number): AudioChunk[] =>
  Array.from({ length: total }, (_, index) => ({
    index,
    start: index * 60,
    duration: 60,
    transcript: index < done ? [] : null,
  }));

it('says how far the analysis is, then how long it should last', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T12:02:00Z'));
  const meeting = meetingFixture('m1', 'Test', '2026-09-12T12:00:00Z', {
    status: 'processing',
    processingStartedAt: '2026-09-12T12:00:00Z',
    duration: 180,
    audioChunks: chunks(3, 1),
  });
  render(<AnalysisStatus meeting={meeting} />);
  expect(screen.getByRole('status')).toHaveTextContent('Analyse en cours · 1 segment sur 3');
  expect(screen.getByText(/environ 4 min/)).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(screen.getByText(/environ 6 min/)).toBeInTheDocument();
});

it('keeps the estimate out of the announced status', () => {
  const meeting = meetingFixture('m1', 'Test', '2026-09-12T12:00:00Z', {
    status: 'processing',
    processingStartedAt: new Date(Date.now() - 60_000).toISOString(),
    audioChunks: chunks(12, 3),
  });
  render(<AnalysisStatus meeting={meeting} />);
  expect(screen.getByRole('status')).toHaveTextContent(/^Analyse en cours · 3 segments sur 12$/);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/features/meetings/FolderControl.test.tsx src/renderer/features/meetings/AnalysisStatus.test.tsx`
Expected: FAIL, the two modules do not resolve.

- [ ] **Step 3: Implement**

`src/renderer/features/meetings/FolderControl.tsx`:

```tsx
import { ChevronDown } from 'lucide-react';
import type { Folder, Meeting } from '../../../shared/contracts';
import { FolderNameField } from '../list/FolderNameField';
import { useFolderEditor } from '../list/useFolderEditor';

// Folder ids are UUIDs; « Sans dossier » is the empty value.
const NEW_FOLDER = 'new-folder';

interface FolderControlProps {
  meeting: Meeting;
  folders: Folder[];
  onMove(folderId: string | null): void;
  onCreate(name: string): Promise<Folder | null>;
}

// The header only creates folders; renaming lives in the list's chip menu.
async function noRename(): Promise<boolean> {
  return false;
}

/** A chip face over a transparent native select: the menu and the keyboard stay native. */
export function FolderControl({ meeting, folders, onMove, onCreate }: FolderControlProps) {
  async function createAndMove(name: string): Promise<Folder | null> {
    const folder = await onCreate(name);
    if (folder) onMove(folder.id);
    return folder;
  }
  const editor = useFolderEditor({ onCreate: createAndMove, onRename: noRename });
  const current = folders.find((folder) => folder.id === meeting.folderId);
  const settled = meeting.status !== 'recording' && meeting.status !== 'processing';

  function choose(value: string): void {
    if (value === NEW_FOLDER) editor.startCreate();
    else onMove(value || null);
  }

  if (editor.editing) {
    return (
      <FolderNameField
        name={editor.name}
        busy={editor.busy}
        error={editor.error}
        onName={editor.setName}
        onSave={() => void editor.submit()}
        onCancel={editor.cancel}
      />
    );
  }
  return (
    <span className="folder-control">
      <span className="chip folder-control-face" aria-hidden="true">
        {current?.name ?? 'Ajouter à un dossier…'}
        <ChevronDown size={12} />
      </span>
      <select
        className="folder-control-select"
        aria-label="Dossier de la réunion"
        value={current?.id ?? ''}
        disabled={!settled}
        onChange={(event) => choose(event.target.value)}
      >
        <option value="">Sans dossier</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
        <option value={NEW_FOLDER}>Nouveau dossier…</option>
      </select>
    </span>
  );
}
```

`src/renderer/features/meetings/AnalysisStatus.tsx`:

```tsx
import type { Meeting } from '../../../shared/contracts';
import { useCurrentDate } from '../list/use-current-date';
import { analysisLabel, analysisRatio, remainingLabel } from './analysis-progress';

/** The status slot of the meta line while the analysis runs; only the progress is announced. */
export function AnalysisStatus({ meeting }: { meeting: Meeting }) {
  const now = useCurrentDate(5_000);
  const remaining = remainingLabel(meeting, now.getTime());
  return (
    <span className="analysis-status">
      <span role="status">{analysisLabel(meeting)}</span>
      {remaining && <span> · {remaining}</span>}
    </span>
  );
}

/** 2 px across the top of the card, positioned against .main-card: nothing below moves. */
export function AnalysisLine({ meeting }: { meeting: Meeting }) {
  return (
    <span className="analysis-line" aria-hidden="true">
      <span
        className="analysis-line-bar"
        style={{ transform: `scaleX(${analysisRatio(meeting)})` }}
      />
    </span>
  );
}
```

`src/renderer/styles/meeting-detail.css` (header and meta line; Task 12 adds the layout):

```css
.detail-header {
  padding-top: var(--space-2);
  margin-bottom: var(--space-4);
}
.detail-header h1 {
  margin: 0 0 var(--space-2);
  overflow-wrap: anywhere;
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-subtle);
  font-size: var(--text-caption);
}
.detail-meta > :not(:first-child)::before {
  content: '·';
  margin-right: var(--space-2);
}
.folder-control {
  position: relative;
  display: inline-flex;
}
.folder-control-face {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
.folder-control:hover .folder-control-face {
  background: var(--color-surface);
  color: var(--color-text);
}
.folder-control:has(:focus-visible) .folder-control-face {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.folder-control:has(:disabled) {
  opacity: 0.55;
}
.folder-control-select {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}
.folder-control-select:disabled {
  cursor: not-allowed;
}
.analysis-status {
  font-variant-numeric: tabular-nums;
}
.notice-detail {
  display: block;
  margin-top: var(--space-1);
  color: var(--color-text-muted);
}
.detail-notices {
  display: grid;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
```

`src/renderer/main.tsx`: add `import './styles/meeting-detail.css';` after `import './styles/segmented.css';`.

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/features/meetings src/renderer/design-tokens.test.ts src/renderer/motion-guard.test.ts
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings/FolderControl.tsx src/renderer/features/meetings/FolderControl.test.tsx src/renderer/features/meetings/AnalysisStatus.tsx src/renderer/features/meetings/AnalysisStatus.test.tsx src/renderer/styles/meeting-detail.css src/renderer/main.tsx
git commit -m "feat: folder chip and analysis progress for the meeting meta line"
```

---

### Task 8: Clarifications in `mm:ss`

**Files:**

- Modify (rewrite): `src/renderer/features/meetings/ClarificationForm.tsx`, `ClarificationForm.test.tsx`
- Create: `src/renderer/features/meetings/Clarifications.tsx`, `Clarifications.test.tsx`
- Create: `src/renderer/styles/meeting-notes.css`
- Modify: `src/renderer/main.tsx` (import the sheet after `./styles/meeting-detail.css`)
- Modify: `src/renderer/features/meetings/MeetingContext.tsx` (until Task 11 deletes it)

**Interfaces:**

- Consumes: `parseMoment` (Task 1), `shortTimeLabel` (Task 1), `timeLabel`.
- Produces: `ClarificationForm` props `{ duration: number; at: number; saving: boolean; onClose(): void; onSubmit(at: number, text: string): Promise<boolean> }`; `type TimestampHandler = (at: number, sourceId: string) => void` exported from `Clarifications.tsx`; `Clarifications` props `{ meeting: Meeting; at: number; disabled: boolean; saving: boolean; onTimestamp: TimestampHandler; onSubmit(at: number, text: string): Promise<boolean> }`.

`TimestampHandler` is the lot 6 hook point: every timestamp hands over its source id (`'1-0'` for a segment, `'clarification:<id>'` for a clarification, the same ids `NoteItem.sourceIds` uses). Lot 5 plays the time; lot 6 will also switch to « Transcription » and highlight the source, without changing the components.

The « Moment » field is prefilled once, with the playback position when the form opens (`timeLabel(at)`, `mm:ss`). It does not follow playback afterwards: a field that changes under the cursor cannot be typed in.

- [ ] **Step 1: Write the failing tests**

`src/renderer/features/meetings/ClarificationForm.test.tsx` (whole file):

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClarificationForm } from './ClarificationForm';

afterEach(cleanup);

function renderForm(onSubmit = vi.fn(async () => true), duration = 3130.4, at = 252.7) {
  const onClose = vi.fn();
  render(
    <ClarificationForm
      duration={duration}
      at={at}
      saving={false}
      onClose={onClose}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, onClose };
}

const moment = () => screen.getByRole('textbox', { name: 'Moment' });
const text = () => screen.getByRole('textbox', { name: 'Votre précision' });

it('prefills the moment with the playback position and submits it in seconds', async () => {
  const user = userEvent.setup();
  const { onSubmit, onClose } = renderForm();
  expect(screen.getByText(/Un « ça » un peu flou/)).toBeInTheDocument();
  expect(moment()).toHaveValue('04:12');
  await user.type(text(), 'Le bouton Exporter.');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(onSubmit).toHaveBeenCalledWith(252, 'Le bouton Exporter.');
  await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});

it('reads a moment typed as m:ss', async () => {
  const user = userEvent.setup();
  const { onSubmit } = renderForm();
  await user.clear(moment());
  await user.type(moment(), '1:5');
  await user.type(text(), 'Le budget.');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(onSubmit).toHaveBeenCalledWith(65, 'Le budget.');
});

it('refuses a moment past the end of the meeting', async () => {
  const user = userEvent.setup();
  const { onSubmit } = renderForm(
    vi.fn(async () => true),
    120,
    0,
  );
  await user.clear(moment());
  await user.type(moment(), '02:01');
  await user.type(text(), 'Trop tard.');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Ce moment dépasse la fin de la réunion (02:00).',
  );
  expect(moment()).toHaveAttribute('aria-invalid', 'true');
  expect(onSubmit).not.toHaveBeenCalled();
});

it('refuses a moment it cannot read, and forgets the error once corrected', async () => {
  const user = userEvent.setup();
  renderForm();
  await user.clear(moment());
  await user.type(moment(), '-1:00');
  await user.type(text(), 'Hein ?');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Indiquez un moment au format mm:ss, par exemple 04:12.',
  );
  await user.type(moment(), '{Backspace}');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('stays open with the draft when saving fails', async () => {
  const user = userEvent.setup();
  const { onClose } = renderForm(vi.fn(async () => false));
  await user.type(text(), 'Le bouton Exporter.');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(onClose).not.toHaveBeenCalled();
  expect(text()).toHaveValue('Le bouton Exporter.');
});

it('adds nothing without text', () => {
  renderForm();
  expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled();
});
```

`src/renderer/features/meetings/Clarifications.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Meeting } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { Clarifications } from './Clarifications';

afterEach(cleanup);

const meeting = meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', {
  status: 'ready',
  duration: 120,
  clarifications: [{ id: 'c1', at: 45, text: 'On parle du bouton Exporter.', createdAt: '' }],
});

function renderSection(extra: { meeting?: Meeting; disabled?: boolean } = {}) {
  const onTimestamp = vi.fn();
  const onSubmit = vi.fn(async () => true);
  render(
    <Clarifications
      meeting={extra.meeting ?? meeting}
      at={30}
      disabled={extra.disabled ?? false}
      saving={false}
      onTimestamp={onTimestamp}
      onSubmit={onSubmit}
    />,
  );
  return { onTimestamp, onSubmit };
}

it('lists the clarifications and plays one from its time', async () => {
  const user = userEvent.setup();
  const { onTimestamp } = renderSection();
  expect(screen.getByRole('heading', { level: 2, name: 'Précisions' })).toBeInTheDocument();
  expect(screen.getByText('On parle du bouton Exporter.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Écouter à 0:45' }));
  expect(onTimestamp).toHaveBeenCalledWith(45, 'clarification:c1');
});

it('opens the form at the playback position and closes it after saving', async () => {
  const user = userEvent.setup();
  const { onSubmit } = renderSection();
  await user.click(screen.getByRole('button', { name: 'Ajouter une précision' }));
  expect(screen.getByRole('textbox', { name: 'Moment' })).toHaveValue('00:30');
  await user.type(screen.getByRole('textbox', { name: 'Votre précision' }), 'Le budget.');
  await user.click(screen.getByRole('button', { name: 'Ajouter' }));
  expect(onSubmit).toHaveBeenCalledWith(30, 'Le budget.');
  expect(await screen.findByRole('button', { name: 'Ajouter une précision' })).toBeInTheDocument();
});

it('closes the form with « Annuler »', async () => {
  const user = userEvent.setup();
  renderSection();
  await user.click(screen.getByRole('button', { name: 'Ajouter une précision' }));
  await user.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(screen.queryByRole('textbox', { name: 'Votre précision' })).toBeNull();
});

it('cannot add a clarification while the analysis runs', () => {
  renderSection({ disabled: true });
  expect(screen.getByRole('button', { name: 'Ajouter une précision' })).toBeDisabled();
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/features/meetings/ClarificationForm.test.tsx src/renderer/features/meetings/Clarifications.test.tsx`
Expected: FAIL: no « Moment » textbox (the field is a number input named « Moment (secondes) »), no « Ajouter » button, `Clarifications` does not resolve.

- [ ] **Step 3: Implement**

`src/renderer/features/meetings/ClarificationForm.tsx` (whole file):

```tsx
import { useState, type FormEvent } from 'react';
import { timeLabel } from '../../../shared/format';
import { Button } from '../../components/ui';
import { parseMoment } from './moment';

interface ClarificationFormProps {
  duration: number;
  /** Playback position when the form opened. */
  at: number;
  saving: boolean;
  onClose(): void;
  onSubmit(at: number, text: string): Promise<boolean>;
}

const ERROR_ID = 'clarification-moment-error';

export function ClarificationForm({
  duration,
  at,
  saving,
  onClose,
  onSubmit,
}: ClarificationFormProps) {
  const [text, setText] = useState('');
  const [moment, setMoment] = useState(() => timeLabel(at));
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = parseMoment(moment, duration);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (await onSubmit(parsed.seconds, text)) onClose();
  }

  return (
    <form className="clarification-form" onSubmit={(event) => void submit(event)}>
      <p className="caption">
        Un « ça » un peu flou ? Revenez au passage et expliquez ce qu’il désigne.
      </p>
      <label className="field">
        Votre précision
        <textarea
          autoFocus
          rows={3}
          maxLength={2000}
          value={text}
          placeholder="Ex. On parle du bouton Exporter…"
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <label className="field clarification-moment">
        Moment
        <input
          inputMode="numeric"
          placeholder="mm:ss"
          value={moment}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          onChange={(event) => {
            setMoment(event.target.value);
            setError('');
          }}
        />
      </label>
      {error && (
        <p id={ERROR_ID} className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="clarification-actions">
        <Button variant="ghost" disabled={saving} onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" variant="secondary" busy={saving} disabled={!text.trim()}>
          Ajouter
        </Button>
      </div>
    </form>
  );
}
```

`src/renderer/features/meetings/Clarifications.tsx`:

```tsx
import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import type { Meeting } from '../../../shared/contracts';
import { Button } from '../../components/ui';
import { ClarificationForm } from './ClarificationForm';
import { shortTimeLabel } from './detail-format';

/** A timestamp hands over its time and its source id; lot 6 uses the id to reach the turn. */
export type TimestampHandler = (at: number, sourceId: string) => void;

interface ClarificationsProps {
  meeting: Meeting;
  at: number;
  disabled: boolean;
  saving: boolean;
  onTimestamp: TimestampHandler;
  onSubmit(at: number, text: string): Promise<boolean>;
}

export function Clarifications(props: ClarificationsProps) {
  const { meeting, at, disabled, saving, onTimestamp, onSubmit } = props;
  const [open, setOpen] = useState(false);

  return (
    <section className="note-section">
      <h2>Précisions</h2>
      {meeting.clarifications.length > 0 && (
        <ul className="note-list">
          {meeting.clarifications.map((item) => (
            <li key={item.id}>
              <span className="note-text">{item.text}</span>
              <button
                type="button"
                className="timestamp-link"
                aria-label={`Écouter à ${shortTimeLabel(item.at)}`}
                onClick={() => onTimestamp(item.at, `clarification:${item.id}`)}
              >
                {shortTimeLabel(item.at)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <ClarificationForm
          duration={meeting.duration}
          at={at}
          saving={saving}
          onClose={() => setOpen(false)}
          onSubmit={onSubmit}
        />
      ) : (
        <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
          <MessageSquarePlus size={16} aria-hidden="true" />
          Ajouter une précision
        </Button>
      )}
    </section>
  );
}
```

`src/renderer/features/meetings/MeetingContext.tsx` keeps compiling until Task 11 deletes it: replace its `<ClarificationForm … />` element (lines 27-34) by

```tsx
<Clarifications
  meeting={props.meeting}
  at={props.at}
  disabled={props.analyzing}
  saving={props.saving}
  onTimestamp={(at) => props.onSeek(at)}
  onSubmit={props.onClarify}
/>
```

delete its `{props.meeting.clarifications.length > 0 && (…)}` block (lines 35-48, now inside `Clarifications`) and the `ClarificationForm` import, and import `Clarifications` from `./Clarifications`. Keep the `onTime` prop: `MediaPlayer` (line 26) still uses it, so `MeetingDetail.tsx` does not change.

`src/renderer/styles/meeting-notes.css`:

```css
.note-section h2 {
  margin-bottom: var(--space-2);
  font-size: var(--text-section);
}
.note-list {
  display: grid;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding-left: var(--space-4);
  line-height: 1.6;
}
.note-list li::marker {
  color: var(--color-text-subtle);
}
.note-text {
  margin-right: var(--space-1);
}
.timestamp-link {
  margin-left: var(--space-1);
  padding: 0 var(--space-1);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-subtle);
  font-size: var(--text-caption);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  white-space: nowrap;
}
.timestamp-link:hover {
  background: var(--color-surface);
  color: var(--color-accent);
}
.clarification-form {
  display: grid;
  gap: var(--space-3);
}
.clarification-moment input {
  width: 96px;
  font-variant-numeric: tabular-nums;
}
.clarification-actions {
  display: flex;
  justify-content: end;
  gap: var(--space-2);
}
.field-error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--text-caption);
}
```

`src/renderer/main.tsx`: add `import './styles/meeting-notes.css';` after `import './styles/meeting-detail.css';`. It loads after `meetings.css`, so these rules win over the old `.timestamp-link` ones until Task 12 deletes them.

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings/ClarificationForm.tsx src/renderer/features/meetings/ClarificationForm.test.tsx src/renderer/features/meetings/Clarifications.tsx src/renderer/features/meetings/Clarifications.test.tsx src/renderer/features/meetings/MeetingContext.tsx src/renderer/styles/meeting-notes.css src/renderer/main.tsx
git commit -m "feat: clarifications with an mm:ss moment prefilled from playback"
```

---

### Task 9: Notes view

**Files:**

- Modify: `src/renderer/features/meetings/meeting-format.ts:13-50`
- Create: `src/renderer/features/meetings/meeting-format.test.ts`
- Modify (rewrite): `src/renderer/features/meetings/NoteSection.tsx`
- Create: `src/renderer/features/meetings/AnalysisPrompt.tsx`, `NotesView.tsx`, `NotesView.test.tsx`
- Modify: `src/renderer/features/meetings/MeetingNotes.tsx` (until Task 11 deletes it)
- Modify: `src/renderer/styles.css` (token `--space-6`), `src/renderer/styles/meeting-notes.css`

**Interfaces:**

- Consumes: `TimestampHandler`, `Clarifications` (Task 8); `shortTimeLabel` (Task 1).
- Produces: `interface NoteSource { id: string; at: number }`; `noteSources(meeting: Meeting, sourceIds: readonly string[]): NoteSource[]` (playable sources in order, unknown ids dropped, one per second); `notesMarkdown(meeting: Meeting): string` (title, summary, sections, « Précisions »; no transcript); `meetingMarkdown` = `notesMarkdown` + « Transcription », same output as today except duplicate times in one note.
- Produces: `NoteSection` props `{ title: string; items: NoteItem[]; meeting: Meeting; onTimestamp: TimestampHandler }`; `AnalysisPrompt` props `{ canAnalyze: boolean; onAnalyze(): void; onSettings(): void }`; `NotesView` props `{ meeting: Meeting; at: number; analyzing: boolean; saving: boolean; onAnalyze(): void; onSettings(): void; onTimestamp: TimestampHandler; onClarify(at: number, text: string): Promise<boolean> }`.

States of the notes panel: notes present → « Résumé » and the four sections, then « Actualiser les notes »; no notes and the analysis runs → a static skeleton, nothing to read (the meta line and the card line already say it); no notes and the analysis failed → nothing (the amber band says it); otherwise « Prêt pour l’analyse. ». The « Précisions » section follows in every case.

- [ ] **Step 1: Write the failing tests**

`src/renderer/features/meetings/meeting-format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { meetingFixture } from '../../test-api';
import { meetingMarkdown, noteSources, notesMarkdown } from './meeting-format';

const ids = ['1-0', '0-0', '0-1', 'clarification:c1', 'inconnu'];
const meeting = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z', {
  status: 'ready',
  transcript: [
    { id: '0-0', start: 4, end: 6, text: 'Bonjour.', speaker: 'A' },
    { id: '0-1', start: 4.6, end: 8, text: 'Salut.', speaker: 'B' },
    { id: '1-0', start: 61, end: 63, text: 'Le budget.', speaker: 'A' },
  ],
  clarifications: [{ id: 'c1', at: 90, text: 'Le budget 2027.', createdAt: '' }],
  notes: {
    summary: 'On valide le budget.',
    keyPoints: [{ text: 'Budget validé', sourceIds: ids }],
    decisions: [],
    actions: [],
    questions: [],
  },
});

describe('noteSources', () => {
  it('lists every playable source of a note, in order, once per second', () => {
    expect(noteSources(meeting, ids)).toEqual([
      { id: '1-0', at: 61 },
      { id: '0-0', at: 4 },
      { id: 'clarification:c1', at: 90 },
    ]);
  });
});

describe('notesMarkdown', () => {
  it('copies the notes and the clarifications without the transcript', () => {
    const notes = notesMarkdown(meeting);
    expect(notes).toBe(
      [
        '# Revue produit',
        'On valide le budget.',
        '## Points clés\n- Budget validé (01:01, 00:04, 01:30)',
        '## Décisions',
        '## Actions',
        '## À clarifier',
        '## Précisions\n- [01:30] Le budget 2027.',
      ].join('\n\n'),
    );
    expect(meetingMarkdown(meeting)).toBe(
      `${notes}\n\n## Transcription\n\n[00:04] Intervenant A · extrait 1 : Bonjour.\n\n[00:04] Intervenant B · extrait 1 : Salut.\n\n[01:01] Intervenant A · extrait 2 : Le budget.`,
    );
  });
});
```

`src/renderer/features/meetings/NotesView.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Meeting, NoteItem, Notes } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { NotesView } from './NotesView';

afterEach(cleanup);

const item = (text: string, sourceIds: string[] = []): NoteItem => ({ text, sourceIds });
const notes: Notes = {
  summary: 'On valide le budget.',
  keyPoints: [item('Budget validé', ['0-0', '1-0', '2-0', '3-0'])],
  decisions: [item('On garde le planning')],
  actions: [item('Envoyer le compte rendu')],
  questions: [item('Qui valide la suite ?')],
};
const analysed = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z', {
  status: 'ready',
  duration: 240,
  audioChunks: [{ index: 0, start: 0, duration: 240, transcript: [] }],
  transcript: [
    { id: '0-0', start: 4, end: 6, text: 'Bonjour.', speaker: 'A' },
    { id: '0-1', start: 4.6, end: 8, text: 'Salut.', speaker: 'B' },
    { id: '1-0', start: 61, end: 63, text: 'Le budget.', speaker: 'A' },
    { id: '2-0', start: 130, end: 133, text: 'Le planning.', speaker: 'B' },
    { id: '3-0', start: 185, end: 190, text: 'La suite.', speaker: 'A' },
  ],
  notes,
});

function renderNotes(meeting: Meeting, analyzing = false) {
  const props = {
    onAnalyze: vi.fn(),
    onSettings: vi.fn(),
    onTimestamp: vi.fn(),
    onClarify: vi.fn(async () => true),
  };
  render(<NotesView meeting={meeting} at={0} analyzing={analyzing} saving={false} {...props} />);
  return props;
}

it('reads the five sections in order, then the clarifications', () => {
  renderNotes(analysed);
  expect(
    screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
  ).toEqual(['Résumé', 'Points clés', 'Décisions', 'Actions', 'À clarifier', 'Précisions']);
  expect(screen.getByText('On valide le budget.')).toBeInTheDocument();
});

it('shows every timestamp of a note, not the first three', () => {
  renderNotes(analysed);
  expect(
    screen.getAllByRole('button', { name: /^Écouter à/ }).map((button) => button.textContent),
  ).toEqual(['0:04', '1:01', '2:10', '3:05']);
});

it('plays from a timestamp and hands its source over', async () => {
  const user = userEvent.setup();
  const { onTimestamp } = renderNotes(analysed);
  await user.click(screen.getByRole('button', { name: 'Écouter à 1:01' }));
  expect(onTimestamp).toHaveBeenCalledWith(61, '1-0');
});

it('shows one stamp for sources in the same second and none for unknown ones', () => {
  const welcome = { ...notes, keyPoints: [item('Accueil', ['0-0', '0-1', 'inconnu'])] };
  renderNotes({ ...analysed, notes: welcome });
  expect(screen.getAllByRole('button', { name: /^Écouter à/ })).toHaveLength(1);
});

it('lists the actions as plain bullets', () => {
  renderNotes(analysed);
  expect(screen.getByText('Envoyer le compte rendu').closest('li')).not.toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
});

it('refreshes the notes with the clarifications', async () => {
  const user = userEvent.setup();
  const { onAnalyze } = renderNotes(analysed);
  expect(screen.getByText('Inclut vos précisions enregistrées.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Actualiser les notes' }));
  expect(onAnalyze).toHaveBeenCalledOnce();
});

it('invites to analyse a recorded meeting', async () => {
  const user = userEvent.setup();
  const recorded = meetingFixture('m2', 'Point', '2026-10-14T08:00:00Z', {
    audioChunks: [{ index: 0, start: 0, duration: 60, transcript: null }],
  });
  const { onAnalyze, onSettings } = renderNotes(recorded);
  expect(screen.getByText('Prêt pour l’analyse.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Transcrire et créer le compte rendu' }));
  await user.click(screen.getByRole('button', { name: 'Configurer l’analyse' }));
  expect(onAnalyze).toHaveBeenCalledOnce();
  expect(onSettings).toHaveBeenCalledOnce();
});

it('explains why the analysis cannot start without audio', () => {
  renderNotes(meetingFixture('m2', 'Point', '2026-10-14T08:00:00Z'));
  const button = screen.getByRole('button', { name: 'Transcrire et créer le compte rendu' });
  expect(button).toBeDisabled();
  expect(button).toHaveAccessibleDescription('Aucun audio n’a été enregistré.');
});

it('shows no second message while the analysis runs', () => {
  renderNotes(
    meetingFixture('m2', 'Point', '2026-10-14T08:00:00Z', { status: 'processing' }),
    true,
  );
  expect(screen.queryByText('Prêt pour l’analyse.')).toBeNull();
  expect(screen.queryByText(/compte rendu se prépare/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Transcrire et créer le compte rendu' })).toBeNull();
});

it('leaves a failed analysis to the amber band', () => {
  renderNotes(
    meetingFixture('m2', 'Point', '2026-10-14T08:00:00Z', {
      status: 'error',
      error: 'Aucune parole détectée dans cet enregistrement.',
    }),
  );
  expect(screen.queryByText('Prêt pour l’analyse.')).toBeNull();
  expect(screen.getByRole('heading', { level: 2, name: 'Précisions' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/features/meetings/meeting-format.test.ts src/renderer/features/meetings/NotesView.test.tsx`
Expected: FAIL: `noteSources` and `notesMarkdown` are not exported, `NotesView` does not resolve.

- [ ] **Step 3: Implement**

`src/renderer/features/meetings/meeting-format.ts`: keep `speakerLabel` and `sourceTime`, then replace `formatSection` and `meetingMarkdown` (lines 19-50) by:

```ts
export interface NoteSource {
  id: string;
  at: number;
}

/** Playable sources of a note, in order; sources within the same second show one stamp. */
export function noteSources(meeting: Meeting, sourceIds: readonly string[]): NoteSource[] {
  const seconds = new Set<number>();
  const sources: NoteSource[] = [];
  for (const id of sourceIds) {
    const at = sourceTime(meeting, id);
    if (at === undefined || seconds.has(Math.floor(at))) continue;
    seconds.add(Math.floor(at));
    sources.push({ id, at });
  }
  return sources;
}

function formatSection(meeting: Meeting, title: string, items: NoteItem[]): string {
  const lines = items.map((item) => {
    const timestamps = noteSources(meeting, item.sourceIds).map((source) => timeLabel(source.at));
    return `- ${item.text} (${timestamps.join(', ')})`;
  });
  return [`## ${title}`, ...lines].join('\n');
}

/** What « Copier les notes » puts on the clipboard: everything but the transcript. */
export function notesMarkdown(meeting: Meeting): string {
  const sections = [`# ${meeting.title}`];
  if (meeting.notes) {
    const { summary, keyPoints, decisions, actions, questions } = meeting.notes;
    sections.push(summary);
    sections.push(formatSection(meeting, 'Points clés', keyPoints));
    sections.push(formatSection(meeting, 'Décisions', decisions));
    sections.push(formatSection(meeting, 'Actions', actions));
    sections.push(formatSection(meeting, 'À clarifier', questions));
  }
  const corrections = meeting.clarifications.map(
    (item) => `- [${timeLabel(item.at)}] ${item.text}`,
  );
  sections.push(['## Précisions', ...corrections].join('\n'));
  return sections.join('\n\n');
}

export function meetingMarkdown(meeting: Meeting): string {
  const transcript = meeting.transcript.map((item) => {
    const speaker = speakerLabel(item);
    return `[${timeLabel(item.start)}] ${speaker ? `${speaker} : ` : ''}${item.text}`;
  });
  return [notesMarkdown(meeting), ['## Transcription', ...transcript].join('\n\n')].join('\n\n');
}
```

`src/renderer/features/meetings/NoteSection.tsx` (whole file):

```tsx
import type { Meeting, NoteItem } from '../../../shared/contracts';
import type { TimestampHandler } from './Clarifications';
import { shortTimeLabel } from './detail-format';
import { noteSources } from './meeting-format';

interface NoteSectionProps {
  title: string;
  items: NoteItem[];
  meeting: Meeting;
  onTimestamp: TimestampHandler;
}

export function NoteSection({ title, items, meeting, onTimestamp }: NoteSectionProps) {
  if (!items.length) return null;

  return (
    <section className="note-section">
      <h2>{title}</h2>
      <ul className="note-list">
        {items.map((item, index) => (
          <li key={index}>
            <span className="note-text">{item.text}</span>
            {noteSources(meeting, item.sourceIds).map((source) => (
              <button
                key={source.id}
                type="button"
                className="timestamp-link"
                aria-label={`Écouter à ${shortTimeLabel(source.at)}`}
                onClick={() => onTimestamp(source.at, source.id)}
              >
                {shortTimeLabel(source.at)}
              </button>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`src/renderer/features/meetings/AnalysisPrompt.tsx`:

```tsx
import { Sparkles } from 'lucide-react';
import { Button, EmptyState } from '../../components/ui';

interface AnalysisPromptProps {
  canAnalyze: boolean;
  onAnalyze(): void;
  onSettings(): void;
}

const NO_AUDIO_ID = 'analysis-no-audio';

export function AnalysisPrompt({ canAnalyze, onAnalyze, onSettings }: AnalysisPromptProps) {
  return (
    <EmptyState title="Prêt pour l’analyse.">
      <Button
        disabled={!canAnalyze}
        aria-describedby={canAnalyze ? undefined : NO_AUDIO_ID}
        onClick={onAnalyze}
      >
        <Sparkles size={16} aria-hidden="true" />
        Transcrire et créer le compte rendu
      </Button>
      {!canAnalyze && (
        <p id={NO_AUDIO_ID} className="caption">
          Aucun audio n’a été enregistré.
        </p>
      )}
      <button type="button" className="text-link" onClick={onSettings}>
        Configurer l’analyse
      </button>
      <p className="caption">
        Les données envoyées et le coût éventuel dépendent des fournisseurs choisis dans les
        paramètres.
      </p>
    </EmptyState>
  );
}
```

`src/renderer/features/meetings/NotesView.tsx`:

```tsx
import type { Meeting } from '../../../shared/contracts';
import { Button } from '../../components/ui';
import { AnalysisPrompt } from './AnalysisPrompt';
import { Clarifications, type TimestampHandler } from './Clarifications';
import { NoteSection } from './NoteSection';

interface NotesViewProps {
  meeting: Meeting;
  at: number;
  analyzing: boolean;
  saving: boolean;
  onAnalyze(): void;
  onSettings(): void;
  onTimestamp: TimestampHandler;
  onClarify(at: number, text: string): Promise<boolean>;
}

// Static: skeletons never animate. The classes come from the list pane sheet.
function NotesSkeleton() {
  return (
    <div className="notes-skeleton" aria-hidden="true">
      <span className="skeleton-line" />
      <span className="skeleton-line" />
      <span className="skeleton-line skeleton-line-short" />
    </div>
  );
}

function NotesBody({ meeting, analyzing, onAnalyze, onSettings, onTimestamp }: NotesViewProps) {
  const notes = meeting.notes;
  if (!notes) {
    if (analyzing) return <NotesSkeleton />;
    // A failed analysis speaks through the amber band above the tabs.
    if (meeting.status === 'error') return null;
    return (
      <AnalysisPrompt
        canAnalyze={meeting.audioChunks.length > 0}
        onAnalyze={onAnalyze}
        onSettings={onSettings}
      />
    );
  }
  const summary = notes.summary.trim();
  const section = { meeting, onTimestamp };
  return (
    <>
      {summary && (
        <section className="note-section">
          <h2>Résumé</h2>
          <p className="note-summary">{summary}</p>
        </section>
      )}
      <NoteSection title="Points clés" items={notes.keyPoints} {...section} />
      <NoteSection title="Décisions" items={notes.decisions} {...section} />
      <NoteSection title="Actions" items={notes.actions} {...section} />
      <NoteSection title="À clarifier" items={notes.questions} {...section} />
      <div className="notes-refresh">
        <Button variant="secondary" busy={analyzing} onClick={onAnalyze}>
          Actualiser les notes
        </Button>
        <span className="caption">Inclut vos précisions enregistrées.</span>
      </div>
    </>
  );
}

export function NotesView(props: NotesViewProps) {
  return (
    <div className="notes-view">
      <NotesBody {...props} />
      <Clarifications
        meeting={props.meeting}
        at={props.at}
        disabled={props.analyzing}
        saving={props.saving}
        onTimestamp={props.onTimestamp}
        onSubmit={props.onClarify}
      />
    </div>
  );
}
```

`src/renderer/features/meetings/MeetingNotes.tsx` keeps compiling until Task 11 deletes it: in its four `<NoteSection … onSeek={onSeek} />` elements (lines 55-58) replace `onSeek={onSeek}` by `onTimestamp={(at) => onSeek(at)}`.

`src/renderer/styles.css`: in the token block, after `--space-5: 24px;`, add `--space-6: 32px;`.

`src/renderer/styles/meeting-notes.css`, append:

```css
.notes-view {
  display: grid;
  gap: var(--space-6);
}
.note-summary {
  margin: 0;
  line-height: 1.6;
}
.notes-refresh {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
.notes-skeleton {
  display: grid;
  gap: var(--space-3);
}
```

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer
npm run check
```

Expected: PASS, `Transcript.test.tsx` included (its export line is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings/meeting-format.ts src/renderer/features/meetings/meeting-format.test.ts src/renderer/features/meetings/NoteSection.tsx src/renderer/features/meetings/AnalysisPrompt.tsx src/renderer/features/meetings/NotesView.tsx src/renderer/features/meetings/NotesView.test.tsx src/renderer/features/meetings/MeetingNotes.tsx src/renderer/styles.css src/renderer/styles/meeting-notes.css
git commit -m "feat: notes in five sections with every timestamp"
```

---

### Task 10: Player bar and action pill

**Files:**

- Create: `src/renderer/features/meetings/PlaybackBar.tsx`, `PlaybackBar.test.tsx`
- Create: `src/renderer/features/meetings/use-copy-notes.ts`, `MeetingActions.tsx`, `MeetingActions.test.tsx`
- Create: `src/renderer/styles/playback-bar.css`
- Modify: `src/renderer/main.tsx` (import the sheet after `./styles/meeting-notes.css`)
- Modify: `src/main/capture-permissions.ts:12`, `src/main/capture-permissions.test.ts`

**Interfaces:**

- Consumes: `Playback`, `MediaElementProps` (Task 5); `notesMarkdown` (Task 9); `downloadMeeting(meeting)` (`download-meeting.ts:4`).
- Produces: `PlaybackBar` props `{ playback: Playback; hasVideo: boolean }` (renders the `<audio>` element unless the meeting has a video); `useCopyNotes(meeting: Meeting): { state: 'idle' | 'done' | 'failed'; message: string; copy(): Promise<void> }`; `MeetingActions` props `{ meeting: Meeting; busy: boolean; onDelete(): void }`.

The progress bar is a native range input laid transparent over a static fill (`transform: scaleX`, no transition): it is clickable, keyboard driven and named « Position de lecture » with « 04:12 sur 52:10 » as its value text. The pill holds three round ghost buttons with an `aria-label` and the same native `title` as tooltip.

« Copier les notes » uses `navigator.clipboard.writeText`. Electron asks the session permission check handler for `clipboard-sanitized-write`, and `capture-permissions.ts:12-14,54-57` refuses every permission outside `media`, `display-capture` and `fullscreen`: the copy would always fail in the app. The task allows that one permission, for the app window only.

- [ ] **Step 1: Write the failing tests**

`src/renderer/features/meetings/PlaybackBar.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlaybackBar } from './PlaybackBar';
import type { MediaElementProps, Playback } from './use-media-playback';

afterEach(cleanup);

function playbackOf(extra: Partial<Playback> = {}): Playback {
  const mediaProps: MediaElementProps = {
    ref: vi.fn(),
    src: 'meeting-media://local/m1/audio/0',
    preload: 'metadata',
    onLoadedMetadata: vi.fn(),
    onTimeUpdate: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onEnded: vi.fn(),
    onError: vi.fn(),
  };
  return {
    available: true,
    playing: false,
    failed: false,
    at: 252,
    duration: 3130,
    mediaProps,
    toggle: vi.fn(),
    seek: vi.fn(),
    playAt: vi.fn(),
    ...extra,
  };
}

const slider = () => screen.getByRole('slider', { name: 'Position de lecture' });

it('shows the position and the duration of the whole meeting', () => {
  render(<PlaybackBar playback={playbackOf()} hasVideo={false} />);
  expect(screen.getByText('04:12')).toBeInTheDocument();
  expect(screen.getByText('52:10')).toBeInTheDocument();
  expect(slider()).toHaveAttribute('aria-valuetext', '04:12 sur 52:10');
});

it('plays and pauses', async () => {
  const user = userEvent.setup();
  const playback = playbackOf();
  const { rerender } = render(<PlaybackBar playback={playback} hasVideo={false} />);
  await user.click(screen.getByRole('button', { name: 'Lire' }));
  expect(playback.toggle).toHaveBeenCalledOnce();
  rerender(<PlaybackBar playback={{ ...playback, playing: true }} hasVideo={false} />);
  expect(screen.getByRole('button', { name: 'Mettre en pause' })).toHaveAttribute(
    'title',
    'Mettre en pause',
  );
});

it('seeks from the progress bar', () => {
  const playback = playbackOf();
  render(<PlaybackBar playback={playback} hasVideo={false} />);
  fireEvent.change(slider(), { target: { value: '600' } });
  expect(playback.seek).toHaveBeenCalledWith(600);
});

it('says when a passage cannot be read', () => {
  render(<PlaybackBar playback={playbackOf({ failed: true })} hasVideo={false} />);
  expect(screen.getByText('Ce passage ne peut pas être lu.')).toBeInTheDocument();
});

it('cannot play without audio', () => {
  render(<PlaybackBar playback={playbackOf({ available: false })} hasVideo={false} />);
  expect(screen.getByRole('button', { name: 'Lire' })).toBeDisabled();
  expect(slider()).toBeDisabled();
});

it('leaves the element to the video block when there is a video', () => {
  const { rerender } = render(<PlaybackBar playback={playbackOf()} hasVideo={false} />);
  expect(document.querySelector('audio')).toHaveAttribute(
    'src',
    'meeting-media://local/m1/audio/0',
  );
  rerender(<PlaybackBar playback={playbackOf()} hasVideo />);
  expect(document.querySelector('audio')).toBeNull();
});
```

`src/renderer/features/meetings/MeetingActions.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { meetingFixture } from '../../test-api';
import { downloadMeeting } from './download-meeting';
import { MeetingActions } from './MeetingActions';
import { notesMarkdown } from './meeting-format';

vi.mock('./download-meeting', () => ({ downloadMeeting: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const analysed = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z', {
  status: 'ready',
  transcript: [{ id: '0-0', start: 4, end: 6, text: 'Bonjour.', speaker: 'A' }],
  notes: {
    summary: 'On valide le budget.',
    keyPoints: [],
    decisions: [],
    actions: [],
    questions: [],
  },
});

it('names every action and gives it a tooltip', () => {
  render(<MeetingActions meeting={analysed} busy={false} onDelete={vi.fn()} />);
  const pill = screen.getByRole('group', { name: 'Actions de la réunion' });
  for (const name of ['Copier les notes', 'Exporter', 'Supprimer la réunion']) {
    expect(within(pill).getByRole('button', { name })).toHaveAttribute('title', name);
  }
});

it('copies the notes, not the transcript', async () => {
  const user = userEvent.setup();
  render(<MeetingActions meeting={analysed} busy={false} onDelete={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Copier les notes' }));
  const copied = await navigator.clipboard.readText();
  expect(copied).toBe(notesMarkdown(analysed));
  expect(copied).not.toContain('## Transcription');
  expect(await screen.findByText('Notes copiées.')).toBeInTheDocument();
});

it('says when the copy fails', async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('refusé'));
  render(<MeetingActions meeting={analysed} busy={false} onDelete={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Copier les notes' }));
  expect(await screen.findByText('La copie a échoué. Réessayez.')).toBeInTheDocument();
});

it('exports the whole meeting', async () => {
  const user = userEvent.setup();
  render(<MeetingActions meeting={analysed} busy={false} onDelete={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Exporter' }));
  expect(downloadMeeting).toHaveBeenCalledWith(analysed);
});

it('asks before deleting, and not during an analysis', async () => {
  const user = userEvent.setup();
  const onDelete = vi.fn();
  const { rerender } = render(
    <MeetingActions meeting={analysed} busy={false} onDelete={onDelete} />,
  );
  await user.click(screen.getByRole('button', { name: 'Supprimer la réunion' }));
  expect(onDelete).toHaveBeenCalledOnce();
  rerender(<MeetingActions meeting={analysed} busy onDelete={onDelete} />);
  expect(screen.getByRole('button', { name: 'Supprimer la réunion' })).toBeDisabled();
});

it('has nothing to copy or export before the analysis', () => {
  render(
    <MeetingActions
      meeting={meetingFixture('m2', 'Point', '2026-10-14T08:00:00Z')}
      busy={false}
      onDelete={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Copier les notes' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Exporter' })).toBeDisabled();
});
```

In `src/main/capture-permissions.test.ts`, append:

```ts
it('lets the app window write the notes to the clipboard, never read it', () => {
  const contents = { id: 1 };
  const window = { webContents: contents } as unknown as BrowserWindow;
  registerCapture(
    () => undefined,
    () => window,
  );

  const check = electron.setPermissionCheckHandler.mock.lastCall?.[0];
  expect(check(contents, 'clipboard-sanitized-write')).toBe(true);
  expect(check(contents, 'clipboard-read')).toBe(false);
  expect(check({ id: 2 }, 'clipboard-sanitized-write')).toBe(false);
});
```

(The `as unknown as BrowserWindow` follows the existing test at line 61 of that file; it builds a fake window, it silences no check.)

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/features/meetings/PlaybackBar.test.tsx src/renderer/features/meetings/MeetingActions.test.tsx src/main/capture-permissions.test.ts`
Expected: FAIL: the two components do not resolve; `clipboard-sanitized-write` is refused.

- [ ] **Step 3: Implement**

`src/renderer/features/meetings/PlaybackBar.tsx`:

```tsx
import { Pause, Play } from 'lucide-react';
import { timeLabel } from '../../../shared/format';
import { Button } from '../../components/ui';
import type { Playback } from './use-media-playback';

interface PlaybackBarProps {
  playback: Playback;
  /** The video block holds the element; the bar only drives it. */
  hasVideo: boolean;
}

export function PlaybackBar({ playback, hasVideo }: PlaybackBarProps) {
  const { at, duration, playing, available, failed } = playback;
  const ratio = duration > 0 ? Math.min(1, at / duration) : 0;
  const label = playing ? 'Mettre en pause' : 'Lire';

  return (
    <div className="playback">
      {!hasVideo && <audio {...playback.mediaProps} />}
      <Button
        variant="ghost"
        shape="round"
        aria-label={label}
        title={label}
        disabled={!available}
        onClick={playback.toggle}
      >
        {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </Button>
      <span className="playback-time">{timeLabel(at)}</span>
      <span className="playback-progress">
        <span
          className="playback-progress-fill"
          style={{ transform: `scaleX(${ratio})` }}
          aria-hidden="true"
        />
        <input
          type="range"
          className="playback-progress-input"
          aria-label="Position de lecture"
          aria-valuetext={`${timeLabel(at)} sur ${timeLabel(duration)}`}
          min={0}
          max={duration}
          step={1}
          value={Math.min(at, duration)}
          disabled={!available}
          onChange={(event) => playback.seek(Number(event.target.value))}
        />
      </span>
      <span className="playback-time">{timeLabel(duration)}</span>
      <p className="playback-error" role="status">
        {failed ? 'Ce passage ne peut pas être lu.' : ''}
      </p>
    </div>
  );
}
```

`src/renderer/features/meetings/use-copy-notes.ts`:

```ts
import { useEffect, useState } from 'react';
import type { Meeting } from '../../../shared/contracts';
import { notesMarkdown } from './meeting-format';

type CopyState = 'idle' | 'done' | 'failed';

const messages: Record<CopyState, string> = {
  idle: '',
  done: 'Notes copiées.',
  failed: 'La copie a échoué. Réessayez.',
};

export function useCopyNotes(meeting: Meeting) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state !== 'done') return;
    const timer = setTimeout(() => setState('idle'), 2_000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(notesMarkdown(meeting));
      setState('done');
    } catch {
      setState('failed');
    }
  }

  return { state, message: messages[state], copy };
}
```

`src/renderer/features/meetings/MeetingActions.tsx`:

```tsx
import { Copy, Download, Trash2 } from 'lucide-react';
import type { Meeting } from '../../../shared/contracts';
import { Button } from '../../components/ui';
import { downloadMeeting } from './download-meeting';
import { useCopyNotes } from './use-copy-notes';

interface MeetingActionsProps {
  meeting: Meeting;
  /** An analysis runs: the backend refuses the deletion (meeting-rules.ts:15-19). */
  busy: boolean;
  onDelete(): void;
}

export function MeetingActions({ meeting, busy, onDelete }: MeetingActionsProps) {
  const copy = useCopyNotes(meeting);
  const hasNotes = meeting.notes !== null || meeting.clarifications.length > 0;

  return (
    <div className="meeting-actions">
      <span className="action-feedback" role="status">
        {copy.message}
      </span>
      <div className="action-pill" role="group" aria-label="Actions de la réunion">
        <Button
          variant="ghost"
          shape="round"
          aria-label="Copier les notes"
          title="Copier les notes"
          disabled={!hasNotes}
          onClick={() => void copy.copy()}
        >
          <Copy size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          shape="round"
          aria-label="Exporter"
          title="Exporter"
          disabled={!meeting.transcript.length}
          onClick={() => downloadMeeting(meeting)}
        >
          <Download size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          shape="round"
          aria-label="Supprimer la réunion"
          title="Supprimer la réunion"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
```

`src/main/capture-permissions.ts:12`:

```ts
// Writing the notes to the clipboard needs its own permission; reading it stays refused.
const allowedPermissions = new Set([
  'media',
  'display-capture',
  'fullscreen',
  'clipboard-sanitized-write',
]);
```

`src/renderer/styles/playback-bar.css`:

```css
.playback-bar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  height: 56px;
  padding: 0 var(--space-4);
  border-top: 1px solid var(--color-border);
  background: var(--color-pane);
}
.playback {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}
.playback-time {
  color: var(--color-text-subtle);
  font-size: var(--text-caption);
  font-variant-numeric: tabular-nums;
}
.playback-progress {
  position: relative;
  flex: 1;
  min-width: 80px;
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-raised);
}
.playback-progress-fill {
  position: absolute;
  inset: 0;
  border-radius: var(--radius-pill);
  background: var(--color-accent);
  transform-origin: left;
}
.playback-progress-input {
  position: absolute;
  inset: -10px 0;
  width: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.playback-progress-input:disabled {
  cursor: not-allowed;
}
.playback-progress:has(:focus-visible) {
  outline: 2px solid var(--color-focus);
  outline-offset: 4px;
}
.playback-error {
  margin: 0;
  color: var(--color-paused);
  font-size: var(--text-caption);
}
.meeting-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.action-feedback {
  color: var(--color-text-subtle);
  font-size: var(--text-caption);
}
.action-pill {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
}
.action-pill .button-round {
  width: 32px;
  min-height: 32px;
}
```

`src/renderer/main.tsx`: add `import './styles/playback-bar.css';` after `import './styles/meeting-notes.css';`.

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer src/main/capture-permissions.test.ts
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings/PlaybackBar.tsx src/renderer/features/meetings/PlaybackBar.test.tsx src/renderer/features/meetings/use-copy-notes.ts src/renderer/features/meetings/MeetingActions.tsx src/renderer/features/meetings/MeetingActions.test.tsx src/renderer/styles/playback-bar.css src/renderer/main.tsx src/main/capture-permissions.ts src/main/capture-permissions.test.ts
git commit -m "feat: player bar and action pill for the meeting footer"
```

---

### Task 11: The detail assembled

**Files:**

- Modify (rewrite): `src/renderer/features/meetings/MeetingHeader.tsx`, `MeetingHeader.test.tsx`
- Modify (rewrite): `src/renderer/features/meetings/MeetingContent.tsx`, `MeetingDetail.tsx`, `MeetingDetail.test.tsx`
- Create: `src/renderer/features/meetings/MeetingDetail.playback.test.tsx`
- Modify: `src/renderer/features/meetings/Transcript.tsx:24` (the tab is now « Notes »)
- Modify: `src/renderer/WorkspaceContent.tsx`, `src/renderer/App.tsx:94-97`
- Delete: `src/renderer/features/meetings/MeetingNotes.tsx`, `MeetingContext.tsx`, `MediaPlayer.tsx`, `AnalysisProgress.tsx`, `AnalysisProgress.test.tsx`

**Interfaces:**

- Consumes: everything above.
- Produces: `MeetingHeader` props `{ meeting: Meeting; folders: Folder[]; analyzing: boolean; onMove(folderId: string | null): void; onCreateFolder(name: string): Promise<Folder | null> }`; `MeetingContent` props `{ header: ReactNode; notes: ReactNode; transcript: ReactNode }`; `MeetingDetail` props `{ meeting: Meeting; api: DesktopApi; folders: Folder[]; onUpdate(meeting: Meeting): void; onMove(meetingId: string, folderId: string | null): Promise<boolean>; onCreateFolder(name: string): Promise<Folder | null>; onDeleted(): void; onSettings(): void }`; `WorkspaceContent` gains `onCreateFolder(name: string): Promise<Folder | null>`.

Structure of the card: `.meeting-detail` holds the `AnalysisLine` (absolute, against `.main-card`), the one scroll container (`MeetingContent`: header, notices, video, anchor, sticky tab bar, two panels of which only the active one has content) and the `<footer className="playback-bar">` with `PlaybackBar` and `MeetingActions`. The tab state lives in `MeetingContent` for now; lot 6 lifts it to `MeetingDetail` when a timestamp has to switch tabs.

- [ ] **Step 1: Write the failing tests**

`src/renderer/features/meetings/MeetingHeader.test.tsx` (whole file):

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Meeting } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { MeetingHeader } from './MeetingHeader';

afterEach(cleanup);

const folders = [
  { id: 'f1', name: 'Acme', createdAt: '' },
  { id: 'f2', name: 'Interne', createdAt: '' },
];

function renderHeader(meeting: Meeting, analyzing = false) {
  const onMove = vi.fn();
  render(
    <MeetingHeader
      meeting={meeting}
      folders={folders}
      analyzing={analyzing}
      onMove={onMove}
      onCreateFolder={vi.fn(async () => null)}
    />,
  );
  return { onMove, select: screen.getByRole('combobox', { name: 'Dossier de la réunion' }) };
}

it('files the meeting from the header', async () => {
  const user = userEvent.setup();
  const { onMove, select } = renderHeader(meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z'));
  expect(select).toHaveDisplayValue('Sans dossier');
  await user.selectOptions(select, 'Acme');
  expect(onMove).toHaveBeenLastCalledWith('f1');
});

it('takes the meeting out of its folder', async () => {
  const user = userEvent.setup();
  const meeting = meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', { folderId: 'f1' });
  const { onMove, select } = renderHeader(meeting);
  expect(select).toHaveDisplayValue('Acme');
  await user.selectOptions(select, 'Sans dossier');
  expect(onMove).toHaveBeenLastCalledWith(null);
});

it.each(['processing', 'recording'] as const)('keeps the folder while %s', (status) => {
  const { select } = renderHeader(
    meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', { status }),
  );
  expect(select).toBeDisabled();
});

it('opens a meeting whose date is unreadable', () => {
  renderHeader(meetingFixture('m1', 'Revue', 'nope'));
  expect(screen.getByRole('heading', { level: 1, name: 'Revue' })).toBeInTheDocument();
  expect(screen.getByText('Date inconnue')).toBeInTheDocument();
});

it('reads in one line: folder, date, duration and status', () => {
  renderHeader(meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', { duration: 3130 }));
  expect(screen.getByText('Ajouter à un dossier…')).toBeInTheDocument();
  expect(screen.getByText('14 oct. 2026')).toBeInTheDocument();
  expect(screen.getByText('52 min')).toBeInTheDocument();
  expect(screen.getByText('À analyser')).toBeInTheDocument();
});

it('shows the analysis progress in place of the status', () => {
  const meeting = meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', {
    status: 'processing',
    audioChunks: Array.from({ length: 12 }, (_, index) => ({
      index,
      start: index * 60,
      duration: 60,
      transcript: index < 3 ? [] : null,
    })),
  });
  renderHeader(meeting, true);
  expect(screen.getByRole('status')).toHaveTextContent('Analyse en cours · 3 segments sur 12');
  expect(screen.queryByText('Analyse en cours')).toBeNull();
});

it('has no summary sentence under the title', () => {
  renderHeader(
    meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', {
      status: 'ready',
      notes: {
        summary: 'On valide le budget.',
        keyPoints: [],
        decisions: [],
        actions: [],
        questions: [],
      },
    }),
  );
  expect(screen.queryByText('On valide le budget.')).toBeNull();
});
```

`src/renderer/features/meetings/MeetingDetail.test.tsx` (whole file):

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AudioChunk, DesktopApi, Meeting } from '../../../shared/contracts';
import { apiFor, meetingFixture, ok, settings } from '../../test-api';
import { MeetingDetail } from './MeetingDetail';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const chunk = (index: number, start: number, done = false): AudioChunk => ({
  index,
  start,
  duration: 60,
  transcript: done ? [] : null,
});
const meeting = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z');
const analysed = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z', {
  status: 'ready',
  duration: 120,
  audioChunks: [chunk(0, 0, true), chunk(1, 60, true)],
  transcript: [{ id: '1-0', start: 61, end: 63, text: 'Le budget.', speaker: 'A' }],
  notes: {
    summary: 'On valide le budget.',
    keyPoints: [{ text: 'Budget validé', sourceIds: ['1-0'] }],
    decisions: [],
    actions: [],
    questions: [],
  },
});

function detail(shown: Meeting, api: DesktopApi = apiFor([shown]), onDeleted = vi.fn()) {
  return (
    <MeetingDetail
      meeting={shown}
      api={api}
      folders={[]}
      onUpdate={vi.fn()}
      onMove={vi.fn(async () => true)}
      onCreateFolder={vi.fn(async () => null)}
      onDeleted={onDeleted}
      onSettings={vi.fn()}
    />
  );
}

const refreshed = (shown: Meeting): Meeting => ({
  ...shown,
  transcript: [...shown.transcript],
  audioChunks: shown.audioChunks.map((item) => ({ ...item })),
});

function processing(done: number): Meeting {
  return meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z', {
    status: 'processing',
    audioChunks: Array.from({ length: 12 }, (_, index) => chunk(index, index * 60, index < done)),
  });
}

it('opens without a way back: the list is the navigation', () => {
  render(detail(meeting));
  expect(screen.getByRole('heading', { level: 1, name: 'Revue produit' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Toutes les réunions' })).toBeNull();
});

it('hands the deletion over once the meeting is gone', async () => {
  const user = userEvent.setup();
  const onDeleted = vi.fn();
  render(detail(meeting, apiFor([meeting]), onDeleted));
  await user.click(screen.getByRole('button', { name: 'Supprimer la réunion' }));
  await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
  expect(onDeleted).toHaveBeenCalledOnce();
});

it('opens on the notes, with the transcript one arrow away', async () => {
  const user = userEvent.setup();
  render(detail(analysed));
  expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel', { name: 'Notes' })).toBeVisible();
  screen.getByRole('tab', { name: 'Notes' }).focus();
  await user.keyboard('{ArrowRight}');
  const panel = screen.getByRole('tabpanel', { name: 'Transcription' });
  expect(within(panel).getByRole('button', { name: /Le budget/ })).toBeInTheDocument();
  expect(screen.queryByRole('tabpanel', { name: 'Notes' })).toBeNull();
});

it('plays a note from its timestamp, in the extract that holds it', async () => {
  const user = userEvent.setup();
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  render(detail(analysed));
  await user.click(screen.getByRole('button', { name: 'Écouter à 1:01' }));
  const audio = document.querySelector('audio');
  if (!audio) throw new Error('no audio element');
  expect(audio).toHaveAttribute('src', 'meeting-media://local/m1/audio/1');
  fireEvent.loadedMetadata(audio);
  expect(audio.currentTime).toBe(1);
  expect(play).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Mettre en pause' })).toBeInTheDocument();
});

it('offers to retry a failed analysis from the amber band', async () => {
  const user = userEvent.setup();
  const failed = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z', {
    status: 'error',
    error: 'Aucune parole détectée dans cet enregistrement.',
    audioChunks: [chunk(0, 0)],
  });
  const api = apiFor([failed]);
  api.getSettings = () => ok({ ...settings, hasOpenAiKey: true });
  const processMeeting = vi.fn(() => ok({ ...failed, status: 'ready' as const, error: null }));
  api.processMeeting = processMeeting;
  render(detail(failed, api));
  const band = screen.getByRole('alert');
  expect(band).toHaveTextContent('L’analyse n’a pas abouti.');
  expect(band).toHaveTextContent('Aucune parole détectée dans cet enregistrement.');
  expect(screen.queryByText('Prêt pour l’analyse.')).toBeNull();
  await user.click(within(band).getByRole('button', { name: 'Réessayer l’analyse' }));
  await vi.waitFor(() => expect(processMeeting).toHaveBeenCalledWith('m1'));
});

it('keeps the tab and the draft when the poll hands over the same meeting', async () => {
  const user = userEvent.setup();
  const { rerender } = render(detail(analysed));
  await user.click(screen.getByRole('button', { name: 'Ajouter une précision' }));
  await user.type(screen.getByRole('textbox', { name: 'Votre précision' }), 'Le budget 2027');
  rerender(detail(refreshed(analysed)));
  expect(screen.getByRole('textbox', { name: 'Votre précision' })).toHaveValue('Le budget 2027');
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  rerender(detail(refreshed(analysed)));
  expect(screen.getByRole('tab', { name: 'Transcription' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await user.click(screen.getByRole('tab', { name: 'Notes' }));
  expect(screen.getByRole('textbox', { name: 'Votre précision' })).toHaveValue('Le budget 2027');
});

it('follows the analysis as the poll brings new segments', () => {
  const { rerender } = render(detail(processing(3)));
  expect(screen.getByText('Analyse en cours · 3 segments sur 12')).toBeInTheDocument();
  expect(screen.queryByText('Prêt pour l’analyse.')).toBeNull();
  rerender(detail(processing(4)));
  expect(screen.getByText('Analyse en cours · 4 segments sur 12')).toBeInTheDocument();
  expect(screen.queryByText('Prêt pour l’analyse.')).toBeNull();
  rerender(detail(analysed));
  expect(screen.queryByText(/Analyse en cours/)).toBeNull();
  expect(screen.getByRole('heading', { level: 2, name: 'Résumé' })).toBeInTheDocument();
});

it('shows the video at the top of the content, driven by the footer', () => {
  render(detail({ ...analysed, hasVideo: true }));
  expect(document.querySelector('video')).toHaveAttribute('src', 'meeting-media://local/m1/video');
  expect(document.querySelector('audio')).toBeNull();
  expect(screen.getByRole('button', { name: 'Lire' })).toBeEnabled();
});

it('has no context panel and no audio passage picker', () => {
  render(detail(analysed));
  expect(screen.queryByRole('heading', { name: 'Le contexte' })).toBeNull();
  expect(screen.queryByLabelText('Passage audio')).toBeNull();
});
```

The rerender of `processing(3)` → `processing(4)` keeps the detail mounted (same component, no key), exactly what the poll does in the app. Note that `MeetingDetail` re-creates `vi.fn()` props on each `detail()` call; the component must not depend on their identity (it does not).

`src/renderer/features/meetings/MeetingDetail.playback.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Meeting } from '../../../shared/contracts';
import { apiFor, meetingFixture } from '../../test-api';
import { WorkspaceContent } from '../../WorkspaceContent';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const withAudio = (id: string, title: string): Meeting =>
  meetingFixture(id, title, '2026-10-14T08:00:00Z', {
    duration: 60,
    audioChunks: [{ index: 0, start: 0, duration: 60, transcript: null }],
  });
const first = withAudio('m1', 'Revue produit');
const second = withAudio('m2', 'Point hebdo');

function workspace(selected: Meeting) {
  return (
    <WorkspaceContent
      api={apiFor([first, second])}
      card="meeting"
      selected={selected}
      loading={false}
      hasMeetings
      folders={[]}
      capture={null}
      stopping={false}
      onStop={vi.fn()}
      onUpdate={vi.fn()}
      onMove={vi.fn(async () => true)}
      onCreateFolder={vi.fn(async () => null)}
      onDeleted={vi.fn()}
      onSettings={vi.fn()}
      onShowOnboarding={vi.fn()}
    />
  );
}

function audio(): HTMLAudioElement {
  const element = document.querySelector('audio');
  if (!element) throw new Error('no audio element');
  return element;
}

it('stops the sound and opens the next meeting from the start', async () => {
  const user = userEvent.setup();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
  const { rerender } = render(workspace(first));
  fireEvent.loadedMetadata(audio());
  await user.click(screen.getByRole('button', { name: 'Lire' }));
  audio().currentTime = 30;
  fireEvent.timeUpdate(audio());
  expect(screen.getByRole('slider', { name: 'Position de lecture' })).toHaveAttribute(
    'aria-valuetext',
    '00:30 sur 01:00',
  );
  pause.mockClear();
  rerender(workspace(second));
  expect(pause).toHaveBeenCalled();
  expect(screen.getByRole('heading', { level: 1, name: 'Point hebdo' })).toBeInTheDocument();
  expect(audio()).toHaveAttribute('src', 'meeting-media://local/m2/audio/0');
  expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
  expect(screen.getByRole('slider', { name: 'Position de lecture' })).toHaveAttribute(
    'aria-valuetext',
    '00:00 sur 01:00',
  );
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/features/meetings/MeetingHeader.test.tsx src/renderer/features/meetings/MeetingDetail.test.tsx src/renderer/features/meetings/MeetingDetail.playback.test.tsx`
Expected: FAIL: the header has no « Ajouter à un dossier… », no `onCreateFolder`, no tab named « Notes », no « Écouter à 1:01 », no slider; `WorkspaceContent` rejects `onCreateFolder`.

- [ ] **Step 3: Implement**

`src/renderer/features/meetings/MeetingHeader.tsx` (whole file):

```tsx
import type { Folder, Meeting } from '../../../shared/contracts';
import { StatusBadge } from '../../components/ui';
import { AnalysisStatus } from './AnalysisStatus';
import { durationLabel, meetingDateLabel } from './detail-format';
import { FolderControl } from './FolderControl';

interface MeetingHeaderProps {
  meeting: Meeting;
  folders: Folder[];
  analyzing: boolean;
  onMove(folderId: string | null): void;
  onCreateFolder(name: string): Promise<Folder | null>;
}

/** Title, then one meta line. No summary: « Résumé » opens the notes. */
export function MeetingHeader(props: MeetingHeaderProps) {
  const { meeting, folders, analyzing, onMove, onCreateFolder } = props;
  return (
    <header className="detail-header">
      <h1>{meeting.title}</h1>
      <div className="detail-meta">
        <FolderControl
          meeting={meeting}
          folders={folders}
          onMove={onMove}
          onCreate={onCreateFolder}
        />
        <span>{meetingDateLabel(meeting.createdAt)}</span>
        <span>{durationLabel(meeting.duration)}</span>
        {analyzing ? <AnalysisStatus meeting={meeting} /> : <StatusBadge status={meeting.status} />}
      </div>
    </header>
  );
}
```

`src/renderer/features/meetings/MeetingContent.tsx` (whole file):

```tsx
import type { ReactNode } from 'react';
import { Segmented, tabId, type SegmentedOption } from '../../components/ui';
import { useTabScroll } from './use-tab-scroll';

type DetailTab = 'notes' | 'transcript';

const NOTES_PANEL = 'meeting-notes';
const TRANSCRIPT_PANEL = 'meeting-transcript';
const tabs: readonly SegmentedOption<DetailTab>[] = [
  { value: 'notes', label: 'Notes', panelId: NOTES_PANEL },
  { value: 'transcript', label: 'Transcription', panelId: TRANSCRIPT_PANEL },
];

interface MeetingContentProps {
  header: ReactNode;
  notes: ReactNode;
  transcript: ReactNode;
}

interface DetailPanelProps {
  id: string;
  active: boolean;
  children: ReactNode;
}

// Both panels exist for aria-controls; only the active one renders its content.
function DetailPanel({ id, active, children }: DetailPanelProps) {
  return (
    <div
      role="tabpanel"
      id={id}
      aria-labelledby={tabId(id)}
      hidden={!active}
      tabIndex={0}
      className="detail-panel"
    >
      {active && children}
    </div>
  );
}

/** The one scroll of the card: the header scrolls away, the tab bar sticks, each tab keeps its place. */
export function MeetingContent({ header, notes, transcript }: MeetingContentProps) {
  const { tab, select, scrollerRef, anchorRef } = useTabScroll<DetailTab>('notes');
  return (
    <div className="detail-scroll" ref={scrollerRef}>
      <div className="detail-column">
        {header}
        <div ref={anchorRef} />
        <div className="detail-tabs">
          <Segmented label="Contenu de la réunion" options={tabs} value={tab} onChange={select} />
        </div>
        <DetailPanel id={NOTES_PANEL} active={tab === 'notes'}>
          {notes}
        </DetailPanel>
        <DetailPanel id={TRANSCRIPT_PANEL} active={tab === 'transcript'}>
          {transcript}
        </DetailPanel>
      </div>
    </div>
  );
}
```

`src/renderer/features/meetings/MeetingDetail.tsx` (whole file):

```tsx
import { useState } from 'react';
import type { DesktopApi, Folder, Meeting } from '../../../shared/contracts';
import { AnalysisLine } from './AnalysisStatus';
import type { TimestampHandler } from './Clarifications';
import { DeleteMeetingDialog } from './DeleteMeetingDialog';
import { DetailNotices } from './DetailNotices';
import { detailNotices } from './detail-notices';
import { MeetingActions } from './MeetingActions';
import { MeetingContent } from './MeetingContent';
import { MeetingHeader } from './MeetingHeader';
import { NotesView } from './NotesView';
import { PlaybackBar } from './PlaybackBar';
import { Transcript } from './Transcript';
import { useMediaPlayback } from './use-media-playback';
import { useMeetingActions } from './use-meeting-actions';

interface MeetingDetailProps {
  meeting: Meeting;
  api: DesktopApi;
  folders: Folder[];
  onUpdate(meeting: Meeting): void;
  onMove(meetingId: string, folderId: string | null): Promise<boolean>;
  onCreateFolder(name: string): Promise<Folder | null>;
  onDeleted(): void;
  onSettings(): void;
}

export function MeetingDetail(props: MeetingDetailProps) {
  const { meeting, api, onUpdate, onDeleted } = props;
  const actions = useMeetingActions({ api, meeting, onUpdate, onDeleted });
  const playback = useMediaPlayback(meeting);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const analyze = () => void actions.analyze();
  // Lot 6 also switches to the transcript and highlights the source; lot 5 plays it.
  const playSource: TimestampHandler = (at) => playback.playAt(at);

  const header = (
    <>
      <MeetingHeader
        meeting={meeting}
        folders={props.folders}
        analyzing={actions.analyzing}
        onMove={(folderId) => void props.onMove(meeting.id, folderId)}
        onCreateFolder={props.onCreateFolder}
      />
      <DetailNotices
        notices={detailNotices(meeting, actions.error, actions.analyzing)}
        canRetry={meeting.audioChunks.length > 0}
        onRetry={analyze}
      />
      {meeting.hasVideo && <video className="detail-video" {...playback.mediaProps} />}
    </>
  );

  return (
    <div className="meeting-detail">
      {actions.analyzing && <AnalysisLine meeting={meeting} />}
      <MeetingContent
        header={header}
        notes={
          <NotesView
            meeting={meeting}
            at={playback.at}
            analyzing={actions.analyzing}
            saving={actions.saving}
            onAnalyze={analyze}
            onSettings={props.onSettings}
            onTimestamp={playSource}
            onClarify={actions.clarify}
          />
        }
        transcript={<Transcript meeting={meeting} at={playback.at} onSeek={playback.playAt} />}
      />
      <footer className="playback-bar">
        <PlaybackBar playback={playback} hasVideo={meeting.hasVideo} />
        <MeetingActions
          meeting={meeting}
          busy={actions.analyzing}
          onDelete={() => setConfirmDelete(true)}
        />
      </footer>
      {confirmDelete && (
        <DeleteMeetingDialog
          busy={actions.deleting}
          onClose={() => setConfirmDelete(false)}
          onDelete={actions.remove}
        />
      )}
    </div>
  );
}
```

`src/renderer/features/meetings/Transcript.tsx:24`: the empty copy becomes `'La transcription commence avec la génération du compte rendu, depuis l’onglet Notes.'` (the tab « Compte rendu » no longer exists).

`src/renderer/WorkspaceContent.tsx`: add `onCreateFolder(name: string): Promise<Folder | null>;` to `WorkspaceContentProps` after `onMove`, and `onCreateFolder={props.onCreateFolder}` to the `MeetingDetail` element after `onMove`.

`src/renderer/App.tsx`: in the `WorkspaceContent` element, after `onMove={folders.move}`, add `onCreateFolder={folders.create}`.

Delete the bridges and the replaced components:

```bash
git rm src/renderer/features/meetings/MeetingNotes.tsx src/renderer/features/meetings/MeetingContext.tsx src/renderer/features/meetings/MediaPlayer.tsx src/renderer/features/meetings/AnalysisProgress.tsx src/renderer/features/meetings/AnalysisProgress.test.tsx
```

Then `grep -rn "MeetingNotes\|MeetingContext\|MediaPlayer\|AnalysisProgress\|PlayerHandle" src/renderer` must print nothing.

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer
npm run check
```

Expected: PASS, the App tests included (they delete through « Supprimer la réunion » and file through the « Dossier de la réunion » combobox).

- [ ] **Step 5: Commit**

```bash
git add -A src/renderer/features/meetings src/renderer/WorkspaceContent.tsx src/renderer/App.tsx
git commit -m "feat: meeting detail as one reading column with a player bar"
```

---

### Task 12: One scroll, sticky tabs, fixed bar; dead CSS out

**Files:**

- Modify: `src/renderer/styles/meeting-detail.css` (layout), `src/renderer/styles.css` (token `--reading-width`, reduced motion), `src/renderer/styles/recording.css` (narrow layout), `src/renderer/styles/meetings.css`, `src/renderer/styles/shared.css`, `src/renderer/chrome.test.ts`

**Interfaces:** none new; class names from Tasks 6 to 11: `.meeting-detail`, `.detail-scroll`, `.detail-column`, `.detail-tabs`, `.detail-panel`, `.detail-video`, `.analysis-line`, `.analysis-line-bar`, `.playback-bar`.

`.page-content` (`AppShell.tsx:22`, `styles.css:329-338`) is the card's scroll container with a 1128 px page width and 72 px bottom padding. The detail needs its own scroll and a bar fixed under it, so the page content steps aside when it holds a detail (`:has`, already used at `styles.css:135`). `.meeting-detail` stays unpositioned so the analysis line positions against `.main-card` (`position: relative`, `styles.css:318`) and is clipped by its radius.

- [ ] **Step 1: Write the failing tests**

Append to `src/renderer/chrome.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/renderer/chrome.test.ts`
Expected: FAIL: no layout rules, `.transcript-turns` still has `max-height` and `overflow-y`, no `--reading-width`.

- [ ] **Step 3: Implement the layout**

`src/renderer/styles.css`: in the token block, after `--pane-list-width`, add `--reading-width: 680px;`. In `@media (prefers-reduced-motion: reduce)`, turn `.row-progress-bar {` into:

```css
.row-progress-bar,
.analysis-line-bar {
  transition: none;
}
```

Append to `src/renderer/styles/meeting-detail.css`:

```css
/* The detail owns its scroll and the fixed player bar: the shared page padding steps aside. */
.page-content:has(> .meeting-detail) {
  display: flex;
  overflow: hidden;
  padding: 0;
}
.page-content > .meeting-detail {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  min-height: 0;
}
/* Positioned so the tab anchor's offsetTop is measured from here. */
.detail-scroll {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 36px var(--space-6);
  scroll-padding-top: 56px;
}
.detail-column {
  max-width: var(--reading-width);
  margin-inline: auto;
}
.detail-tabs {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: var(--space-2) 0;
  background: var(--color-pane);
}
.detail-panel {
  padding-top: var(--space-5);
}
.detail-video {
  display: block;
  width: min(100%, calc(240px * 16 / 9));
  aspect-ratio: 16 / 9;
  margin-bottom: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  object-fit: contain;
}
.analysis-line {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  z-index: 2;
  height: 2px;
  overflow: hidden;
  pointer-events: none;
}
.analysis-line-bar {
  display: block;
  height: 100%;
  background: var(--color-accent);
  transform-origin: left;
  transition: transform var(--duration-base) var(--ease-out);
}
/* Above the player bar, never over it. */
.main-card:has(.playback-bar) .notice.notice-floating {
  bottom: calc(56px + var(--space-4));
}
```

`src/renderer/styles/recording.css`: in `@media (max-width: 800px)`, replace the `.detail-grid { grid-template-columns: 1fr; }` rule by

```css
.detail-scroll,
.playback-bar {
  padding-inline: 18px;
}
```

and in `@media (max-width: 640px)`, after the `.page-content` rule, add

```css
.detail-scroll,
.playback-bar {
  padding-inline: var(--space-3);
}
```

`src/renderer/styles/meetings.css`, `.transcript-turns`: delete `max-height`, `padding-right`, `overflow-y`, `overscroll-behavior` and the comment above the rule (the nested 62vh frame, replaced by the one scroll); keep `display`, `align-content`, `gap`.

- [ ] **Step 4: Delete the dead rules**

Before each deletion, `grep -rn "<class>" src/renderer --include='*.tsx'` must print nothing.

- `src/renderer/styles/meetings.css`: remove `.detail-page` from the first selector (keep `.settings-page`); delete the rules `.detail-heading`, `.detail-folder-select`, `.detail-grid`, `.notes-panel, .context-panel`, `.context-panel`, `.context-panel .panel-title h2`, `.context-panel .media-player`, `.tabs`, `.tabs button`, `.tabs button svg`, `.tabs button[aria-selected='true']`, the old `.note-section`, `.note-section ul`, `.note-section li`, `.notes-empty`, `.analysis-progress`, `.analysis-progress progress`, `.analysis-progress small`, `.notes-footer`, `.summary`, `.source-links`, `.timestamp-link, .source-links button`, `.timestamp-link:hover, .source-links button:hover`, `.clarifications`, `.clarifications h3`, `.clarification`, `.clarification .timestamp-link`, `.clarification p`, the old `.clarification-form` rules (`h3`, `h3 svg`, `> .caption`, `.field`, `input[type='number']`, `textarea`, `> .button`), `.panel-title`, `.media-player video, .media-player audio`, `.media-player video:fullscreen`. Keep `.text-link` (`AnalysisPrompt`), `.auto-analysis-option*` (`NewMeetingDialog`), the settings rules and every `.transcript*` rule.
- `src/renderer/styles/shared.css:1-4`: the first selector becomes `.settings-card {` alone.
- `src/renderer/styles.css`: `.timestamp-link` stays in the grouped colour transition (still used); no `.tabs button` left (Task 6).

- [ ] **Step 5: Run the tests and the project checks**

```bash
npx vitest run src/renderer
npm run check
```

Expected: PASS, including `design-tokens.test.ts` and `motion-guard.test.ts` on the three new sheets.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/styles.css src/renderer/styles src/renderer/chrome.test.ts
git commit -m "style: one scroll for the meeting, sticky tabs, fixed player bar; old detail rules removed"
```

---

### Task 13: Verification

- [ ] **Step 1: Leftovers**

```bash
grep -rnE "MeetingContext|MediaPlayer|MeetingNotes|AnalysisProgress|PlayerHandle|Passage audio|Le contexte|Moment \(secondes\)|Apporter une précision|Ajouter la précision|onglet Compte rendu|slice\(0, 3\)|context-panel|detail-grid|notes-panel|detail-heading|detail-folder-select|\.analysis-progress|\"analysis-progress\"|source-links|media-player" src/renderer
```

Expected: no output (the module `analysis-progress.ts` and its `./analysis-progress` imports do not match: the pattern only catches the old CSS class).

- [ ] **Step 2: Project checks**

Run: `npm run check`. Copy the summary lines into the report.

- [ ] **Step 3: Look at the real app**

`npm run dev` on macOS, over a light and a dark wallpaper, with reduced motion and reduced transparency on:

- one reading column; no « Le contexte » panel; the title then one meta line « Acme ⌄ · 12 oct. 2026 · 52 min · ● Notes prêtes »; no summary under the title;
- the folder chip opens the native menu; « Nouveau dossier… » turns into the field, Enter files the meeting;
- scrolling the notes: the header goes, the tab bar sticks; switching tabs returns each to its place; ← → and Home/End move between tabs;
- a meeting of several minutes: play, let an extract end (every 60 s): the sound continues, the button does not flicker, the position keeps counting; click a timestamp in a later extract: it plays from there; drag the progress bar across extracts;
- rename one audio file in Application Support to fake a missing extract: « Ce passage ne peut pas être lu. », then « Lire » continues after it;
- start an analysis: the 2 px line grows at the top of the card, « Analyse en cours · 3 segments sur 12 » in the meta line, nothing pushes the content; with reduced motion the line jumps;
- while another meeting is analysed, play this one: no restart every 2 s;
- select another meeting while playing: silence, the new one at 00:00;
- « Copier les notes » then paste in a text editor: notes and clarifications, no transcript; « Exporter » downloads the Markdown with the transcript; « Supprimer la réunion » asks first;
- a meeting with video: 16:9 block of 240 px high at the top, driven by the bar; a floating notice sits above the bar; zoom in twice (Cmd +): the bar and the column stay usable.

- [ ] **Step 4: Report**

Commits, check summary, deviations with file and line, anything not seen in the real app.
