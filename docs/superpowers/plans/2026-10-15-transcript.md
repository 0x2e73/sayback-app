# Transcript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the « Transcription » tab readable, selectable and searchable: a 48 px time column as the only seek trigger, selectable text, speaker colours, part separators, highlighted search with navigation, a playback follow that respects manual scrolling, note timestamps that open their passage, and turns that stay smooth on 1 000+ turns.

**Architecture:** Pure, Node-tested modules carry the decisions: `search-text.ts` (normalisation with aligned indices, shared with the list pane), `speaker-turns.ts` (turns, parts, continuations), `transcript-rows.ts` (separators, speaker tones, active turn by binary search, stable turns, passage turn), `transcript-search.ts` (matches, cap, navigation) and `follow-rules.ts` (gestures, visibility). The playback time leaves React state for a small external store (`playback-clock.ts`, `useSyncExternalStore`) read only by the transcript and the player bar. A `useDetailView` hook lifted into `MeetingDetail` owns the tabs, the search, the follow state and the note passage, so the transcript keeps them across a tab change; `Transcript` is rebuilt from memoised `TranscriptTurn`s on top of it.

**Tech Stack:** Electron 44, React 19, plain CSS with light and dark tokens, Vitest 4 (node and jsdom, Testing Library, user-event), TypeScript strict with `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `TZ=Europe/Zurich` (`vitest.config.ts:5`).

**Spec:** `docs/superpowers/specs/2026-10-13-main-window-redesign-design.md`, delivery step 6 (line 296 in `main` at 23f561c); sections « Transcript », « Tokens », « Components », « Tests ». Amended by `docs/superpowers/specs/2026-10-14-light-theme-and-motion-design.md`: light theme shipped (A2, A4 « Couleurs d'intervenants »), motion lot not shipped; this lot follows table B3, rows « Passage ciblé depuis une note » and « Tour actif, défilement auto », and nothing else of B.

## Global Constraints

- Read `AGENTS.md` and every file in `.codex/rules/` before changing code. Guard rails (`eslint.config.js:17-22`): 250 useful lines per file, tests included; 80 per function (tests exempt); cyclomatic complexity 12 (logical operators count); depth 3; no nested ternary; no component declared inside another; no cast, `!` or `eslint-disable` to silence a check.
- Renderer imports: no `node:*`, `electron`, `main/**` or backend infrastructure (`eslint.config.js:49-71`). Cross-feature imports inside `src/renderer/features` are allowed (`ListFooter.tsx:4` already does it).
- UI copy, exact, French, typographic apostrophe (`’`) everywhere: « Intervenant A », « Partie 2 · 10:00 », « Les intervenants sont identifiés séparément dans chaque partie. », « Lire à partir de 12:04 » (accessible name of the time column), « Chercher dans la transcription » (field name), « Chercher dans la transcription… » (placeholder), « 3 sur 12 », « 1 sur 500+ », « Aucun résultat », « Résultat précédent », « Résultat suivant », « Revenir au direct », « Retour aux notes », « La transcription arrive au fur et à mesure. », « Pas encore de transcription », « Transcrire et créer le compte rendu », « Aucun audio n’a été enregistré. ». The export writes « Intervenant A (partie 2) ».
- Formats: the time column and the part separators use `shortTimeLabel` (`detail-format.ts:22`, `0:31`, `12:04`), like the note timestamps; the export keeps `timeLabel` (`src/shared/format.ts`, `[10:01]`).
- Tokens added (Task 3), both themes where they are colours: `--color-speaker-1..4`, `--color-highlight`, `--color-highlight-strong`, `--duration-ambient` (1.6s), `--detail-tabs-height` (48px), `--transcript-bar-height` (56px), `--transcript-time-width` (48px), `--transcript-turn-estimate` (72px), `--speaker-dot` (6px). Speaker colours are never the accent nor a semantic colour. `design-tokens.test.ts`, `motion-guard.test.ts` and `chrome.test.ts` stay green.
- Motion, exactly: the active turn changes `background-color` on `--duration-fast` (already in the colour transition list, `styles.css:276-297`); the passage reached from a note plays `@keyframes turn-target` (accent tint held to 40 %, back to the active ground) on `--duration-ambient` `--ease-out`, kept under reduced motion (colour only); auto-scroll is instant, never `scroll-behavior: smooth`. The pills, the search and the turns arriving do not animate. No other motion token from B1.
- `following` starts true and turns false only on an explicit gesture (wheel, touch move, scroll keys, scrollbar pointer, moving to another search result), never on the `scroll` event. A time column click, a note timestamp and « Revenir au direct » turn it back on.
- No data model change, no new IPC channel, no new dependency. Out of scope: recording and dialogs, settings, onboarding, renaming speakers, the live panel, the global motion pass.
- `npm run check` green at the end of every task. Commits under `0x2e73`, conventional messages, no AI attribution. Branch: `redesign/transcript`, created from `main` by the executor before Task 1.

## Review Focus

1. **A transcript of 1 000+ turns while playing and polling.** A one-hour meeting with a diarised provider has about a thousand turns; the 2 s poll (`use-meetings.ts:56-58`) hands over new objects each time and the media element reports the time about four times a second. A tick inside a turn must re-render no turn, a turn change exactly two, a poll that brings equal segments none, and a poll that adds one segment one. Pinned in Task 5 (« finds the turn playing among 1 000 by binary search »), Task 8 (« leaves the components that do not read the clock alone while the time moves ») and Task 13 (`Transcript.performance.test.tsx`, four cases).
2. **Searching while the analysis poll brings text.** Chunks are transcribed three at a time (`meetings.ts:94-100`), so text arrives in the middle as well as at the end. The counter must grow (« 2 sur 2 » → « 2 sur 3 ») while the current match stays the same passage, with no jump, even when a match appears before it. Pinned in Task 6 (`keptMatch`) and Task 10 (« keeps the current match when a poll brings text before and after it »).
3. **Following the playback while the reader selects text.** The view must not move under a held pointer or a selection inside the transcript, so a copy stays possible during playback; once the selection is gone, the next turn is followed again, and « Revenir au direct » always moves. Pinned in Task 11 (« does not move while the reader selects text, then follows again », « does not move while the pointer is held in the transcript »).
4. **A note timestamp whose passage is in an extract that is not loaded.** Clicking « Écouter à 1:01 » while extract 0 is loaded must switch to « Transcription », mark and place the turn at once (before the next extract's metadata), play from 1:01 and offer « Retour aux notes » that restores the notes position; a clarification time with no turn must still switch and play, marking nothing. Pinned in Task 12 (`MeetingDetail.passage.test.tsx`, three cases).
5. **A transcript without diarisation, or with a single speaker.** Local whisper gives no speaker (`local-whisper.ts:44-53`): no label, no dot, no part separator, no sentence about parts. One diarised speaker keeps « Intervenant A » at the start of each part and the separators. Pinned in Task 5 (`transcriptRows` cases) and Task 10 (« shows neither label, dot nor part without any speaker », « labels a single speaker and still marks the parts »).

---

## File Structure

| File                                                                                                                                                                                                                                                                | Change                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/search-text.ts` (+ test)                                                                                                                                                                                                                              | New: `foldText`, `normalizeSearch`, `findMatches`, `FoldedText`, `TextRange`; character-by-character normalisation with aligned indices |
| `src/renderer/features/list/list-filter.ts`, `list-filter.test.ts`                                                                                                                                                                                                  | Uses `normalizeSearch` from `search-text.ts`; its 18 normalisation cases move to `search-text.test.ts`                                  |
| `src/renderer/features/meetings/speaker-turns.ts` (+ test)                                                                                                                                                                                                          | `Turn` gains `part`, `continuation`, `segmentIds`; `partOf`                                                                             |
| `src/renderer/features/meetings/meeting-format.ts` (+ test)                                                                                                                                                                                                         | `speakerName`; `speakerLabel` writes « Intervenant A (partie 2) »                                                                       |
| `src/renderer/styles.css`, `design-tokens-support.ts`, `design-tokens.test.ts`, `motion-guard.test.ts`                                                                                                                                                              | Speaker, highlight, size and ambient tokens; `turn-target` keyframes; `layerContrast`                                                   |
| `src/renderer/styles/transcript.css`, `speaker-label.css`, `follow-pill.css` (new), `meetings.css`, `meeting-detail.css`, `src/renderer/main.tsx`, `chrome.test.ts`                                                                                                 | Transcript layout moved out of `meetings.css`; scroll padding for the sticky bars; CSS guards                                           |
| `src/renderer/components/SpeakerLabel.tsx`, `FollowPill.tsx` (+ tests), `ui.tsx`                                                                                                                                                                                    | New shared components (reused later by the live panel)                                                                                  |
| `src/renderer/features/meetings/transcript-rows.ts` (+ test), `use-stable-turns.ts`                                                                                                                                                                                 | New: `transcriptRows`, `partStarts`, `activeTurnIndex`, `passageTurn`, `stableTurns`, `useStableTurns`                                  |
| `src/renderer/features/meetings/transcript-search.ts` (+ test), `use-transcript-search.ts`                                                                                                                                                                          | New: `searchTranscript`, `stepMatch`, `keptMatch`, `matchKey`, `counterLabel`, `useTranscriptSearch`                                    |
| `src/renderer/features/meetings/follow-rules.ts` (+ test)                                                                                                                                                                                                           | New: `isScrollKey`, `isScrollbarPointer`, `isOutOfView`                                                                                 |
| `src/renderer/features/meetings/playback-clock.ts` (+ test), `playback-controller.ts`, `playback-types.ts`, `use-media-playback.ts` (+ new clock test), `playback-harness.tsx`, `PlaybackBar.tsx` (+ test), `Clarifications.tsx` (+ test), `NotesView.tsx` (+ test) | The time goes through an external store; stable actions; the clarification form reads the time when it opens                            |
| `src/renderer/features/meetings/use-follow-playback.ts` (+ test), `use-tab-scroll.ts` (+ test), `use-detail-view.ts` (+ test), `MeetingContent.tsx` (+ test), `MeetingDetail.tsx` (+ test)                                                                          | Detail view lifted: tabs, search, follow, passage                                                                                       |
| `src/renderer/features/meetings/Transcript.tsx`, `TranscriptTurn.tsx`, `TranscriptList.tsx`, `TranscriptSearchBar.tsx`, `TranscriptStates.tsx`, `TranscriptPills.tsx`, `use-transcript-follow.ts`, `transcript-harness.tsx`, tests                                  | Rewritten transcript                                                                                                                    |
| `src/renderer/features/list/find-shortcut.ts` (+ test)                                                                                                                                                                                                              | `{ first }` option: the transcript takes Cmd+F before the list                                                                          |
| `docs/superpowers/specs/2026-10-13-main-window-redesign-design.md`                                                                                                                                                                                                  | Records the Cmd+F rule in the list pane « Keyboard » row (Task 10)                                                                      |

### Where the existing tests go

| Old test                                                                                                      | New test                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list-filter.test.ts` `describe('normalizeSearch')`, 18 cases                                                 | `search-text.test.ts`, the same 18 rows verbatim, imported from `../search-text` (Task 1); the `filterMeetings`, `resolveScope`, `emptyList` cases stay in place unchanged |
| `speaker-turns.test.ts`, 7 cases                                                                              | Unchanged, plus `part`, `continuation`, `segmentIds`, `partOf` cases (Task 2)                                                                                              |
| `meeting-format.test.ts` « copies the notes and the clarifications without the transcript or empty sections » | Same case; the export lines read `Intervenant A (partie 1)` / `(partie 2)` instead of `· extrait 1` / `· extrait 2` (Task 2)                                               |
| `Transcript.test.tsx` « shows distinct voices within each audio chunk in transcript and export »              | Task 2: same case with « Intervenant A » on screen and « (partie 2) » in the export; Task 10: « labels each voice « Intervenant A » and marks each new part »              |
| `Transcript.test.tsx` « réunit les paroles suivies d’un même intervenant en un seul passage »                 | Same name (Task 10), asserting one paragraph and two labels instead of button names                                                                                        |
| `Transcript.test.tsx` « ramène la lecture au début du passage cliqué »                                        | Same name (Task 10), clicking « Lire à partir de 10:01 »                                                                                                                   |
| `Transcript.test.tsx` « ne garde que les passages contenant le texte cherché »                                | `Transcript.search.test.tsx` « keeps every passage and highlights the matches » (Task 10): the behaviour changes by spec, the input is the same                            |
| `Transcript.test.tsx` « explique qu’aucun passage ne correspond à la recherche »                              | `Transcript.search.test.tsx` « says « Aucun résultat » when nothing matches » (Task 10)                                                                                    |
| `Transcript.test.tsx` « ne propose pas de recherche sans transcription »                                      | `Transcript.test.tsx` « offers the analysis instead of a search when there is no transcript » (Task 10)                                                                    |
| `MeetingContent.test.tsx`, 4 cases                                                                            | Same 4 names, rendered through `useDetailView` (Task 9)                                                                                                                    |
| `use-tab-scroll.test.tsx`, 3 blocks                                                                           | Unchanged, plus « calls back once the new tab has its position » (Task 9)                                                                                                  |
| `PlaybackBar.test.tsx` « shows the position… », « goes back to the playback position after a release »        | Same names; the position comes from `createPlaybackClock(252)` and `act(() => clock.set(600))` (Task 8); the other 6 cases only change the fixture                         |
| `Clarifications.test.tsx` « opens the form at the playback position and closes it after saving »              | Same name; `currentTime={() => 30}` instead of `at={30}` (Task 8)                                                                                                          |
| `NotesView.test.tsx` (every case through `renderNotes`)                                                       | Unchanged; `renderNotes` passes `currentTime={() => 0}` instead of `at={0}` (Task 8)                                                                                       |
| `use-media-playback.test.tsx`, `use-media-playback.video.test.tsx` (every case reading `at()`)                | Unchanged; `playback-harness.tsx` reads the time with `usePlaybackTime` (Task 8)                                                                                           |
| `MeetingDetail.test.tsx` « opens on the notes, with the transcript one arrow away »                           | Same name; `within(panel).getByText('Le budget.')` instead of a button (Task 10)                                                                                           |
| `MeetingDetail.test.tsx` « plays a note from its timestamp, in the extract that holds it »                    | Same name, plus « Transcription » selected (Task 9); the passage itself in `MeetingDetail.passage.test.tsx` (Task 12)                                                      |
| `chrome.test.ts` « no longer nests a scrolling frame in the transcript »                                      | Same name, reading `styles/transcript.css` (Task 3)                                                                                                                        |
| `motion-guard.test.ts` « declares exactly the allowed duration and easing tokens »                            | Same name; the list gains `--duration-ambient` (Task 3)                                                                                                                    |
| `find-shortcut.test.tsx`, `ListPane.test.tsx` Ctrl+F                                                          | Unchanged, plus the transcript priority cases (Task 10)                                                                                                                    |

---

### Task 1: Normalisation with aligned indices, shared with the list

**Files:**

- Create: `src/renderer/search-text.ts`, `src/renderer/search-text.test.ts`
- Modify: `src/renderer/features/list/list-filter.ts:22-41` (normalisation removed, imported)
- Modify: `src/renderer/features/list/list-filter.test.ts:1-60` (the `normalizeSearch` block moves)

**Interfaces:**

- Consumes: nothing.
- Produces: `interface FoldedText { folded: string; starts: number[]; ends: number[] }`; `interface TextRange { start: number; end: number }`; `foldText(text: string): FoldedText`; `normalizeSearch(text: string): string`; `findMatches(text: FoldedText, needle: string, limit: number): TextRange[]` (ranges in UTF-16 offsets of the source text, end exclusive, never overlapping).

The current `normalizeSearch` (`list-filter.ts:28-41`) works on the whole string, so a match position in the normalised text cannot be mapped back to the text on screen. Folding one code point at a time gives the same output (NFKD only decomposes; the marks it reorders are dropped) and keeps, for each output unit, the source range it came from. Every expectation below was run in Node 26 against this exact implementation before being written: the 18 list cases give identical output to the old function.

- [ ] **Step 1: Move the list cases and write the failing tests**

In `src/renderer/features/list/list-filter.test.ts`, delete the `describe('normalizeSearch', …)` block (lines 39-60) and `normalizeSearch,` from the import list (line 8).

`src/renderer/search-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findMatches, foldText, normalizeSearch } from './search-text';

describe('normalizeSearch', () => {
  it.each([
    ['Équipe', 'equipe'],
    ['ÉQUIPE PRODUIT', 'equipe produit'],
    ['Cœur du sujet', 'coeur du sujet'],
    ['ŒUVRE Ægis', 'oeuvre aegis'],
    ['  revue   produit ', 'revue produit'],
    ['', ''],
    ['   ', ''],
    ['Naïve façade', 'naive facade'],
    ['Zürich', 'zurich'],
    ['équipe', 'equipe'],
    ['Revue\nproduit\t2026', 'revue produit 2026'],
    ['Point d’équipe', "point d'equipe"],
    ['d‘équipe dʼéquipe d`équipe d´équipe', "d'equipe d'equipe d'equipe d'equipe"],
    ['Straße', 'strasse'],
    ['Søren', 'soren'],
    ['Kick-off Kick‑off Kick–off', 'kick off kick off kick off'],
    ['ﬁnal', 'final'],
    ['Rendez-vous️', 'rendez vous'],
  ])('%j reads as %j', (text, expected) => {
    expect(normalizeSearch(text)).toBe(expected);
  });
});

describe('foldText', () => {
  it('keeps, for every folded unit, the source character it comes from', () => {
    expect(foldText(' Œu')).toEqual({ folded: 'oeu', starts: [1, 1, 2], ends: [2, 2, 3] });
  });
});

const highlighted = (text: string, query: string) =>
  findMatches(foldText(text), normalizeSearch(query), Number.POSITIVE_INFINITY).map(
    ({ start, end }) => text.slice(start, end),
  );

describe('findMatches', () => {
  it.each<[string, string, string, string[]]>([
    ['an accent typed without it', 'Le Café de l’Équipe', 'cafe', ['Café']],
    ['a curly apostrophe typed straight', 'Le Café de l’Équipe', "l'equipe", ['l’Équipe']],
    ['a ligature typed as two letters, twice', 'Cœur, cœur', 'coeur', ['Cœur', 'cœur']],
    ['one letter of a ligature: the whole ligature', 'Cœur', 'e', ['œ']],
    ['ß matched once, not twice', 'Straße', 's', ['S', 'ß']],
    ['a typographic ligature', 'ﬁnal ﬁn', 'fi', ['ﬁ', 'ﬁ']],
    ['combining accents, the last one included', 'été', 'ete', ['été']],
    ['collapsed spaces', 'Revue  produit', 'revue produit', ['Revue  produit']],
    ['a hyphen typed as a space', 'Kick-off', 'kick off', ['Kick-off']],
    ['after an emoji (two UTF-16 units)', 'Rendez-vous 🎉 ok', 'ok', ['ok']],
    ['successive matches without overlap', 'aaaa', 'aa', ['aa', 'aa']],
    ['nothing for an empty query', 'Le budget', '', []],
  ])('finds %s', (_case, text, query, expected) => {
    expect(highlighted(text, query)).toEqual(expected);
  });

  it('gives source offsets', () => {
    expect(findMatches(foldText('Le Café de l’Équipe'), 'cafe', 10)).toEqual([
      { start: 3, end: 7 },
    ]);
    expect(findMatches(foldText('Rendez-vous 🎉 ok'), 'ok', 10)).toEqual([{ start: 15, end: 17 }]);
  });

  it('stops at the limit', () => {
    expect(findMatches(foldText('a a a a'), 'a', 2)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/search-text.test.ts`
Expected: FAIL, « Failed to resolve import "./search-text" ».

- [ ] **Step 3: Write the implementation**

`src/renderer/search-text.ts`:

```ts
const APOSTROPHES = /[’‘ʼ`´]/;
// Hyphen, non-breaking hyphen and en dash read as a space.
const DASHES = /[-‑–]/;
const MARKS_AND_VARIATION_SELECTORS = /[̀-ͯ️]/g;
const LETTERS: Readonly<Record<string, string>> = { œ: 'oe', æ: 'ae', ß: 'ss', ø: 'o' };
const SPACE = /\s/;

export interface FoldedText {
  /** Case, accent, ligature, apostrophe and dash insensitive, whitespace collapsed and trimmed. */
  folded: string;
  /** For each UTF-16 unit of `folded`, the source range of the character it comes from. */
  starts: number[];
  ends: number[];
}

export interface TextRange {
  start: number;
  end: number;
}

// One code point at a time, so every folded unit keeps its origin; NFKD only decomposes.
function foldChar(char: string): string {
  if (APOSTROPHES.test(char)) return "'";
  if (DASHES.test(char)) return ' ';
  const bare = char
    .normalize('NFKD')
    .replace(MARKS_AND_VARIATION_SELECTORS, '')
    .toLocaleLowerCase('fr-CH');
  return Array.from(bare, (letter) => LETTERS[letter] ?? letter).join('');
}

function append(result: FoldedText, folded: string, start: number, end: number): void {
  // A dropped accent belongs to the letter before it: a highlight takes both.
  if (folded === '' && result.ends.length > 0) result.ends[result.ends.length - 1] = end;
  for (const letter of folded) {
    const space = SPACE.test(letter);
    if (space && (result.folded === '' || result.folded.endsWith(' '))) continue;
    const unit = space ? ' ' : letter;
    result.folded += unit;
    for (let index = 0; index < unit.length; index += 1) {
      result.starts.push(start);
      result.ends.push(end);
    }
  }
}

export function foldText(text: string): FoldedText {
  const result: FoldedText = { folded: '', starts: [], ends: [] };
  let offset = 0;
  for (const char of text) {
    const end = offset + char.length;
    append(result, foldChar(char), offset, end);
    offset = end;
  }
  if (result.folded.endsWith(' ')) {
    result.folded = result.folded.slice(0, -1);
    result.starts.pop();
    result.ends.pop();
  }
  return result;
}

export function normalizeSearch(text: string): string {
  return foldText(text).folded;
}

/** Ranges of the source text; two matches inside one expanded letter (« ss » from ß) give one. */
export function findMatches(
  { folded, starts, ends }: FoldedText,
  needle: string,
  limit: number,
): TextRange[] {
  const found: TextRange[] = [];
  if (!needle) return found;
  let from = folded.indexOf(needle);
  while (from >= 0 && found.length < limit) {
    const start = starts[from] ?? 0;
    const end = ends[from + needle.length - 1] ?? start;
    const last = found[found.length - 1];
    if (!last || start >= last.end) found.push({ start, end });
    from = folded.indexOf(needle, from + needle.length);
  }
  return found;
}
```

In `src/renderer/features/list/list-filter.ts`, delete lines 22-41 (`APOSTROPHES` through the end of `normalizeSearch`) and add after line 1:

```ts
import { normalizeSearch } from '../../search-text';
```

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/search-text.test.ts src/renderer/features/list
npm run check
```

Expected: PASS; `grep -rn "normalizeSearch" src/renderer` shows only `search-text.ts`, its test and `list-filter.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/search-text.ts src/renderer/search-text.test.ts src/renderer/features/list/list-filter.ts src/renderer/features/list/list-filter.test.ts
git commit -m "refactor: search normalisation folds one character at a time and keeps source offsets"
```

---

### Task 2: Turns know their part and their continuations; the export names the part

**Files:**

- Modify: `src/renderer/features/meetings/speaker-turns.ts` (whole file)
- Modify: `src/renderer/features/meetings/speaker-turns.test.ts` (cases added)
- Modify: `src/renderer/features/meetings/meeting-format.ts:1-11`
- Modify: `src/renderer/features/meetings/meeting-format.test.ts:3,44-46` (+ new describe)
- Modify: `src/renderer/features/meetings/TranscriptTurn.tsx:3,14`, `Transcript.test.tsx:46-55` (interim, rewritten in Task 10)

**Interfaces:**

- Consumes: `Segment` from `src/shared/contracts` (`id` is `${chunk.index}-${n}`, `openai-intelligence.ts:50`, `local-whisper.ts:48`).
- Produces: `interface Turn { id: string; part: number | null; speaker?: string; start: number; end: number; text: string; brief: boolean; continuation: boolean; segmentIds: string[] }`; `partOf(id: string): number | null`; `speakerTurns(transcript: readonly Segment[]): Turn[]`; `speakerName(speaker: string): string` (« Intervenant A »); `speakerLabel(spoken: Pick<Segment, 'id' | 'speaker'>): string | undefined` (« Intervenant A (partie 2) »).

Expected values run in Node: twelve 100-character segments of one speaker give `[['0-0', 807, false, 8], ['0-8', 403, true, 4]]` (id, length, continuation, segments); `speakerLabel` gives « Intervenant A (partie 1) » for `0-0`, « Intervenant B (partie 2) » for `1-3`, « Intervenant A » for an id without a numeric prefix (`x`, `-1-0`, `1.5-0`), `undefined` without speaker; `partOf('12-3')` 12, `partOf('abc')`, `partOf('')`, `partOf('-1-0')`, `partOf('1e2-0')` null.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('speakerTurns', …)` of `speaker-turns.test.ts`:

```ts
it('marks the turn cut at 900 characters as the same voice continuing', () => {
  const long: Segment[] = Array.from({ length: 12 }, (_segment, index) => ({
    id: `0-${index}`,
    start: index * 10,
    end: index * 10 + 10,
    text: 'x'.repeat(100),
    speaker: 'A',
  }));

  const turns = speakerTurns(long);

  expect(turns.map((turn) => [turn.id, turn.text.length, turn.continuation])).toEqual([
    ['0-0', 807, false],
    ['0-8', 403, true],
  ]);
  expect(turns[1]?.segmentIds).toEqual(['0-8', '0-9', '0-10', '0-11']);
});

it('never calls a new part or a new voice a continuation', () => {
  const turns = speakerTurns([
    { id: '0-0', start: 1, end: 3, text: 'Un.', speaker: 'A' },
    { id: '0-1', start: 3, end: 5, text: 'Deux.', speaker: 'B' },
    { id: '1-0', start: 60, end: 62, text: 'Trois.', speaker: 'B' },
  ]);

  expect(turns.map((turn) => [turn.part, turn.continuation])).toEqual([
    [0, false],
    [0, false],
    [1, false],
  ]);
});

it('keeps the ids of the segments a turn gathers', () => {
  const turns = speakerTurns([
    { id: '0-0', start: 1, end: 3, text: 'Gardons mardi.', speaker: 'A' },
    { id: '0-1', start: 3, end: 8, text: 'C’est plus sûr.', speaker: 'A' },
  ]);

  expect(turns[0]?.segmentIds).toEqual(['0-0', '0-1']);
});
```

And after the describe:

```ts
describe('partOf', () => {
  it.each([
    ['12-3', 12],
    ['0-0', 0],
    ['abc', null],
    ['', null],
    ['-1-0', null],
    ['1e2-0', null],
  ])('reads the part of %j as %j', (id, part) => {
    expect(partOf(id)).toBe(part);
  });
});
```

Change the import line 3 to `import { partOf, speakerTurns } from './speaker-turns';`.

In `meeting-format.test.ts`, change the import to `import { meetingMarkdown, noteSources, notesMarkdown, speakerLabel } from './meeting-format';`, change line 45 to:

```ts
      `${notes}\n\n## Transcription\n\n[00:04] Intervenant A (partie 1) : Bonjour.\n\n[00:04] Intervenant B (partie 1) : Salut.\n\n[01:01] Intervenant A (partie 2) : Le budget.`,
```

and append:

```ts
describe('speakerLabel', () => {
  it.each([
    [{ id: '0-0', speaker: 'A' }, 'Intervenant A (partie 1)'],
    [{ id: '1-3', speaker: 'B' }, 'Intervenant B (partie 2)'],
    [{ id: 'x', speaker: 'A' }, 'Intervenant A'],
    [{ id: '-1-0', speaker: 'A' }, 'Intervenant A'],
    [{ id: '0-0' }, undefined],
    [{ id: '0-0', speaker: '' }, undefined],
  ])('names %j « %s »', (spoken, label) => {
    expect(speakerLabel(spoken)).toBe(label);
  });
});
```

In `Transcript.test.tsx`, replace the first case (lines 46-55) with:

```ts
it('shows distinct voices within each audio chunk in transcript and export', () => {
  render(<Transcript meeting={meeting} at={0} onSeek={vi.fn()} />);

  expect(screen.getByRole('button', { name: /Intervenant A.*Bonjour/ })).toBeVisible();
  expect(screen.getByRole('button', { name: /Intervenant B.*Salut/ })).toBeVisible();
  expect(screen.getByRole('button', { name: /Intervenant A.*Encore moi/ })).toBeVisible();
  expect(screen.queryByText(/extrait/)).toBeNull();
  expect(meetingMarkdown(meeting)).toContain('[01:01] Intervenant A (partie 2) : Encore moi.');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/features/meetings/speaker-turns.test.ts src/renderer/features/meetings/meeting-format.test.ts src/renderer/features/meetings/Transcript.test.tsx`
Expected: FAIL (`partOf` is not exported, `continuation` undefined, « · extrait 2 » still written).

- [ ] **Step 3: Write the implementation**

`src/renderer/features/meetings/speaker-turns.ts`:

```ts
import type { Segment } from '../../../shared/contracts';

// Au-delà, un tour devient un mur de texte : on ouvre une suite sans nouvelle étiquette.
const maxChars = 900;
// Une relance tient sur une ligne.
const briefSeconds = 2;
const briefChars = 25;

export interface Turn {
  id: string;
  /** Index of the audio extract where the speaker was identified; null for an id without one. */
  part: number | null;
  speaker?: string;
  start: number;
  end: number;
  text: string;
  brief: boolean;
  /** The same voice cut at 900 characters: shown without a new label. */
  continuation: boolean;
  segmentIds: string[];
}

export function partOf(id: string): number | null {
  const head = id.split('-')[0] ?? '';
  return /^\d+$/.test(head) ? Number(head) : null;
}

// Les étiquettes d'intervenants sont attribuées extrait par extrait : « A » dans un
// extrait ne désigne pas la même personne que « A » dans le suivant.
function sameVoice(turn: Turn, segment: Segment): boolean {
  return turn.part === partOf(segment.id) && turn.speaker === segment.speaker;
}

function opened(segment: Segment, continuation: boolean): Turn {
  return {
    id: segment.id,
    part: partOf(segment.id),
    speaker: segment.speaker,
    start: segment.start,
    end: segment.end,
    text: segment.text,
    brief: segment.end - segment.start <= briefSeconds && segment.text.length <= briefChars,
    continuation,
    segmentIds: [segment.id],
  };
}

export function speakerTurns(transcript: readonly Segment[]): Turn[] {
  const turns: Turn[] = [];
  for (const segment of transcript) {
    const open = turns[turns.length - 1];
    const same = open !== undefined && sameVoice(open, segment);
    if (open && same && open.text.length + segment.text.length + 1 <= maxChars) {
      open.end = Math.max(open.end, segment.end);
      open.text = `${open.text} ${segment.text}`;
      open.brief = false;
      open.segmentIds.push(segment.id);
      continue;
    }
    turns.push(opened(segment, same));
  }
  return turns;
}
```

`src/renderer/features/meetings/meeting-format.ts`, lines 1-11 become:

```ts
import { timeLabel } from '../../../shared/format';
import type { Meeting, NoteItem, Segment } from '../../../shared/contracts';
import { partOf } from './speaker-turns';

export function speakerName(speaker: string): string {
  return `Intervenant ${speaker}`;
}

// Les intervenants sont nommés extrait par extrait : l'export précise la partie, l'écran la
// montre par un séparateur.
export function speakerLabel(spoken: Pick<Segment, 'id' | 'speaker'>): string | undefined {
  if (!spoken.speaker) return undefined;
  const part = partOf(spoken.id);
  const name = speakerName(spoken.speaker);
  return part === null ? name : `${name} (partie ${part + 1})`;
}
```

Interim `TranscriptTurn.tsx` (rewritten in Task 10): replace the import of `speakerLabel` (line 3) with `import { speakerName } from './meeting-format';` and line 14 with:

```ts
const label = turn.speaker ? speakerName(turn.speaker) : undefined;
```

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/features/meetings
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings/speaker-turns.ts src/renderer/features/meetings/speaker-turns.test.ts src/renderer/features/meetings/meeting-format.ts src/renderer/features/meetings/meeting-format.test.ts src/renderer/features/meetings/TranscriptTurn.tsx src/renderer/features/meetings/Transcript.test.tsx
git commit -m "feat: turns carry their part and continuations; the export names « Intervenant A (partie 2) »"
```

---

### Task 3: Speaker and highlight tokens, transcript styles

**Files:**

- Modify: `src/renderer/styles.css:33,76,92,128,282,331-352` (tokens, transition list, keyframes)
- Modify: `src/renderer/design-tokens-support.ts` (append `layerContrast`)
- Modify: `src/renderer/design-tokens.test.ts:2-16,150-184,245-273` (import, cases)
- Modify: `src/renderer/motion-guard.test.ts:5,24-32,85-94`
- Create: `src/renderer/styles/transcript.css`, `src/renderer/styles/speaker-label.css`, `src/renderer/styles/follow-pill.css`
- Modify: `src/renderer/styles/meetings.css:73-130` (transcript rules deleted), `src/renderer/styles/meeting-detail.css:83-90`, `src/renderer/main.tsx:14-17`
- Modify: `src/renderer/chrome.test.ts:123-127` (+ new cases)

**Interfaces:**

- Consumes: `contrast`, `tokenValue`, `looks`, `themes`, `Look` from `design-tokens-support.ts`.
- Produces: the tokens of Global Constraints; CSS classes used by later tasks: `.transcript`, `.transcript-search`, `.transcript-search-count`, `.transcript-turns`, `.transcript-turn` (`.is-brief`, `.is-continuation`, `[aria-current='time']`), `.transcript-time`, `.transcript-body`, `.transcript-text` (`mark`, `mark[aria-current='true']`), `.transcript-turn-flash`, `.transcript-part`, `.transcript-part-title`, `.transcript-pills`, `.transcript-waiting`, `.speaker-label`, `.speaker-dot`, `.speaker-tone-1..4`, `.follow-pill`; `layerContrast(look: Look, upper: readonly string[], lower: readonly string[]): number`.

Values run in Node with the formula of `design-tokens-support.ts:103-130` (light / dark): speakers over pane + surface 6.09 5.94 5.50 5.95 / 8.84 11.19 9.92 11.21 (threshold 4.5, 12/600 labels); text over pane + surface + strong highlight 10.29 / 5.27; highlight against the bare pane 1.22 / 1.66 (threshold 1.2); strong against normal highlight 1.43 / 1.94 on the pane, 1.40 / 1.84 on the active surface (threshold 1.3). Light speaker 4 is olive (`#5f6200`) rather than amber, so it is not read as « paused » (`#734a00`). Between this task and Task 10 the old transcript (buttons) renders without its old styles: expected, it is replaced in Task 10.

- [ ] **Step 1: Write the failing tests**

`design-tokens.test.ts`: add `layerContrast,` to the import list (between `describeLook,` and `read,`) and inside `describe.each(looks…)`, after « keeps white text readable on the danger button »:

```ts
it.each([1, 2, 3, 4])('--color-speaker-%s labels a voice on the active turn', (n) => {
  expect(
    contrast(look, `--color-speaker-${n}`, '--color-pane', '--color-surface'),
  ).toBeGreaterThanOrEqual(4.5);
});

it.each(['--color-highlight', '--color-highlight-strong'])(
  'keeps the text readable on %s, on the active turn too',
  (mark) => {
    expect(
      contrast(look, '--color-text', '--color-pane', '--color-surface', mark),
    ).toBeGreaterThanOrEqual(4.5);
  },
);

it('shows a match on the page and the current match above the others', () => {
  expect(
    layerContrast(look, ['--color-pane', '--color-highlight'], ['--color-pane']),
  ).toBeGreaterThanOrEqual(1.2);
  for (const ground of [['--color-pane'], ['--color-pane', '--color-surface']]) {
    expect(
      layerContrast(
        look,
        [...ground, '--color-highlight-strong'],
        [...ground, '--color-highlight'],
      ),
    ).toBeGreaterThanOrEqual(1.3);
  }
});
```

After « gives the active tab and the media bands their own tokens »:

```ts
it.each(themes)('gives the speakers four colours of their own in %s', (theme) => {
  const speakers = [1, 2, 3, 4].map((n) => tokenValue(`--color-speaker-${n}`, theme));
  const reserved = ['accent', 'live', 'danger', 'paused', 'ready'].map((name) =>
    tokenValue(`--color-${name}`, theme),
  );
  expect(new Set(speakers).size).toBe(4);
  for (const value of speakers) expect(reserved).not.toContain(value);
});
```

Add `tokenValue,` to the import list of `design-tokens.test.ts`.

`motion-guard.test.ts`: line 5 becomes

```ts
const allowedVars =
  /var\(--(?:duration-fast|duration-base|duration-loop|duration-ambient|ease-out|ease-linear)\)/g;
```

add `'--duration-ambient',` after `'--duration-loop',` in `declaredMotionTokens`, and `'animation: turn-target var(--duration-ambient) var(--ease-out)',` to the « lets %s through » list.

`chrome.test.ts`: in « no longer nests a scrolling frame in the transcript » read `'styles/transcript.css'` instead of `'styles/meetings.css'`, then append:

```ts
it('lets the transcript text be selected and copied without its times', () => {
  const sheet = read('styles/transcript.css');
  expect(sheet).toMatch(/\.transcript-text\s*\{[^}]*user-select:\s*text/);
  expect(sheet).toMatch(/\.transcript-time\s*\{[^}]*user-select:\s*none/);
});

it('skips the layout of the turns out of view', () => {
  expect(read('styles/transcript.css')).toMatch(
    /\.transcript-turn\s*\{[^}]*content-visibility:\s*auto;[^}]*contain-intrinsic-size:\s*auto var\(--transcript-turn-estimate\)/,
  );
  expect(tokenValue('--transcript-turn-estimate')).toBe('72px');
});

it('keeps a turn scrolled to clear of the tab bar and the sticky search', () => {
  expect(read('styles/meeting-detail.css')).toMatch(
    /\.detail-scroll:has\(\.transcript-search\)\s*\{[^}]*scroll-padding-top:\s*calc\(var\(--detail-tabs-height\) \+ var\(--transcript-bar-height\)/,
  );
  expect(read('styles/transcript.css')).toMatch(
    /\.transcript-search\s*\{[^}]*position:\s*sticky;[^}]*top:\s*var\(--detail-tabs-height\)/,
  );
});

it('flashes a passage reached from a note, then hands back to the active ground', () => {
  expect(css()).toMatch(
    /@keyframes turn-target\s*\{\s*0%,\s*40%\s*\{\s*background-color:\s*var\(--color-accent-tint\);\s*\}\s*\}/,
  );
  expect(read('styles/transcript.css')).toMatch(
    /\.transcript-turn-flash\s*\{[^}]*animation:\s*turn-target var\(--duration-ambient\) var\(--ease-out\)/,
  );
  expect(tokenValue('--duration-ambient')).toBe('1.6s');
});

it('never smooths the transcript scroll', () => {
  expect(read('styles/transcript.css')).not.toMatch(/scroll-behavior/);
  expect(read('styles/meeting-detail.css')).not.toMatch(/scroll-behavior/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/design-tokens.test.ts src/renderer/motion-guard.test.ts src/renderer/chrome.test.ts`
Expected: FAIL (`layerContrast` not exported, missing token `--color-speaker-1`, `styles/transcript.css` not found, `--duration-ambient` not declared).

- [ ] **Step 3: Write the implementation**

Append to `design-tokens-support.ts`:

```ts
function layered(look: Look, tokens: readonly string[]): Rgba {
  return tokens
    .map((token) => groundColour(token, look))
    .reduce((below, layer) => over(layer, below));
}

/** Contrast between two stacks of grounds: a highlight against the page, two highlights apart. */
export function layerContrast(
  look: Look,
  upper: readonly string[],
  lower: readonly string[],
): number {
  const [a, b] = [luminance(layered(look, upper)), luminance(layered(look, lower))];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
```

`styles.css`, in `:root` after `--color-media: #000000;` (line 33):

```css
--color-highlight: rgb(255 196 0 / 0.4);
--color-highlight-strong: rgb(255 150 0 / 0.7);
--color-speaker-1: #6a3fc8;
--color-speaker-2: #00677d;
--color-speaker-3: #b0306f;
--color-speaker-4: #5f6200;
```

after `--reading-width: 680px;` (line 76):

```css
/* Tab bar: 8 px padding, 32 px segmented control, 8 px padding. */
--detail-tabs-height: 48px;
--transcript-bar-height: 56px;
--transcript-time-width: 48px;
/* What a turn out of view is assumed to measure until it has been laid out once. */
--transcript-turn-estimate: 72px;
--speaker-dot: 6px;
```

after `--duration-loop: 1s;` (line 92):

```css
/* A passage reached from a note: the tint holds, then hands back to the active ground. */
--duration-ambient: 1.6s;
```

in the dark block after `--color-media: #000000;` (line 128):

```css
--color-highlight: rgb(122 169 255 / 0.28);
--color-highlight-strong: rgb(122 169 255 / 0.55);
--color-speaker-1: #c4a8ff;
--color-speaker-2: #8fd8e8;
--color-speaker-3: #ffa8c5;
--color-speaker-4: #e8c98f;
```

in the colour transition list (line 282) add `.transcript-time,` after `.transcript-turn,`; after `@keyframes menu-enter { … }` (line 347):

```css
/* Colour only: kept under reduced motion. */
@keyframes turn-target {
  0%,
  40% {
    background-color: var(--color-accent-tint);
  }
}
```

`src/renderer/styles/transcript.css`:

```css
.transcript {
  display: grid;
  gap: var(--space-4);
}
/* Sticks under the tab bar: the counter and the arrows stay at hand while reading. */
.transcript-search {
  position: sticky;
  top: var(--detail-tabs-height);
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--transcript-bar-height);
  background: var(--color-pane);
}
.transcript-search .search {
  flex: 1;
  width: auto;
}
.transcript-search-count {
  color: var(--color-text-subtle);
  font-size: var(--text-caption);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.transcript-turns {
  display: grid;
  align-content: start;
  gap: var(--space-1);
}
/* No card per turn: only the active one gets a ground. */
.transcript-turn {
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: var(--transcript-time-width) minmax(0, 1fr);
  align-items: start;
  padding: var(--space-2) var(--space-2) var(--space-2) 0;
  border-radius: var(--radius-md);
  content-visibility: auto;
  contain-intrinsic-size: auto var(--transcript-turn-estimate);
}
.transcript-turn[aria-current='time'] {
  background-color: var(--color-surface);
}
/* The same voice cut at 900 characters: 4 px from the text before it. */
.transcript-turn.is-continuation {
  margin-top: calc(-1 * var(--space-2));
  padding-top: 0;
}
.transcript-turn-flash {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: var(--radius-md);
  animation: turn-target var(--duration-ambient) var(--ease-out);
}
.transcript-time {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: var(--control-xs);
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-subtle);
  font-size: var(--text-caption);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  user-select: none;
}
.transcript-time svg {
  display: none;
}
.transcript-turn:hover .transcript-time,
.transcript-time:focus-visible {
  color: var(--color-accent);
}
.transcript-turn:hover .transcript-time time,
.transcript-time:focus-visible time {
  display: none;
}
.transcript-turn:hover .transcript-time svg,
.transcript-time:focus-visible svg {
  display: block;
}
.transcript-body {
  min-width: 0;
}
.transcript-body > .speaker-label {
  display: flex;
}
.transcript-text {
  margin: 0;
  font-size: var(--text-body);
  line-height: 1.6;
  overflow-wrap: anywhere;
  user-select: text;
  cursor: text;
}
.transcript-text mark {
  background-color: var(--color-highlight);
  color: inherit;
}
.transcript-text mark[aria-current='true'] {
  background-color: var(--color-highlight-strong);
}
/* A brief reply holds on one line: label and text side by side. */
.transcript-turn.is-brief .transcript-body {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
}
.transcript-turn.is-brief .transcript-body > .speaker-label {
  display: inline-flex;
}
.transcript-part {
  margin-top: var(--space-2);
  padding: var(--space-4) 0 var(--space-2);
  border-top: 1px solid var(--color-border);
}
.transcript-part-title {
  margin: 0;
  color: var(--color-text-subtle);
  font-size: var(--text-caption);
  font-weight: 600;
  letter-spacing: 0;
}
.transcript-part .caption {
  margin: var(--space-1) 0 0;
}
.transcript-pills {
  position: sticky;
  bottom: var(--space-4);
  z-index: 1;
  display: flex;
  justify-content: center;
  gap: var(--space-2);
  pointer-events: none;
}
.transcript-pills > * {
  pointer-events: auto;
}
.transcript-waiting {
  display: grid;
  gap: var(--space-4);
}
```

`src/renderer/styles/speaker-label.css`:

```css
.speaker-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-caption);
  font-weight: 600;
  line-height: 1.6;
}
.speaker-dot {
  flex: none;
  width: var(--speaker-dot);
  height: var(--speaker-dot);
  border-radius: var(--radius-pill);
  background: currentColor;
}
.speaker-tone-1 {
  color: var(--color-speaker-1);
}
.speaker-tone-2 {
  color: var(--color-speaker-2);
}
.speaker-tone-3 {
  color: var(--color-speaker-3);
}
.speaker-tone-4 {
  color: var(--color-speaker-4);
}
```

`src/renderer/styles/follow-pill.css`:

```css
/* Floats over the reading column: the one shadow for what floats in the DOM. */
.follow-pill {
  box-shadow: var(--shadow-float);
}
```

`meetings.css`: delete lines 73-130 (`.transcript {` through the `.transcript-turn.active` rule); `.appearance-choice` stays.

`meeting-detail.css`, the `.detail-scroll` rule (lines 83-90) becomes:

```css
.detail-scroll {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 36px var(--space-6);
  scroll-padding-top: calc(var(--detail-tabs-height) + var(--space-2));
  scroll-padding-bottom: var(--space-6);
}
.detail-scroll:has(.transcript-search) {
  scroll-padding-top: calc(
    var(--detail-tabs-height) + var(--transcript-bar-height) + var(--space-2)
  );
}
```

`main.tsx`: after `import './styles/meetings.css';` add

```ts
import './styles/transcript.css';
import './styles/speaker-label.css';
import './styles/follow-pill.css';
```

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/design-tokens.test.ts src/renderer/motion-guard.test.ts src/renderer/chrome.test.ts
npm run check
```

Expected: PASS, including « holds only tokens, no literal » and « takes durations, easing and properties from the whitelist » for the three new sheets, and « redeclares in the dark block exactly the colour tokens with a literal value in :root ».

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles.css src/renderer/styles src/renderer/main.tsx src/renderer/design-tokens-support.ts src/renderer/design-tokens.test.ts src/renderer/motion-guard.test.ts src/renderer/chrome.test.ts
git commit -m "style: speaker and highlight tokens in both themes, transcript sheet, passage flash"
```

---

### Task 4: `SpeakerLabel` and `FollowPill`

**Files:**

- Create: `src/renderer/components/SpeakerLabel.tsx`, `src/renderer/components/SpeakerLabel.test.tsx`
- Create: `src/renderer/components/FollowPill.tsx`, `src/renderer/components/FollowPill.test.tsx`
- Modify: `src/renderer/components/ui.tsx`

**Interfaces:**

- Consumes: `Button` (`components/Button.tsx`, `variant`, `shape: 'pill'`); the classes of Task 3.
- Produces: `type SpeakerTone = 1 | 2 | 3 | 4`; `SpeakerLabel({ name: string; tone: SpeakerTone })`; `FollowPill({ label: string; onClick(): void })`; both exported from `components/ui.tsx`.

- [ ] **Step 1: Write the failing tests**

`src/renderer/components/SpeakerLabel.test.tsx`:

```tsx
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
```

`src/renderer/components/FollowPill.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FollowPill } from './FollowPill';

afterEach(cleanup);

it('brings the reader back on click', async () => {
  const onClick = vi.fn();
  render(<FollowPill label="Revenir au direct" onClick={onClick} />);
  await userEvent.click(screen.getByRole('button', { name: 'Revenir au direct' }));
  expect(onClick).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/components/SpeakerLabel.test.tsx src/renderer/components/FollowPill.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the implementation**

`src/renderer/components/SpeakerLabel.tsx`:

```tsx
export type SpeakerTone = 1 | 2 | 3 | 4;

interface SpeakerLabelProps {
  name: string;
  tone: SpeakerTone;
}

/** The 12/600 label and its dot in the speaker colour; shared with the live panel. */
export function SpeakerLabel({ name, tone }: SpeakerLabelProps) {
  return (
    <span className={`speaker-label speaker-tone-${tone}`}>
      <span className="speaker-dot" aria-hidden="true" />
      {name}
    </span>
  );
}
```

`src/renderer/components/FollowPill.tsx`:

```tsx
import { Button } from './Button';

interface FollowPillProps {
  label: string;
  onClick(): void;
}

/** Floats over a reading column to bring the reader back: « Revenir au direct », « Retour aux notes ». */
export function FollowPill({ label, onClick }: FollowPillProps) {
  return (
    <Button variant="secondary" shape="pill" className="follow-pill" onClick={onClick}>
      {label}
    </Button>
  );
}
```

Append to `components/ui.tsx`:

```ts
export { SpeakerLabel, type SpeakerTone } from './SpeakerLabel';
export { FollowPill } from './FollowPill';
```

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/components
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/SpeakerLabel.tsx src/renderer/components/SpeakerLabel.test.tsx src/renderer/components/FollowPill.tsx src/renderer/components/FollowPill.test.tsx src/renderer/components/ui.tsx
git commit -m "feat: shared speaker label and follow pill"
```

---

### Task 5: Rows, speaker tones, active turn and stable turns

**Files:**

- Create: `src/renderer/features/meetings/transcript-rows.ts`, `src/renderer/features/meetings/transcript-rows.test.ts`
- Create: `src/renderer/features/meetings/use-stable-turns.ts`

**Interfaces:**

- Consumes: `Turn`, `speakerTurns` (Task 2); `SpeakerTone` (Task 4); `AudioChunk` from contracts.
- Produces:
  - `interface PartRow { kind: 'part'; key: string; part: number; start: number; first: boolean }` (`part` is 1-based);
  - `interface TurnRow { kind: 'turn'; key: string; turn: Turn; index: number; tone: SpeakerTone | null; labelled: boolean }`; `type TranscriptRow = PartRow | TurnRow`;
  - `transcriptRows(turns: readonly Turn[], partStarts: ReadonlyMap<number, number>): TranscriptRow[]`;
  - `partStarts(chunks: readonly AudioChunk[]): Map<number, number>`;
  - `activeTurnIndex(turns: readonly Pick<Turn, 'start' | 'end'>[], at: number): number` (−1 when no turn holds `at`);
  - `passageTurn(turns: readonly Turn[], passage: { sourceId: string; at: number }): number`;
  - `stableTurns(previous: readonly Turn[], next: Turn[]): readonly Turn[]`;
  - `useStableTurns(transcript: readonly Segment[]): readonly Turn[]`.

Rules: a separator wherever the part changes between two turns, only when at least one turn has a speaker; the first separator carries the sentence; its time is the extract start, else the first turn's start. Tones restart in each part, in order of first appearance, cycling 1-4. A turn is labelled when it has a speaker and is not a continuation. The active turn is the last one starting at or before `at`, if `at` is before its end (the old `find` at `Transcript.tsx:39`, in O(log n)). Expected values run in Node: see the tables in Step 1.

- [ ] **Step 1: Write the failing tests**

`src/renderer/features/meetings/transcript-rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Segment } from '../../../shared/contracts';
import { speakerTurns } from './speaker-turns';
import {
  activeTurnIndex,
  partStarts,
  passageTurn,
  stableTurns,
  transcriptRows,
  type TranscriptRow,
} from './transcript-rows';

const summary = (rows: TranscriptRow[]) =>
  rows.map((row) =>
    row.kind === 'part'
      ? ['part', row.part, row.start, row.first]
      : ['turn', row.turn.id, row.tone, row.labelled],
  );

const starts = new Map([
  [0, 0],
  [1, 600],
  [2, 1200],
]);

describe('transcriptRows', () => {
  it('marks each change of part, the first one with the sentence, and restarts the colours', () => {
    const turns = speakerTurns([
      { id: '0-0', start: 1, end: 3, text: 'Bonjour.', speaker: 'A' },
      { id: '0-1', start: 4, end: 6, text: 'Salut.', speaker: 'B' },
      { id: '0-2', start: 6, end: 9, text: 'On commence.', speaker: 'A' },
      { id: '1-0', start: 601, end: 604, text: 'Encore moi.', speaker: 'B' },
      { id: '1-1', start: 604, end: 605, text: 'Oui.', speaker: 'A' },
      { id: '2-0', start: 1200, end: 1203, text: 'Fin.', speaker: 'A' },
    ]);
    expect(summary(transcriptRows(turns, starts))).toEqual([
      ['turn', '0-0', 1, true],
      ['turn', '0-1', 2, true],
      ['turn', '0-2', 1, true],
      ['part', 2, 600, true],
      ['turn', '1-0', 1, true],
      ['turn', '1-1', 2, true],
      ['part', 3, 1200, false],
      ['turn', '2-0', 1, true],
    ]);
  });

  it('has neither separator nor label without any speaker', () => {
    const turns = speakerTurns([
      { id: '0-0', start: 1, end: 3, text: 'Un.' },
      { id: '1-0', start: 60, end: 62, text: 'Deux.' },
    ]);
    expect(summary(transcriptRows(turns, new Map([[1, 60]])))).toEqual([
      ['turn', '0-0', null, false],
      ['turn', '1-0', null, false],
    ]);
  });

  it('labels a single speaker in each part and keeps the separators', () => {
    const turns = speakerTurns([
      { id: '0-0', start: 1, end: 3, text: 'Un.', speaker: 'A' },
      { id: '1-0', start: 60, end: 62, text: 'Deux.', speaker: 'A' },
    ]);
    expect(summary(transcriptRows(turns, new Map()))).toEqual([
      ['turn', '0-0', 1, true],
      ['part', 2, 60, true],
      ['turn', '1-0', 1, true],
    ]);
  });

  it('cycles through four colours and leaves a continuation unlabelled', () => {
    const voices: Segment[] = ['A', 'B', 'C', 'D', 'E'].map((speaker, index) => ({
      id: `0-${index}`,
      start: index,
      end: index + 1,
      text: `${speaker}.`,
      speaker,
    }));
    const long: Segment[] = Array.from({ length: 10 }, (_segment, index) => ({
      id: `0-${index + 5}`,
      start: 10 + index,
      end: 11 + index,
      text: 'x'.repeat(100),
      speaker: 'E',
    }));
    const rows = transcriptRows(speakerTurns([...voices, ...long]), new Map());
    expect(summary(rows).map(([, , tone, labelled]) => [tone, labelled])).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [4, true],
      [1, true],
      [1, false],
    ]);
  });

  it('gives nothing for an empty transcript', () => {
    expect(transcriptRows([], starts)).toEqual([]);
  });
});

describe('partStarts', () => {
  it('maps each extract to its start', () => {
    const chunk = (index: number, start: number) => ({
      index,
      start,
      duration: 60,
      transcript: null,
    });
    expect(partStarts([chunk(0, 0), chunk(1, 600)])).toEqual(
      new Map([
        [0, 0],
        [1, 600],
      ]),
    );
  });
});

describe('activeTurnIndex', () => {
  const turns = [
    { start: 1, end: 3 },
    { start: 4, end: 6 },
    { start: 6, end: 9 },
    { start: 601, end: 604 },
  ];

  it.each([
    [0, -1],
    [1, 0],
    [2.9, 0],
    [3, -1],
    [3.5, -1],
    [4, 1],
    [6, 2],
    [8.99, 2],
    [9, -1],
    [601, 3],
    [603.9, 3],
    [604, -1],
    [1e6, -1],
    [-1, -1],
    [Number.NaN, -1],
  ])('at %s plays turn %s', (at, index) => {
    expect(activeTurnIndex(turns, at)).toBe(index);
  });

  it('takes the latest start when two turns overlap, and handles no turn', () => {
    expect(activeTurnIndex([], 5)).toBe(-1);
    expect(
      activeTurnIndex(
        [
          { start: 4, end: 6 },
          { start: 4.6, end: 8 },
        ],
        4.7,
      ),
    ).toBe(1);
    expect(
      activeTurnIndex(
        [
          { start: 4, end: 4 },
          { start: 4, end: 9 },
        ],
        4,
      ),
    ).toBe(1);
  });

  it('finds the turn playing among 1 000 by binary search', () => {
    const many = Array.from({ length: 1000 }, (_turn, index) => ({
      start: index * 5,
      end: index * 5 + 5,
    }));
    expect([
      activeTurnIndex(many, 2500),
      activeTurnIndex(many, 4999.9),
      activeTurnIndex(many, 5000),
    ]).toEqual([500, 999, -1]);
  });
});

describe('passageTurn', () => {
  const turns = speakerTurns([
    { id: '0-0', start: 1, end: 3, text: 'Bonjour.', speaker: 'A' },
    { id: '0-1', start: 3, end: 5, text: 'On commence.', speaker: 'A' },
    { id: '0-2', start: 5, end: 8, text: 'Salut.', speaker: 'B' },
  ]);

  it.each([
    ['a segment merged into a longer turn', { sourceId: '0-1', at: 3 }, 0],
    ['a segment opening its own turn', { sourceId: '0-2', at: 5 }, 1],
    ['a clarification, by its time', { sourceId: 'clarification:c1', at: 6 }, 1],
    ['a time no turn holds', { sourceId: 'clarification:c2', at: 90 }, -1],
  ])('finds %s', (_case, passage, index) => {
    expect(passageTurn(turns, passage)).toBe(index);
  });
});

describe('stableTurns', () => {
  const one: Segment = { id: '0-0', start: 1, end: 3, text: 'Un.', speaker: 'A' };
  const two: Segment = { id: '0-1', start: 3, end: 5, text: 'Deux.', speaker: 'B' };

  it('hands back the previous list when the poll brings the same turns', () => {
    const previous = speakerTurns([one]);
    expect(stableTurns(previous, speakerTurns([{ ...one }]))).toBe(previous);
  });

  it('keeps the unchanged turns and takes the new ones', () => {
    const previous = speakerTurns([one]);
    const next = speakerTurns([{ ...one }, two]);
    const merged = stableTurns(previous, next);
    expect(merged[0]).toBe(previous[0]);
    expect(merged[1]).toBe(next[1]);
  });

  it('takes a turn whose text grew', () => {
    const grown = speakerTurns([{ ...one, end: 5, text: 'Un. Deux.' }]);
    expect(stableTurns(speakerTurns([one]), grown)[0]).toBe(grown[0]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/features/meetings/transcript-rows.test.ts`
Expected: FAIL, « Failed to resolve import "./transcript-rows" ».

- [ ] **Step 3: Write the implementation**

`src/renderer/features/meetings/transcript-rows.ts`:

```ts
import type { AudioChunk } from '../../../shared/contracts';
import type { SpeakerTone } from '../../components/ui';
import type { Turn } from './speaker-turns';

export interface PartRow {
  kind: 'part';
  key: string;
  /** 1-based, as the export names it. */
  part: number;
  start: number;
  first: boolean;
}

export interface TurnRow {
  kind: 'turn';
  key: string;
  turn: Turn;
  index: number;
  tone: SpeakerTone | null;
  labelled: boolean;
}

export type TranscriptRow = PartRow | TurnRow;

const TONES: readonly SpeakerTone[] = [1, 2, 3, 4];

function toneOf(tones: Map<string, SpeakerTone>, speaker: string | undefined): SpeakerTone | null {
  if (!speaker) return null;
  const known = tones.get(speaker);
  if (known !== undefined) return known;
  const tone = TONES[tones.size % TONES.length] ?? 1;
  tones.set(speaker, tone);
  return tone;
}

function partRow(
  turn: Turn,
  part: number,
  starts: ReadonlyMap<number, number>,
  first: boolean,
): PartRow {
  return {
    kind: 'part',
    key: `part-${turn.id}`,
    part: part + 1,
    start: starts.get(part) ?? turn.start,
    first,
  };
}

/** The transcript as shown: the turns, and a separator wherever the extract changes. */
export function transcriptRows(
  turns: readonly Turn[],
  starts: ReadonlyMap<number, number>,
): TranscriptRow[] {
  // Without any speaker the parts mean nothing to the reader: no separator at all.
  const diarized = turns.some((turn) => Boolean(turn.speaker));
  const rows: TranscriptRow[] = [];
  let tones = new Map<string, SpeakerTone>();
  let parts = 0;
  turns.forEach((turn, index) => {
    const previous = turns[index - 1];
    if (previous && turn.part !== previous.part) {
      // « A » in one part is not « A » in the next: the colours start over.
      tones = new Map();
      if (diarized && turn.part !== null) {
        rows.push(partRow(turn, turn.part, starts, parts === 0));
        parts += 1;
      }
    }
    const tone = toneOf(tones, turn.speaker);
    rows.push({
      kind: 'turn',
      key: turn.id,
      turn,
      index,
      tone,
      labelled: Boolean(turn.speaker) && !turn.continuation,
    });
  });
  return rows;
}

export function partStarts(chunks: readonly AudioChunk[]): Map<number, number> {
  return new Map(chunks.map((chunk) => [chunk.index, chunk.start]));
}

/** Turns are sorted by start (extracts in order, segments in order within each). */
export function activeTurnIndex(turns: readonly Pick<Turn, 'start' | 'end'>[], at: number): number {
  let low = 0;
  let high = turns.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const turn = turns[middle];
    if (turn && turn.start <= at) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const turn = turns[found];
  return turn !== undefined && at < turn.end ? found : -1;
}

/** The turn a note points to: the one holding its segment, else the one playing at its time. */
export function passageTurn(
  turns: readonly Turn[],
  passage: { sourceId: string; at: number },
): number {
  const holder = turns.findIndex((turn) => turn.segmentIds.includes(passage.sourceId));
  return holder >= 0 ? holder : activeTurnIndex(turns, passage.at);
}

function sameTurn(a: Turn, b: Turn): boolean {
  return (
    a.id === b.id &&
    a.start === b.start &&
    a.end === b.end &&
    a.text === b.text &&
    a.speaker === b.speaker &&
    a.brief === b.brief &&
    a.continuation === b.continuation &&
    a.segmentIds.length === b.segmentIds.length
  );
}

/** Every unchanged turn keeps its object, and the list itself when nothing changed. */
export function stableTurns(previous: readonly Turn[], next: Turn[]): readonly Turn[] {
  const known = new Map(previous.map((turn) => [turn.id, turn]));
  let reused = 0;
  const merged = next.map((turn) => {
    const old = known.get(turn.id);
    if (!old || !sameTurn(old, turn)) return turn;
    reused += 1;
    return old;
  });
  return reused === previous.length && next.length === previous.length ? previous : merged;
}
```

`src/renderer/features/meetings/use-stable-turns.ts`:

```ts
import { useMemo, useRef } from 'react';
import type { Segment } from '../../../shared/contracts';
import { speakerTurns, type Turn } from './speaker-turns';
import { stableTurns } from './transcript-rows';

/** The 2 s poll hands over equal segments in new objects: unchanged turns keep their identity. */
export function useStableTurns(transcript: readonly Segment[]): readonly Turn[] {
  const previous = useRef<readonly Turn[]>([]);
  return useMemo(() => {
    const next = stableTurns(previous.current, speakerTurns(transcript));
    previous.current = next;
    return next;
  }, [transcript]);
}
```

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/features/meetings/transcript-rows.test.ts
npm run check
```

Expected: PASS (`use-stable-turns.ts` is exercised from Task 10 on; `noUnusedLocals` does not flag an unused export).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings/transcript-rows.ts src/renderer/features/meetings/transcript-rows.test.ts src/renderer/features/meetings/use-stable-turns.ts
git commit -m "feat: transcript rows with parts and speaker tones, active turn by binary search, stable turns"
```

---

### Task 6: Transcript search: matches, cap, navigation

**Files:**

- Create: `src/renderer/features/meetings/transcript-search.ts`, `src/renderer/features/meetings/transcript-search.test.ts`
- Create: `src/renderer/features/meetings/use-transcript-search.ts`

**Interfaces:**

- Consumes: `foldText`, `findMatches`, `normalizeSearch`, `FoldedText`, `TextRange` (Task 1); `Turn` (Task 2).
- Produces:
  - `MATCH_LIMIT = 500`; `interface TranscriptMatch extends TextRange { turnId: string }`;
  - `interface SearchResult { needle: string; matches: TranscriptMatch[]; byTurn: ReadonlyMap<string, readonly TextRange[]>; capped: boolean }`;
  - `searchTranscript(turns: readonly Turn[], query: string): SearchResult` (ranges cached per `Turn` object and needle, so an unchanged turn gets the same array);
  - `stepMatch(current: number, count: number, direction: 1 | -1): number`; `matchKey(match: TranscriptMatch): string`; `keptMatch(matches: readonly TranscriptMatch[], key: string | null): number`; `counterLabel(current: number, count: number, capped: boolean): string`;
  - `interface FoundMatches { query: string; result: SearchResult; current: number; currentKey: string | null; label: string; setQuery(value: string): void; step(direction: 1 | -1): void }`; `useTranscriptSearch(turns: readonly Turn[], query: string, onQuery: (value: string) => void): FoundMatches`.

Expected values run in Node: « budget » over `Le budget est validé.` / `Budget 2027 : le BUDGET reste.` / `Rien à voir.` gives `0-0` [3, 9], `0-1` [0, 6], `0-1` [17, 23]; 601 « a » give 500 matches, capped, nothing kept from the second turn; exactly 500 are not capped; `stepMatch` (−1, 3, 1) 0, (−1, 3, −1) 2, (0, 3, 1) 1, (2, 3, 1) 0, (0, 3, −1) 2, (0, 0, 1) −1; `keptMatch` [] → −1, null → 0, `0-1:17` → 2, unknown → 0; labels « 3 sur 12 », « 1 sur 500+ », « Aucun résultat ».

- [ ] **Step 1: Write the failing tests**

`src/renderer/features/meetings/transcript-search.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Segment } from '../../../shared/contracts';
import { speakerTurns } from './speaker-turns';
import {
  counterLabel,
  keptMatch,
  matchKey,
  searchTranscript,
  stepMatch,
} from './transcript-search';

const voices = (texts: string[]) =>
  speakerTurns(
    texts.map((text, index): Segment => ({
      id: `0-${index}`,
      start: index,
      end: index + 1,
      text,
      speaker: index % 2 ? 'B' : 'A',
    })),
  );

const turns = voices(['Le budget est validé.', 'Budget 2027 : le BUDGET reste.', 'Rien à voir.']);

describe('searchTranscript', () => {
  it('finds every match in reading order, case and accents ignored', () => {
    const result = searchTranscript(turns, 'budget');
    expect(result.matches).toEqual([
      { turnId: '0-0', start: 3, end: 9 },
      { turnId: '0-1', start: 0, end: 6 },
      { turnId: '0-1', start: 17, end: 23 },
    ]);
    expect(result.capped).toBe(false);
    expect(searchTranscript(turns, 'VALIDE').matches).toEqual([
      { turnId: '0-0', start: 14, end: 20 },
    ]);
  });

  it('ignores a blank query', () => {
    expect(searchTranscript(turns, '   ')).toEqual({
      needle: '',
      matches: [],
      byTurn: new Map(),
      capped: false,
    });
  });

  it('finds nothing for an absent word', () => {
    expect(searchTranscript(turns, 'absent').matches).toEqual([]);
  });

  it('stops at 500 matches and says so', () => {
    const result = searchTranscript(voices(['a '.repeat(600), 'a']), 'a');
    expect(result.matches).toHaveLength(500);
    expect(result.capped).toBe(true);
    expect(result.byTurn.has('0-1')).toBe(false);
  });

  it('is not capped at exactly 500', () => {
    const result = searchTranscript(voices(['a '.repeat(499), 'a']), 'a');
    expect(result.matches).toHaveLength(500);
    expect(result.capped).toBe(false);
  });

  it('says it is capped when the 500th match ends a turn and another turn matches', () => {
    const result = searchTranscript(voices(['a '.repeat(500), 'a']), 'a');
    expect(result.matches).toHaveLength(500);
    expect(result.capped).toBe(true);
  });

  it('hands back the same ranges for an unchanged turn', () => {
    expect(searchTranscript(turns, 'budget').byTurn.get('0-1')).toBe(
      searchTranscript(turns, 'budget').byTurn.get('0-1'),
    );
  });
});

describe('stepMatch', () => {
  it.each([
    [-1, 3, 1, 0],
    [-1, 3, -1, 2],
    [0, 3, 1, 1],
    [2, 3, 1, 0],
    [0, 3, -1, 2],
    [1, 3, -1, 0],
    [0, 0, 1, -1],
  ] as const)('from %s of %s going %s lands on %s', (current, count, direction, expected) => {
    expect(stepMatch(current, count, direction)).toBe(expected);
  });
});

describe('keptMatch', () => {
  const matches = searchTranscript(turns, 'budget').matches;

  it('keeps the current match across a poll, or falls back to the first', () => {
    expect(keptMatch([], 'x')).toBe(-1);
    expect(keptMatch(matches, null)).toBe(0);
    expect(keptMatch(matches, '0-1:17')).toBe(2);
    expect(keptMatch(matches, 'gone:1')).toBe(0);
  });

  it('keys a match by its turn and start', () => {
    expect(matches.map(matchKey)).toEqual(['0-0:3', '0-1:0', '0-1:17']);
  });
});

describe('counterLabel', () => {
  it.each([
    [2, 12, false, '3 sur 12'],
    [0, 500, true, '1 sur 500+'],
    [-1, 0, false, 'Aucun résultat'],
  ])('reads %s of %s (capped %s) as « %s »', (current, count, capped, label) => {
    expect(counterLabel(current, count, capped)).toBe(label);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/features/meetings/transcript-search.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/renderer/features/meetings/transcript-search.ts`:

```ts
import {
  findMatches,
  foldText,
  normalizeSearch,
  type FoldedText,
  type TextRange,
} from '../../search-text';
import type { Turn } from './speaker-turns';

export const MATCH_LIMIT = 500;

export interface TranscriptMatch extends TextRange {
  turnId: string;
}

export interface SearchResult {
  needle: string;
  matches: TranscriptMatch[];
  byTurn: ReadonlyMap<string, readonly TextRange[]>;
  capped: boolean;
}

// Turns keep their object across polls (stableTurns): fold and search each one once.
const folded = new WeakMap<Turn, FoldedText>();
const found = new WeakMap<Turn, { needle: string; ranges: readonly TextRange[] }>();

function foldedTurn(turn: Turn): FoldedText {
  const cached = folded.get(turn);
  if (cached) return cached;
  const text = foldText(turn.text);
  folded.set(turn, text);
  return text;
}

function rangesIn(turn: Turn, needle: string): readonly TextRange[] {
  const cached = found.get(turn);
  if (cached?.needle === needle) return cached.ranges;
  const ranges = findMatches(foldedTurn(turn), needle, MATCH_LIMIT + 1);
  found.set(turn, { needle, ranges });
  return ranges;
}

export function searchTranscript(turns: readonly Turn[], query: string): SearchResult {
  const needle = normalizeSearch(query);
  const matches: TranscriptMatch[] = [];
  const byTurn = new Map<string, readonly TextRange[]>();
  const done = (capped: boolean): SearchResult => ({ needle, matches, byTurn, capped });
  if (!needle) return done(false);
  for (const turn of turns) {
    const ranges = rangesIn(turn, needle);
    if (!ranges.length) continue;
    const room = MATCH_LIMIT - matches.length;
    if (room <= 0) return done(true);
    const kept = ranges.length > room ? ranges.slice(0, room) : ranges;
    byTurn.set(turn.id, kept);
    for (const range of kept) matches.push({ turnId: turn.id, ...range });
    if (kept.length < ranges.length) return done(true);
  }
  return done(false);
}

export function stepMatch(current: number, count: number, direction: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}

export function matchKey(match: TranscriptMatch): string {
  return `${match.turnId}:${match.start}`;
}

/** After a poll the same passage stays current; one that vanished gives way to the first. */
export function keptMatch(matches: readonly TranscriptMatch[], key: string | null): number {
  if (!matches.length) return -1;
  if (key === null) return 0;
  const index = matches.findIndex((match) => matchKey(match) === key);
  return index >= 0 ? index : 0;
}

export function counterLabel(current: number, count: number, capped: boolean): string {
  if (count === 0) return 'Aucun résultat';
  return `${current + 1} sur ${count}${capped ? '+' : ''}`;
}
```

`src/renderer/features/meetings/use-transcript-search.ts`:

```ts
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Turn } from './speaker-turns';
import {
  counterLabel,
  keptMatch,
  matchKey,
  searchTranscript,
  stepMatch,
  type SearchResult,
} from './transcript-search';

export interface FoundMatches {
  query: string;
  result: SearchResult;
  current: number;
  currentKey: string | null;
  label: string;
  setQuery(value: string): void;
  step(direction: 1 | -1): void;
}

export function useTranscriptSearch(
  turns: readonly Turn[],
  query: string,
  onQuery: (value: string) => void,
): FoundMatches {
  // Typing stays responsive on a long transcript: the highlights follow a beat behind.
  const deferred = useDeferredValue(query);
  const result = useMemo(() => searchTranscript(turns, deferred), [turns, deferred]);
  const [chosen, setChosen] = useState<string | null>(null);
  // The match last shown: text arriving before it during an analysis must not move it.
  const shown = useRef<string | null>(null);
  const current = keptMatch(result.matches, chosen ?? shown.current);
  const match = result.matches[current];
  const currentKey = match ? matchKey(match) : null;
  useEffect(() => {
    shown.current = currentKey;
  }, [currentKey]);

  return {
    query,
    result,
    current,
    currentKey,
    label: result.needle ? counterLabel(current, result.matches.length, result.capped) : '',
    setQuery(value) {
      shown.current = null;
      setChosen(null);
      onQuery(value);
    },
    step(direction) {
      const next = result.matches[stepMatch(current, result.matches.length, direction)];
      if (next) setChosen(matchKey(next));
    },
  };
}
```

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/features/meetings/transcript-search.test.ts
npm run check
```

Expected: PASS (the hook is exercised through `Transcript` in Task 10).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings/transcript-search.ts src/renderer/features/meetings/transcript-search.test.ts src/renderer/features/meetings/use-transcript-search.ts
git commit -m "feat: transcript search with a 500 cap, navigation and a match kept across polls"
```

---

### Task 7: Follow rules

**Files:**

- Create: `src/renderer/features/meetings/follow-rules.ts`, `src/renderer/features/meetings/follow-rules.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `type KeyTarget = 'editable' | 'control' | 'other'`; `isScrollKey(key: string, target: KeyTarget): boolean`; `interface ScrollbarPointer { onScroller: boolean; offsetX: number; clientWidth: number; offsetWidth: number }`; `isScrollbarPointer(pointer: ScrollbarPointer): boolean`; `interface Span { top: number; bottom: number }`; `isOutOfView(item: Span, viewport: Span, insets: Span): boolean`.

Rules: page keys scroll unless typing; line keys (arrows up and down, Home, End, Space) count only when focus is on no control, since on a tab Home/End move the tab and on a button Space clicks it. A pointer on the scroller itself in its scrollbar strip counts; macOS overlay scrollbars take no width (`clientWidth === offsetWidth`), so the last 16 px count then. A turn entirely hidden behind the sticky bars or outside the viewport is out of view; an unmeasured viewport (jsdom, a hidden panel) never is.

- [ ] **Step 1: Write the failing tests**

`src/renderer/features/meetings/follow-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isOutOfView, isScrollKey, isScrollbarPointer, type KeyTarget } from './follow-rules';

describe('isScrollKey', () => {
  it.each<[string, KeyTarget, boolean]>([
    ['PageDown', 'other', true],
    ['PageUp', 'control', true],
    ['PageDown', 'editable', false],
    ['ArrowDown', 'other', true],
    ['ArrowUp', 'other', true],
    ['Home', 'other', true],
    ['End', 'other', true],
    [' ', 'other', true],
    ['ArrowDown', 'control', false],
    ['Home', 'control', false],
    [' ', 'control', false],
    ['ArrowDown', 'editable', false],
    ['ArrowRight', 'other', false],
    ['Enter', 'other', false],
    ['f', 'other', false],
  ])('%j on %s scrolls: %s', (key, target, expected) => {
    expect(isScrollKey(key, target)).toBe(expected);
  });
});

describe('isScrollbarPointer', () => {
  it.each([
    [
      'in a classic scrollbar',
      { onScroller: true, offsetX: 805, clientWidth: 800, offsetWidth: 815 },
      true,
    ],
    [
      'on the content beside it',
      { onScroller: true, offsetX: 700, clientWidth: 800, offsetWidth: 815 },
      false,
    ],
    [
      'in the strip of an overlay scrollbar',
      { onScroller: true, offsetX: 790, clientWidth: 800, offsetWidth: 800 },
      true,
    ],
    [
      'left of that strip',
      { onScroller: true, offsetX: 780, clientWidth: 800, offsetWidth: 800 },
      false,
    ],
    [
      'on a child of the scroller',
      { onScroller: false, offsetX: 805, clientWidth: 800, offsetWidth: 815 },
      false,
    ],
  ])('counts a pointer %s: %s', (_case, pointer, expected) => {
    expect(isScrollbarPointer(pointer)).toBe(expected);
  });
});

describe('isOutOfView', () => {
  const viewport = { top: 0, bottom: 600 };
  const bars = { top: 104, bottom: 32 };

  it.each([
    ['in view', { top: 200, bottom: 260 }, false],
    ['hidden behind the sticky bars', { top: 40, bottom: 100 }, true],
    ['partly below the bars', { top: 50, bottom: 120 }, false],
    ['below, behind the bottom padding', { top: 568, bottom: 640 }, true],
    ['partly visible at the bottom', { top: 560, bottom: 640 }, false],
    ['far above', { top: -400, bottom: -340 }, true],
    ['far below', { top: 1200, bottom: 1260 }, true],
  ])('says a turn %s is out of view: %s', (_case, item, expected) => {
    expect(isOutOfView(item, viewport, bars)).toBe(expected);
  });

  it('never calls anything out of view in an unmeasured viewport', () => {
    expect(isOutOfView({ top: 0, bottom: 0 }, { top: 0, bottom: 0 }, bars)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/features/meetings/follow-rules.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

`src/renderer/features/meetings/follow-rules.ts`:

```ts
export type KeyTarget = 'editable' | 'control' | 'other';

const PAGE_KEYS = new Set(['PageUp', 'PageDown']);
const LINE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End', ' ']);

/** A key that scrolls the transcript; on a control (tab, button), only the page keys still do. */
export function isScrollKey(key: string, target: KeyTarget): boolean {
  if (target === 'editable') return false;
  if (PAGE_KEYS.has(key)) return true;
  return target === 'other' && LINE_KEYS.has(key);
}

// macOS overlay scrollbars take no layout width: the strip they appear in counts.
const OVERLAY_SCROLLBAR_WIDTH = 16;

export interface ScrollbarPointer {
  onScroller: boolean;
  offsetX: number;
  clientWidth: number;
  offsetWidth: number;
}

export function isScrollbarPointer({
  onScroller,
  offsetX,
  clientWidth,
  offsetWidth,
}: ScrollbarPointer): boolean {
  if (!onScroller) return false;
  const strip = offsetWidth > clientWidth ? clientWidth : clientWidth - OVERLAY_SCROLLBAR_WIDTH;
  return offsetX >= strip;
}

export interface Span {
  top: number;
  bottom: number;
}

/** Hidden behind the sticky bars counts as out of view; an unmeasured viewport never does. */
export function isOutOfView(item: Span, viewport: Span, insets: Span): boolean {
  if (viewport.bottom - viewport.top <= insets.top + insets.bottom) return false;
  return item.bottom <= viewport.top + insets.top || item.top >= viewport.bottom - insets.bottom;
}
```

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/features/meetings/follow-rules.test.ts
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings/follow-rules.ts src/renderer/features/meetings/follow-rules.test.ts
git commit -m "feat: pure rules for the gestures that stop the follow and for a turn out of view"
```

---

### Task 8: The playback time through an external store

**Files:**

- Create: `src/renderer/features/meetings/playback-clock.ts`, `src/renderer/features/meetings/playback-clock.test.ts`
- Create: `src/renderer/features/meetings/use-media-playback.clock.test.tsx`
- Modify: `src/renderer/features/meetings/playback-controller.ts:1-29,148-152`
- Modify: `src/renderer/features/meetings/playback-types.ts:28-46`, `use-media-playback.ts` (whole), `playback-harness.tsx:18-25`
- Modify: `src/renderer/features/meetings/PlaybackBar.tsx:1-12`, `PlaybackBar.test.tsx:1-37,102-110`
- Modify: `src/renderer/features/meetings/Clarifications.tsx:1-62`, `Clarifications.test.tsx:26`
- Modify: `src/renderer/features/meetings/NotesView.tsx:9,74`, `NotesView.test.tsx:44`
- Modify: `src/renderer/features/meetings/MeetingDetail.tsx:64,75`, interim `Transcript.tsx:13-17,35-39` and `Transcript.test.tsx:17-21`

**Interfaces:**

- Consumes: `PlaybackController`, `MediaDriver`, `VideoFollower` as they are.
- Produces:
  - `interface PlaybackClock { now(): number; set(at: number): void; subscribe(listener: () => void): () => void }`; `createPlaybackClock(start?: number): PlaybackClock`; `usePlaybackTime(clock: PlaybackClock): number`; `usePlaybackSelector<T>(clock: PlaybackClock, select: (at: number) => T): T` (re-renders only when `select` gives a new value);
  - `type PlaybackState = Omit<PlaybackView, 'at'>`; `INITIAL_STATE`; `new PlaybackController(driver, follower, clock, publish: (state: PlaybackState) => void)`;
  - `Playback` loses `at` and gains `clock: PlaybackClock`; `toggle`, `seek`, `playAt` keep their identity across renders;
  - `Clarifications` and `NotesView` take `currentTime(): number` instead of `at: number`.

Today every `timeupdate` sets React state in `useMediaPlayback` (`use-media-playback.ts:16,30`), so `MeetingDetail` and everything below it re-render about four times a second. After this task the controller writes the time to the clock and publishes React state only when the position, `playing` or `failed` change.

- [ ] **Step 1: Write the failing tests**

`src/renderer/features/meetings/playback-clock.test.ts`:

```ts
import { expect, it, vi } from 'vitest';
import { createPlaybackClock } from './playback-clock';

it('tells its listeners once per change of time', () => {
  const clock = createPlaybackClock(4);
  const listener = vi.fn();
  const stop = clock.subscribe(listener);
  clock.set(4);
  expect(listener).not.toHaveBeenCalled();
  clock.set(5.5);
  expect(clock.now()).toBe(5.5);
  expect(listener).toHaveBeenCalledOnce();
  stop();
  clock.set(6);
  expect(listener).toHaveBeenCalledOnce();
});

it('starts at zero', () => {
  expect(createPlaybackClock().now()).toBe(0);
});
```

`src/renderer/features/meetings/use-media-playback.clock.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Meeting } from '../../../shared/contracts';
import { threeMinutes } from './playback-harness';
import { useMediaPlayback, type Playback } from './use-media-playback';

afterEach(cleanup);

let renders = 0;
const seen: Playback[] = [];

function Counting({ meeting }: { meeting: Meeting }) {
  const playback = useMediaPlayback(meeting);
  renders += 1;
  seen.push(playback);
  return <audio data-testid="media" {...playback.mediaProps} />;
}

it('leaves the components that do not read the clock alone while the time moves', () => {
  render(<Counting meeting={threeMinutes} />);
  const media = screen.getByTestId<HTMLAudioElement>('media');
  fireEvent.loadedMetadata(media);
  const before = renders;
  for (const time of [1, 1.25, 1.5]) {
    media.currentTime = time;
    fireEvent.timeUpdate(media);
  }
  expect(renders).toBe(before);
  expect(seen.at(-1)?.clock.now()).toBe(1.5);
});

it('keeps its actions across renders, for the memoised turns', () => {
  const { rerender } = render(<Counting meeting={threeMinutes} />);
  rerender(<Counting meeting={{ ...threeMinutes }} />);
  const [first, last] = [seen.at(-2), seen.at(-1)];
  expect(last?.playAt).toBe(first?.playAt);
  expect(last?.seek).toBe(first?.seek);
  expect(last?.toggle).toBe(first?.toggle);
});
```

In `PlaybackBar.test.tsx`: change the testing-library import to `import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';`, add `import { createPlaybackClock } from './playback-clock';`, replace `at: 252,` (line 29) by `clock: createPlaybackClock(252),`, and replace the case « goes back to the playback position after a release » by:

```tsx
it('goes back to the playback position after a release', () => {
  const playback = playbackOf();
  render(<PlaybackBar playback={playback} />);
  fireEvent.pointerDown(slider());
  fireEvent.change(slider(), { target: { value: '600' } });
  fireEvent.pointerUp(slider());
  act(() => playback.clock.set(600));
  expect(screen.getByText('10:00')).toBeInTheDocument();
});
```

In `Clarifications.test.tsx` line 26, `at={30}` becomes `currentTime={() => 30}`; in `NotesView.test.tsx` line 44, `at={0}` becomes `currentTime={() => 0}`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/features/meetings/playback-clock.test.ts src/renderer/features/meetings/use-media-playback.clock.test.tsx src/renderer/features/meetings/PlaybackBar.test.tsx src/renderer/features/meetings/Clarifications.test.tsx`
Expected: FAIL (`./playback-clock` not found; `renders` grows on each `timeupdate`; the actions change identity).

- [ ] **Step 3: Write the implementation**

`src/renderer/features/meetings/playback-clock.ts`:

```ts
import { useSyncExternalStore } from 'react';

/** The playback position, outside React: only what reads it re-renders when it moves. */
export interface PlaybackClock {
  now(): number;
  set(at: number): void;
  subscribe(listener: () => void): () => void;
}

export function createPlaybackClock(start = 0): PlaybackClock {
  let at = start;
  const listeners = new Set<() => void>();
  return {
    now: () => at,
    set(next) {
      if (next === at) return;
      at = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function usePlaybackTime(clock: PlaybackClock): number {
  return useSyncExternalStore(clock.subscribe, clock.now);
}

/** Re-renders only when the selected value changes: the transcript selects its active turn. */
export function usePlaybackSelector<T>(clock: PlaybackClock, select: (at: number) => T): T {
  return useSyncExternalStore(clock.subscribe, () => select(clock.now()));
}
```

`playback-controller.ts`: add `import type { PlaybackClock } from './playback-clock';`, and after `INITIAL_VIEW` (line 12):

```ts
/** What React renders from; the time goes through the clock. */
export type PlaybackState = Omit<PlaybackView, 'at'>;

export const INITIAL_STATE: PlaybackState = { position: 0, playing: false, failed: false };

function stateOf({ position, playing, failed }: PlaybackView): PlaybackState {
  return { position, playing, failed };
}

function sameState(a: PlaybackView, b: PlaybackView): boolean {
  return a.position === b.position && a.playing === b.playing && a.failed === b.failed;
}
```

The constructor (lines 25-29) becomes:

```ts
  constructor(
    readonly driver: MediaDriver,
    readonly follower: VideoFollower,
    private readonly clock: PlaybackClock,
    private readonly publish: (state: PlaybackState) => void,
  ) {}
```

and `commit` (lines 148-152):

```ts
  private commit(patch: Partial<PlaybackView>): void {
    const before = this.view;
    this.view = { ...this.view, ...patch };
    if (patch.playing !== undefined) this.follower.setPlaying(patch.playing);
    this.clock.set(this.view.at);
    if (!sameState(before, this.view)) this.publish(stateOf(this.view));
  }
```

`playback-types.ts`: add `import type { PlaybackClock } from './playback-clock';` and, in `Playback`, replace

```ts
/** Seconds from the start of the meeting. */
at: number;
```

with

```ts
/** Seconds from the start of the meeting, read with `usePlaybackTime` by the bar and the transcript only. */
clock: PlaybackClock;
```

`use-media-playback.ts`:

```ts
import { useEffect, useMemo, useState } from 'react';
import type { Meeting } from '../../../shared/contracts';
import { followerVideoProps, mediaElementProps } from './media-element-props';
import { MediaDriver } from './media-driver';
import { createPlaybackClock } from './playback-clock';
import { INITIAL_STATE, PlaybackController } from './playback-controller';
import { drivesFromVideo, playbackSources, timelineEnd, videoSource } from './playback-timeline';
import type { Playback } from './playback-types';
import { VideoFollower } from './video-follower';

export type { FollowerVideoProps, MediaElementProps, Playback } from './playback-types';

export function useMediaPlayback(meeting: Meeting): Playback {
  // Rebuilt each render: the 2 s poll hands over equal sources, so `src` does not change.
  const sources = playbackSources(meeting);
  const duration = timelineEnd(sources, meeting.duration);
  const [state, setState] = useState(INITIAL_STATE);
  const [clock] = useState(() => createPlaybackClock());
  const [controller] = useState(
    () => new PlaybackController(new MediaDriver(), new VideoFollower(), clock, setState),
  );
  // Stable: the memoised transcript turns receive them.
  const actions = useMemo(
    () => ({
      toggle: () => controller.toggle(),
      seek: (time: number) => controller.seek(time),
      playAt: (time: number) => controller.goTo(time, true),
    }),
    [controller],
  );
  const video = videoSource(meeting);
  const onVideo = drivesFromVideo(meeting);

  useEffect(() => controller.setSources(sources, duration));
  useEffect(() => () => controller.stop(), [controller]);

  return {
    available: sources.length > 0,
    playing: state.playing,
    failed: state.failed,
    clock,
    duration,
    timeline: onVideo ? 'video' : 'audio',
    mediaProps: mediaElementProps(controller, sources[state.position]?.src),
    videoProps: video && !onVideo ? followerVideoProps(controller, video) : null,
    ...actions,
  };
}
```

`playback-harness.tsx`: add `import { usePlaybackTime } from './playback-clock';`; in `Harness`, after `const playback = useMediaPlayback(meeting);` add `const time = usePlaybackTime(playback.clock);` and render `<p data-testid="at">{time}</p>`.

`PlaybackBar.tsx`: add `import { usePlaybackTime } from './playback-clock';`; line 12 becomes

```ts
const { duration, playing, available, failed } = playback;
const at = usePlaybackTime(playback.clock);
```

`Clarifications.tsx`: the props replace `at: number;` with

```ts
  /** Read when the form opens, to prefill « Moment »: the section never follows the time. */
  currentTime(): number;
```

and the component becomes:

```tsx
export function Clarifications(props: ClarificationsProps) {
  const { meeting, currentTime, disabled, saving, submitError, onTimestamp, onSubmit } = props;
  const [openedAt, setOpenedAt] = useState<number | null>(null);

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
      {openedAt !== null ? (
        <ClarificationForm
          duration={meeting.duration}
          at={openedAt}
          saving={saving}
          submitError={submitError}
          onClose={() => setOpenedAt(null)}
          onSubmit={onSubmit}
        />
      ) : (
        <Button variant="secondary" disabled={disabled} onClick={() => setOpenedAt(currentTime())}>
          <MessageSquarePlus size={16} aria-hidden="true" />
          Ajouter une précision
        </Button>
      )}
    </section>
  );
}
```

`NotesView.tsx`: `at: number;` (line 9) becomes `currentTime(): number;`, and `at={props.at}` (line 74) becomes `currentTime={props.currentTime}`.

`MeetingDetail.tsx`: `at={playback.at}` (line 64) becomes `currentTime={playback.clock.now}`, and line 75 becomes

```tsx
<Transcript meeting={meeting} clock={playback.clock} onSeek={playback.playAt} {...search} />
```

Interim `Transcript.tsx` (rewritten in Task 10): add `import { usePlaybackTime, type PlaybackClock } from './playback-clock';`; in `TranscriptProps` replace `at: number;` with `clock: PlaybackClock;`; the component signature becomes `export function Transcript({ meeting, clock, onSeek, search, onSearch }: TranscriptProps)` with `const at = usePlaybackTime(clock);` as its first line. Interim `Transcript.test.tsx`: add `import { createPlaybackClock } from './playback-clock';` and the wrapper (lines 17-21) becomes:

```tsx
// The search lives in the tab container; this stands in for it.
function Transcript(props: { meeting: Meeting; at: number; onSeek(at: number): void }) {
  const [search, setSearch] = useState('');
  const [clock] = useState(() => createPlaybackClock(props.at));
  return (
    <ControlledTranscript
      meeting={props.meeting}
      clock={clock}
      onSeek={props.onSeek}
      search={search}
      onSearch={setSearch}
    />
  );
}
```

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/features/meetings
npm run check
```

Expected: PASS, including every case of `use-media-playback.test.tsx`, `use-media-playback.video.test.tsx` and `MeetingDetail.playback.test.tsx` (« stops the sound and opens the next meeting from the start » reads the slider, which reads the clock).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings
git commit -m "perf: the playback time goes through an external store read by the bar and the transcript only"
```

---

### Task 9: The detail view: tabs, search, follow and passage lifted together

**Files:**

- Create: `src/renderer/features/meetings/use-follow-playback.ts`, `src/renderer/features/meetings/use-follow-playback.test.tsx`
- Create: `src/renderer/features/meetings/use-detail-view.ts`, `src/renderer/features/meetings/use-detail-view.test.tsx`
- Modify: `src/renderer/features/meetings/use-tab-scroll.ts:24-53`, `use-tab-scroll.test.tsx` (+ case)
- Modify: `src/renderer/features/meetings/MeetingContent.tsx` (whole), `MeetingContent.test.tsx` (whole)
- Modify: `src/renderer/features/meetings/MeetingDetail.tsx:1-77`, `MeetingDetail.test.tsx:95-107`

**Interfaces:**

- Consumes: `isScrollKey`, `isScrollbarPointer`, `KeyTarget` (Task 7); `TimestampHandler` (`Clarifications.tsx:9`); `useTabScroll`.
- Produces:
  - `keyTarget(target: EventTarget | null): KeyTarget`; `interface FollowPlayback { following: boolean; follow(): void; release(): void }`; `useFollowPlayback(scrollerRef: RefObject<HTMLElement | null>, listening: boolean): FollowPlayback`;
  - `useTabScroll<T extends string>(initial: T, onRestored?: (tab: T, scroller: HTMLElement) => void)`, same return value;
  - `type DetailTab = 'notes' | 'transcript'`; `interface Passage { sourceId: string; at: number; key: number }`;
  - `interface TranscriptView { search: string; onSearch(value: string): void; following: boolean; onFollow(): void; onRelease(): void; scrollerRef: RefObject<HTMLDivElement | null>; passage: Passage | null; onBackToNotes(): void; onSeek(at: number): void }`;
  - `interface DetailView { tab: DetailTab; selectTab(next: DetailTab): void; scrollerRef: RefObject<HTMLDivElement | null>; anchorRef: RefObject<HTMLDivElement | null>; openPassage: TimestampHandler; transcript: TranscriptView }`;
  - `placeReading(scroller: HTMLElement): void` (scrolls `[data-passage]`, else `[aria-current="time"]`, `block: 'nearest'`); `useDetailView(playAt: (at: number) => void): DetailView`;
  - `MeetingContent({ header, notes, transcript: ReactNode, view: Pick<DetailView, 'tab' | 'selectTab' | 'scrollerRef' | 'anchorRef'> })`.

Why lifted: the transcript only renders while its tab shows (`MeetingContent.tsx:53`), and `following` must survive a visit to the notes. The placement on the active turn must run after `useTabScroll` restores the tab's position, which is a parent layout effect that runs after the transcript's own; hence the `onRestored` callback, called in the same layout effect, before paint. `onSeek` is stable (`useCallback` over the stable `playAt` of Task 8 and `follow`), because every memoised turn receives it.

- [ ] **Step 1: Write the failing tests**

Append to `use-tab-scroll.test.tsx`:

```tsx
describe('useTabScroll callback', () => {
  function Called({ onRestored }: { onRestored(tab: string, top: number): void }) {
    const { select, scrollerRef, anchorRef } = useTabScroll<'notes' | 'transcript'>(
      'notes',
      (tab, scroller) => onRestored(tab, scroller.scrollTop),
    );
    return (
      <div data-testid="scroller" ref={scrollerRef}>
        <div ref={anchorRef} />
        <button onClick={() => select('notes')}>Notes</button>
        <button onClick={() => select('transcript')}>Transcription</button>
      </div>
    );
  }

  it('calls back once the new tab has its position', async () => {
    const user = userEvent.setup();
    const onRestored = vi.fn();
    render(<Called onRestored={onRestored} />);
    const scroller = screen.getByTestId('scroller');
    scroller.scrollTop = 300;
    await user.click(screen.getByRole('button', { name: 'Transcription' }));
    scroller.scrollTop = 120;
    await user.click(screen.getByRole('button', { name: 'Notes' }));
    expect(onRestored).toHaveBeenNthCalledWith(1, 'transcript', 0);
    expect(onRestored).toHaveBeenNthCalledWith(2, 'notes', 300);
  });
});
```

(add `vi` to the vitest import of that file).

`src/renderer/features/meetings/use-follow-playback.test.tsx`:

```tsx
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
```

`src/renderer/features/meetings/use-detail-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeetingContent } from './MeetingContent';
import { useDetailView, type TranscriptView } from './use-detail-view';

const playAt = vi.fn();
const scrolled = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled(this);
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Probe({ view }: { view: TranscriptView }) {
  return (
    <div>
      <p>{view.following ? 'Suit la lecture' : 'Lecture libre'}</p>
      <p>{view.passage ? `Passage ${view.passage.sourceId}` : 'Aucun passage'}</p>
      <article aria-current="time">Le budget.</article>
      <button type="button" onClick={view.onBackToNotes}>
        Retour aux notes
      </button>
      <button type="button" onClick={() => view.onSeek(30)}>
        Lire à partir de 0:30
      </button>
    </div>
  );
}

function Harness() {
  const view = useDetailView(playAt);
  return (
    <MeetingContent
      header={<h1>Revue</h1>}
      view={view}
      notes={
        <button type="button" onClick={() => view.openPassage(61, '1-0')}>
          Écouter à 1:01
        </button>
      }
      transcript={<Probe view={view.transcript} />}
    />
  );
}

const scroller = () => {
  const element = document.querySelector<HTMLElement>('.detail-scroll');
  if (!element) throw new Error('no scroll container');
  return element;
};
const selected = (name: string) => screen.getByRole('tab', { name }).getAttribute('aria-selected');

it('opens the passage of a note: plays it, shows the transcript, places the turn', async () => {
  render(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'Écouter à 1:01' }));
  expect(playAt).toHaveBeenCalledWith(61);
  expect(selected('Transcription')).toBe('true');
  expect(screen.getByText('Passage 1-0')).toBeInTheDocument();
  expect(scrolled).toHaveBeenLastCalledWith(screen.getByText('Le budget.'));
});

it('goes back to the notes where they were, and forgets the passage', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  scroller().scrollTop = 300;
  await user.click(screen.getByRole('button', { name: 'Écouter à 1:01' }));
  await user.click(screen.getByRole('button', { name: 'Retour aux notes' }));
  expect(selected('Notes')).toBe('true');
  expect(scroller().scrollTop).toBe(300);
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  expect(screen.getByText('Aucun passage')).toBeInTheDocument();
});

it('leaves the place alone when the reader stopped following, until a time is clicked', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  fireEvent.wheel(scroller());
  expect(screen.getByText('Lecture libre')).toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'Notes' }));
  scrolled.mockClear();
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  expect(scrolled).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Lire à partir de 0:30' }));
  expect(playAt).toHaveBeenCalledWith(30);
  expect(screen.getByText('Suit la lecture')).toBeInTheDocument();
});

it('counts gestures only while the transcript shows', async () => {
  render(<Harness />);
  fireEvent.wheel(scroller());
  await userEvent.click(screen.getByRole('tab', { name: 'Transcription' }));
  expect(screen.getByText('Suit la lecture')).toBeInTheDocument();
});
```

`MeetingContent.test.tsx` becomes:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MeetingContent } from './MeetingContent';
import { useDetailView, type TranscriptView } from './use-detail-view';

afterEach(cleanup);

const playAt = vi.fn();

function Harness(props: { notes: ReactNode; transcript?: (view: TranscriptView) => ReactNode }) {
  const view = useDetailView(playAt);
  return (
    <MeetingContent
      header={<h1>Revue</h1>}
      view={view}
      notes={props.notes}
      transcript={props.transcript?.(view.transcript) ?? <p>Rien à lire.</p>}
    />
  );
}

function searchField({ search, onSearch }: TranscriptView) {
  return (
    <input
      aria-label="Chercher"
      value={search}
      onChange={(event) => onSearch(event.target.value)}
    />
  );
}

it('keeps the transcript search when the tab changes and comes back', async () => {
  const user = userEvent.setup();
  render(<Harness notes={<p>Notes</p>} transcript={searchField} />);
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  await user.type(screen.getByRole('textbox', { name: 'Chercher' }), 'budget');
  await user.click(screen.getByRole('tab', { name: 'Notes' }));
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  expect(screen.getByRole('textbox', { name: 'Chercher' })).toHaveValue('budget');
});

it('makes a panel without any control reachable by keyboard', () => {
  render(<Harness notes={<p>Rien à faire ici.</p>} />);
  expect(screen.getByRole('tabpanel', { name: 'Notes' })).toHaveAttribute('tabindex', '0');
});

it('leaves a panel that holds controls out of the tab order', () => {
  render(<Harness notes={<button type="button">Ajouter une précision</button>} />);
  expect(screen.getByRole('tabpanel', { name: 'Notes' })).not.toHaveAttribute('tabindex');
});

it('ignores a disabled control when looking for something to focus', () => {
  render(
    <Harness
      notes={
        <button type="button" disabled>
          Ajouter une précision
        </button>
      }
    />,
  );
  expect(screen.getByRole('tabpanel', { name: 'Notes' })).toHaveAttribute('tabindex', '0');
});
```

In `MeetingDetail.test.tsx`, « plays a note from its timestamp, in the extract that holds it », add after the click (line 99):

```tsx
expect(screen.getByRole('tab', { name: 'Transcription' })).toHaveAttribute('aria-selected', 'true');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/features/meetings/use-tab-scroll.test.tsx src/renderer/features/meetings/use-follow-playback.test.tsx src/renderer/features/meetings/use-detail-view.test.tsx src/renderer/features/meetings/MeetingContent.test.tsx src/renderer/features/meetings/MeetingDetail.test.tsx`
Expected: FAIL (modules not found; `onRestored` never called; the note stays on « Notes »).

- [ ] **Step 3: Write the implementation**

`use-tab-scroll.ts`, `useTabScroll` becomes:

```ts
/** One scroll container for every tab; each tab gets its own position back, then `onRestored` runs. */
export function useTabScroll<T extends string>(
  initial: T,
  onRestored?: (tab: T, scroller: HTMLElement) => void,
) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<T, SavedScroll>());
  const leftAt = useRef<number | null>(null);
  const restored = useRef(onRestored);
  const [tab, setTab] = useState(initial);

  const anchorTop = () => anchorRef.current?.offsetTop ?? 0;

  function select(next: T): void {
    if (next === tab) return;
    const scroller = scrollerRef.current;
    if (scroller) {
      positions.current.set(tab, savedScroll(scroller.scrollTop, anchorTop()));
      leftAt.current = scroller.scrollTop;
    }
    setTab(next);
  }

  // Declared first, so the restoring effect below calls the latest callback.
  useLayoutEffect(() => {
    restored.current = onRestored;
  });

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const previous = leftAt.current;
    if (!scroller || previous === null) return;
    leftAt.current = null;
    scroller.scrollTop = restoredScroll(positions.current.get(tab), previous, anchorTop());
    restored.current?.(tab, scroller);
  }, [tab]);

  return { tab, select, scrollerRef, anchorRef };
}
```

`src/renderer/features/meetings/use-follow-playback.ts`:

```ts
import { useCallback, useEffect, useState, type RefObject } from 'react';
import { isScrollKey, isScrollbarPointer, type KeyTarget } from './follow-rules';

const EDITABLE = 'input, textarea, select, [contenteditable="true"]';
const CONTROL = 'button, a[href], summary, [role="tab"], [role="slider"]';

export function keyTarget(target: EventTarget | null): KeyTarget {
  if (!(target instanceof Element)) return 'other';
  if (target.closest(EDITABLE)) return 'editable';
  return target.closest(CONTROL) ? 'control' : 'other';
}

export interface FollowPlayback {
  following: boolean;
  follow(): void;
  release(): void;
}

function listenForGestures(scroller: HTMLElement, release: () => void): () => void {
  // Ctrl + wheel is a pinch to zoom, not a scroll.
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) release();
  };
  const onKey = (event: KeyboardEvent) => {
    const { target } = event;
    const inside =
      target === document.body || (target instanceof Node && scroller.contains(target));
    if (inside && isScrollKey(event.key, keyTarget(target))) release();
  };
  const onPointer = (event: PointerEvent) => {
    const pointer = {
      onScroller: event.target === scroller,
      offsetX: event.offsetX,
      clientWidth: scroller.clientWidth,
      offsetWidth: scroller.offsetWidth,
    };
    if (isScrollbarPointer(pointer)) release();
  };
  scroller.addEventListener('wheel', onWheel, { passive: true });
  scroller.addEventListener('touchmove', release, { passive: true });
  scroller.addEventListener('pointerdown', onPointer);
  window.addEventListener('keydown', onKey);
  return () => {
    scroller.removeEventListener('wheel', onWheel);
    scroller.removeEventListener('touchmove', release);
    scroller.removeEventListener('pointerdown', onPointer);
    window.removeEventListener('keydown', onKey);
  };
}

/** Only a gesture of the reader stops the follow: a `scroll` event is also what the follow causes. */
export function useFollowPlayback(
  scrollerRef: RefObject<HTMLElement | null>,
  listening: boolean,
): FollowPlayback {
  const [following, setFollowing] = useState(true);
  const follow = useCallback(() => setFollowing(true), []);
  const release = useCallback(() => setFollowing(false), []);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !listening) return;
    return listenForGestures(scroller, release);
  }, [scrollerRef, listening, release]);
  return { following, follow, release };
}
```

`src/renderer/features/meetings/use-detail-view.ts`:

```ts
import { useCallback, useRef, useState, type RefObject } from 'react';
import type { TimestampHandler } from './Clarifications';
import { useFollowPlayback } from './use-follow-playback';
import { useTabScroll } from './use-tab-scroll';

export type DetailTab = 'notes' | 'transcript';

export interface Passage {
  sourceId: string;
  at: number;
  /** Grows at each note click, so the same passage flashes again. */
  key: number;
}

export interface TranscriptView {
  search: string;
  onSearch(value: string): void;
  following: boolean;
  onFollow(): void;
  onRelease(): void;
  scrollerRef: RefObject<HTMLDivElement | null>;
  passage: Passage | null;
  onBackToNotes(): void;
  onSeek(at: number): void;
}

export interface DetailView {
  tab: DetailTab;
  selectTab(next: DetailTab): void;
  scrollerRef: RefObject<HTMLDivElement | null>;
  anchorRef: RefObject<HTMLDivElement | null>;
  openPassage: TimestampHandler;
  transcript: TranscriptView;
}

/** Where reading resumes when the transcript opens: the passage asked for, else the turn playing. */
export function placeReading(scroller: HTMLElement): void {
  const turn =
    scroller.querySelector('[data-passage]') ?? scroller.querySelector('[aria-current="time"]');
  turn?.scrollIntoView({ block: 'nearest' });
}

/** The tabs, the transcript search, the follow and the note passage outlive a change of tab. */
export function useDetailView(playAt: (at: number) => void): DetailView {
  const [search, setSearch] = useState('');
  const [passage, setPassage] = useState<Passage | null>(null);
  const passages = useRef(0);
  const tabs = useTabScroll<DetailTab>('notes', (tab, scroller) => {
    if (tab === 'transcript' && following) placeReading(scroller);
  });
  const { following, follow, release } = useFollowPlayback(
    tabs.scrollerRef,
    tabs.tab === 'transcript',
  );
  const onSeek = useCallback(
    (at: number) => {
      follow();
      playAt(at);
    },
    [follow, playAt],
  );

  function selectTab(next: DetailTab): void {
    if (next !== 'transcript') setPassage(null);
    tabs.select(next);
  }

  const openPassage: TimestampHandler = (at, sourceId) => {
    passages.current += 1;
    setPassage({ sourceId, at, key: passages.current });
    onSeek(at);
    tabs.select('transcript');
  };

  return {
    tab: tabs.tab,
    selectTab,
    scrollerRef: tabs.scrollerRef,
    anchorRef: tabs.anchorRef,
    openPassage,
    transcript: {
      search,
      onSearch: setSearch,
      following,
      onFollow: follow,
      onRelease: release,
      scrollerRef: tabs.scrollerRef,
      passage,
      onBackToNotes: () => selectTab('notes'),
      onSeek,
    },
  };
}
```

`MeetingContent.tsx` becomes:

```tsx
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Segmented, tabId, type SegmentedOption } from '../../components/ui';
import type { DetailTab, DetailView } from './use-detail-view';

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
  view: Pick<DetailView, 'tab' | 'selectTab' | 'scrollerRef' | 'anchorRef'>;
}

interface DetailPanelProps {
  id: string;
  active: boolean;
  /** Stays mounted while hidden: the clarification draft must survive a tab change. */
  keepMounted?: boolean;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Both panels exist for aria-controls; the transcript only renders while it is shown.
function DetailPanel({ id, active, keepMounted = false, children }: DetailPanelProps) {
  const panel = useRef<HTMLDivElement>(null);

  // A panel with nothing to focus is itself reachable, so the keyboard can scroll it.
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    if (element.querySelector(FOCUSABLE)) element.removeAttribute('tabindex');
    else element.setAttribute('tabindex', '0');
  });

  return (
    <div
      ref={panel}
      role="tabpanel"
      id={id}
      aria-labelledby={tabId(id)}
      hidden={!active}
      className="detail-panel"
    >
      {(active || keepMounted) && children}
    </div>
  );
}

/** The one scroll of the card: the header scrolls away, the tab bar sticks, each tab keeps its place. */
export function MeetingContent({ header, notes, transcript, view }: MeetingContentProps) {
  return (
    <div className="detail-scroll" ref={view.scrollerRef}>
      <div className="detail-column">
        {header}
        <div ref={view.anchorRef} />
        <div className="detail-tabs">
          <Segmented
            label="Contenu de la réunion"
            options={tabs}
            value={view.tab}
            onChange={view.selectTab}
          />
        </div>
        <DetailPanel id={NOTES_PANEL} active={view.tab === 'notes'} keepMounted>
          {notes}
        </DetailPanel>
        <DetailPanel id={TRANSCRIPT_PANEL} active={view.tab === 'transcript'}>
          {transcript}
        </DetailPanel>
      </div>
    </div>
  );
}
```

`MeetingDetail.tsx`: remove the import of `TimestampHandler` and the `playSource` lines (35-36); add `import { useDetailView } from './use-detail-view';` and, after `const playback = useMediaPlayback(meeting);`, `const view = useDetailView(playback.playAt);`. The `<MeetingContent …>` element becomes:

```tsx
<MeetingContent
  header={header}
  view={view}
  notes={
    <NotesView
      meeting={meeting}
      currentTime={playback.clock.now}
      analyzing={actions.analyzing}
      saving={actions.saving}
      clarifyError={actions.clarifyError}
      onAnalyze={analyze}
      onSettings={props.onSettings}
      onTimestamp={view.openPassage}
      onClarify={actions.clarify}
    />
  }
  transcript={
    <Transcript
      meeting={meeting}
      clock={playback.clock}
      onSeek={view.transcript.onSeek}
      search={view.transcript.search}
      onSearch={view.transcript.onSearch}
    />
  }
/>
```

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/features/meetings src/renderer/App.detail.test.tsx
npm run check
```

Expected: PASS, including « keeps the tab and the draft when the poll hands over the same meeting ».

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings
git commit -m "feat: the detail view owns tabs, transcript search, follow and note passage across tab changes"
```

---

### Task 10: The transcript rewritten: selectable turns, parts, highlighted search

**Files:**

- Modify: `src/renderer/features/meetings/Transcript.tsx` (whole), `TranscriptTurn.tsx` (whole)
- Create: `src/renderer/features/meetings/TranscriptList.tsx`, `TranscriptSearchBar.tsx`, `TranscriptStates.tsx`
- Create: `src/renderer/features/meetings/transcript-harness.tsx`, `Transcript.search.test.tsx`
- Modify: `src/renderer/features/meetings/Transcript.test.tsx` (whole)
- Modify: `src/renderer/features/list/find-shortcut.ts:22-37`, `find-shortcut.test.tsx` (+ cases)
- Modify: `src/renderer/features/meetings/MeetingDetail.tsx` (transcript prop), `MeetingDetail.test.tsx:91`
- Modify: `docs/superpowers/specs/2026-10-13-main-window-redesign-design.md:147` (Keyboard row)

**Interfaces:**

- Consumes: `useStableTurns`, `transcriptRows`, `partStarts`, `activeTurnIndex`, `TranscriptRow`, `PartRow` (Task 5); `useTranscriptSearch`, `FoundMatches` (Task 6); `usePlaybackSelector`, `PlaybackClock`, `createPlaybackClock` (Task 8); `TranscriptView`, `Passage` (Task 9); `SpeakerLabel`, `SpeakerTone` (Task 4); `speakerName` (Task 2); `shortTimeLabel`; `TextRange` (Task 1).
- Produces:
  - `Transcript({ meeting: Meeting; analyzing: boolean; clock: PlaybackClock; view: TranscriptView; onAnalyze(): void })`;
  - `TranscriptTurn` (memoised) with props `{ turn: Turn; tone: SpeakerTone | null; labelled: boolean; active: boolean; matches: readonly TextRange[]; currentMatch: number; onSeek(at: number): void }`, rendering `<article aria-current="time">` when active and `<mark aria-current="true">` for the current match;
  - `TranscriptList({ rows, active, found, onSeek, ref })`; `TranscriptSearchBar({ found })`; `TranscriptWaiting()`; `TranscriptEmpty({ canAnalyze, onAnalyze })`;
  - `useFindShortcut(field, platform?, options?: { first?: boolean })`;
  - test helpers in `transcript-harness.tsx`: `meetingWith(transcript, extra?)`, `TranscriptHarness`, `handlers`, `recordScrolls()`, `turnOf(text)`.

Cmd+F: the list pane listens on `window` in the bubble phase (`find-shortcut.ts:34`). The transcript search registers in the capture phase with `{ first: true }` and calls `preventDefault`; every handler now returns early on `event.defaultPrevented`. The transcript field only exists while « Transcription » shows a transcript, so Cmd+F goes back to the list everywhere else, without any shared registry.

- [ ] **Step 1: Write the failing tests**

`src/renderer/features/meetings/transcript-harness.tsx`:

```tsx
// Shared by the transcript tests.
import { useState, type RefObject } from 'react';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { Meeting, Segment } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { createPlaybackClock, type PlaybackClock } from './playback-clock';
import { Transcript } from './Transcript';
import type { Passage, TranscriptView } from './use-detail-view';

const chunk = (index: number, start: number, duration = 600) => ({
  index,
  start,
  duration,
  transcript: [],
});

export function meetingWith(transcript: Segment[], extra: Partial<Meeting> = {}): Meeting {
  return meetingFixture('m1', 'Réunion', '2026-10-15T08:00:00Z', {
    status: 'ready',
    duration: 1300,
    audioChunks: [chunk(0, 0), chunk(1, 600), chunk(2, 1200, 100)],
    transcript,
    ...extra,
  });
}

export const handlers = {
  onSeek: vi.fn(),
  onFollow: vi.fn(),
  onRelease: vi.fn(),
  onBackToNotes: vi.fn(),
  onAnalyze: vi.fn(),
};

const NO_SCROLLER: RefObject<HTMLDivElement | null> = { current: null };

export interface HarnessProps {
  meeting: Meeting;
  clock?: PlaybackClock;
  analyzing?: boolean;
  following?: boolean;
  passage?: Passage | null;
  scroller?: RefObject<HTMLDivElement | null>;
}

export function TranscriptHarness(props: HarnessProps) {
  const [search, setSearch] = useState('');
  const [clock] = useState(() => props.clock ?? createPlaybackClock());
  const view: TranscriptView = {
    search,
    onSearch: setSearch,
    following: props.following ?? true,
    onFollow: handlers.onFollow,
    onRelease: handlers.onRelease,
    scrollerRef: props.scroller ?? NO_SCROLLER,
    passage: props.passage ?? null,
    onBackToNotes: handlers.onBackToNotes,
    onSeek: handlers.onSeek,
  };
  return (
    <Transcript
      meeting={props.meeting}
      analyzing={props.analyzing ?? false}
      clock={clock}
      view={view}
      onAnalyze={handlers.onAnalyze}
    />
  );
}

/** Records the element each scrollIntoView call moved, with its options. */
export function recordScrolls() {
  const scrolled = vi.fn<(element: Element, options?: boolean | ScrollIntoViewOptions) => void>();
  Element.prototype.scrollIntoView = function scrollIntoView(
    this: Element,
    options?: boolean | ScrollIntoViewOptions,
  ) {
    scrolled(this, options);
  };
  return scrolled;
}

export const turnOf = (text: string) => screen.getByText(text).closest('article');
```

`Transcript.test.tsx` becomes:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Segment } from '../../../shared/contracts';
import { meetingMarkdown } from './meeting-format';
import { createPlaybackClock } from './playback-clock';
import {
  handlers,
  meetingWith,
  recordScrolls,
  TranscriptHarness,
  turnOf,
} from './transcript-harness';

beforeEach(() => {
  recordScrolls();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const voices = meetingWith([
  { id: '0-0', start: 1, end: 3, text: 'Bonjour.', speaker: 'A' },
  { id: '0-1', start: 4, end: 6, text: 'Salut.', speaker: 'B' },
  { id: '1-0', start: 601, end: 603, text: 'Encore moi.', speaker: 'A' },
]);

it('labels each voice « Intervenant A » and marks each new part', () => {
  render(<TranscriptHarness meeting={voices} />);
  expect(screen.getAllByText('Intervenant A')).toHaveLength(2);
  expect(screen.getAllByText('Intervenant B')).toHaveLength(1);
  expect(screen.queryByText(/extrait/)).toBeNull();
  expect(screen.getByRole('heading', { name: 'Partie 2 · 10:00' })).toBeInTheDocument();
  expect(
    screen.getByText('Les intervenants sont identifiés séparément dans chaque partie.'),
  ).toBeInTheDocument();
  expect(meetingMarkdown(voices)).toContain('[10:01] Intervenant A (partie 2) : Encore moi.');
});

it('explains the parts once, under the first separator', () => {
  const three = meetingWith([
    ...voices.transcript,
    { id: '2-0', start: 1201, end: 1203, text: 'Fin.', speaker: 'B' },
  ]);
  render(<TranscriptHarness meeting={three} />);
  expect(screen.getByRole('heading', { name: 'Partie 3 · 20:00' })).toBeInTheDocument();
  expect(
    screen.getAllByText('Les intervenants sont identifiés séparément dans chaque partie.'),
  ).toHaveLength(1);
});

it('shows neither label, dot nor part without any speaker', () => {
  render(
    <TranscriptHarness
      meeting={meetingWith([
        { id: '0-0', start: 1, end: 3, text: 'Un.' },
        { id: '1-0', start: 601, end: 603, text: 'Deux.' },
      ])}
    />,
  );
  expect(screen.getByText('Un.')).toBeInTheDocument();
  expect(screen.queryByText(/Intervenant/)).toBeNull();
  expect(screen.queryByRole('heading', { name: /Partie/ })).toBeNull();
  expect(screen.queryByText(/identifiés séparément/)).toBeNull();
});

it('labels a single speaker and still marks the parts', () => {
  render(
    <TranscriptHarness
      meeting={meetingWith([
        { id: '0-0', start: 1, end: 3, text: 'Un.', speaker: 'A' },
        { id: '1-0', start: 601, end: 603, text: 'Deux.', speaker: 'A' },
      ])}
    />,
  );
  expect(screen.getAllByText('Intervenant A')).toHaveLength(2);
  expect(screen.getByRole('heading', { name: 'Partie 2 · 10:00' })).toBeInTheDocument();
});

it('réunit les paroles suivies d’un même intervenant en un seul passage', () => {
  render(
    <TranscriptHarness
      meeting={meetingWith([
        { id: '0-0', start: 1, end: 3, text: 'Bonjour à tous.', speaker: 'A' },
        { id: '0-1', start: 3, end: 6, text: 'On commence par le budget.', speaker: 'A' },
        { id: '0-2', start: 6, end: 9, text: 'D’accord.', speaker: 'B' },
      ])}
    />,
  );
  expect(screen.getByText('Bonjour à tous. On commence par le budget.')).toBeInTheDocument();
  expect(screen.getAllByText(/^Intervenant/)).toHaveLength(2);
});

it('continues a monologue cut at 900 characters without a new label', () => {
  const long: Segment[] = Array.from({ length: 12 }, (_segment, index) => ({
    id: `0-${index}`,
    start: index * 10,
    end: index * 10 + 10,
    text: `${index}${'x'.repeat(99)}`,
    speaker: 'A',
  }));
  render(<TranscriptHarness meeting={meetingWith(long)} />);
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.getAllByText('Intervenant A')).toHaveLength(1);
});

it('ramène la lecture au début du passage cliqué', async () => {
  render(<TranscriptHarness meeting={voices} />);
  await userEvent.click(screen.getByRole('button', { name: 'Lire à partir de 10:01' }));
  expect(handlers.onSeek).toHaveBeenCalledWith(601);
});

it('lets the text be selected: a turn is no button, its time is', () => {
  render(<TranscriptHarness meeting={voices} />);
  expect(screen.queryByRole('button', { name: /Bonjour/ })).toBeNull();
  expect(screen.getByText('Bonjour.').tagName).toBe('P');
  expect(screen.getByRole('button', { name: 'Lire à partir de 0:01' })).toBeInTheDocument();
});

it('marks the turn playing, and none in a silence', () => {
  const clock = createPlaybackClock(4.5);
  render(<TranscriptHarness meeting={voices} clock={clock} />);
  expect(turnOf('Salut.')).toHaveAttribute('aria-current', 'time');
  expect(turnOf('Bonjour.')).not.toHaveAttribute('aria-current');
  act(() => clock.set(10));
  expect(
    screen.getAllByRole('article').filter((turn) => turn.hasAttribute('aria-current')),
  ).toEqual([]);
});

it('waits for the transcript during the analysis', () => {
  render(<TranscriptHarness meeting={meetingWith([], { status: 'processing' })} analyzing />);
  expect(screen.getByText('La transcription arrive au fur et à mesure.')).toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).toBeNull();
});

it('keeps saying the transcript is coming while turns arrive', () => {
  render(<TranscriptHarness meeting={voices} analyzing />);
  expect(screen.getByText('Bonjour.')).toBeInTheDocument();
  expect(screen.getByText('La transcription arrive au fur et à mesure.')).toBeInTheDocument();
});

it('offers the analysis instead of a search when there is no transcript', async () => {
  render(<TranscriptHarness meeting={meetingWith([], { status: 'recorded' })} />);
  expect(screen.queryByRole('searchbox')).toBeNull();
  expect(screen.getByText('Pas encore de transcription')).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Transcrire et créer le compte rendu' }),
  );
  expect(handlers.onAnalyze).toHaveBeenCalledOnce();
});

it('cannot analyse without audio', () => {
  render(<TranscriptHarness meeting={meetingWith([], { status: 'recorded', audioChunks: [] })} />);
  expect(
    screen.getByRole('button', { name: 'Transcrire et créer le compte rendu' }),
  ).toBeDisabled();
  expect(screen.getByText('Aucun audio n’a été enregistré.')).toBeInTheDocument();
});

it('leaves a failed analysis to the band above the tabs', () => {
  const { container } = render(
    <TranscriptHarness meeting={meetingWith([], { status: 'error', error: 'Aucune parole.' })} />,
  );
  expect(container).toBeEmptyDOMElement();
});
```

`Transcript.search.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Segment } from '../../../shared/contracts';
import { meetingWith, recordScrolls, TranscriptHarness } from './transcript-harness';

let scrolled: ReturnType<typeof recordScrolls>;

beforeEach(() => {
  scrolled = recordScrolls();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const segment = (id: string, start: number, text: string, speaker = 'A'): Segment => ({
  id,
  start,
  end: start + 2,
  text,
  speaker,
});
const meeting = meetingWith([
  segment('0-0', 1, 'Bonjour.'),
  segment('0-1', 4, 'Salut, le budget.', 'B'),
  segment('0-2', 7, 'Le Café de l’Équipe et le budget.'),
  segment('0-3', 10, 'Budget validé.', 'B'),
]);
const field = () => screen.getByRole('searchbox', { name: 'Chercher dans la transcription' });
const marks = () => [...document.querySelectorAll('mark')];
const currentMark = () => document.querySelector('mark[aria-current="true"]');

it('keeps every passage and highlights the matches', async () => {
  render(<TranscriptHarness meeting={meeting} />);
  await userEvent.type(field(), 'salut');
  expect(screen.getByText('Bonjour.')).toBeVisible();
  expect(marks().map((mark) => mark.textContent)).toEqual(['Salut']);
  expect(screen.getByText('1 sur 1')).toBeInTheDocument();
});

it('ignores case and accents and highlights the text as written', async () => {
  render(<TranscriptHarness meeting={meeting} />);
  await userEvent.type(field(), "l'equipe");
  expect(marks().map((mark) => mark.textContent)).toEqual(['l’Équipe']);
});

it('says « Aucun résultat » when nothing matches', async () => {
  render(<TranscriptHarness meeting={meeting} />);
  await userEvent.type(field(), 'absent');
  expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Résultat suivant' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Résultat précédent' })).toBeDisabled();
});

it('goes through the matches with Enter, Shift+Enter and the arrows', async () => {
  const user = userEvent.setup();
  render(<TranscriptHarness meeting={meeting} />);
  await user.type(field(), 'budget');
  expect(screen.getByText('1 sur 3')).toBeInTheDocument();
  await user.keyboard('{Enter}');
  expect(screen.getByText('2 sur 3')).toBeInTheDocument();
  expect(currentMark()?.closest('p')).toHaveTextContent('Le Café de l’Équipe et le budget.');
  await user.keyboard('{Enter}{Enter}');
  expect(screen.getByText('1 sur 3')).toBeInTheDocument();
  await user.keyboard('{Shift>}{Enter}{/Shift}');
  expect(screen.getByText('3 sur 3')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Résultat précédent' }));
  expect(screen.getByText('2 sur 3')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Résultat suivant' }));
  expect(screen.getByText('3 sur 3')).toBeInTheDocument();
});

it('scrolls the current match into view', async () => {
  const user = userEvent.setup();
  render(<TranscriptHarness meeting={meeting} />);
  await user.type(field(), 'budget');
  await user.keyboard('{Enter}');
  expect(scrolled).toHaveBeenLastCalledWith(currentMark(), { block: 'nearest' });
});

it('clears the search with Escape and gives the focus back', async () => {
  const user = userEvent.setup();
  render(<TranscriptHarness meeting={meeting} />);
  const time = screen.getByRole('button', { name: 'Lire à partir de 0:01' });
  time.focus();
  await user.click(field());
  await user.keyboard('budget{Escape}');
  expect(field()).toHaveValue('');
  expect(marks()).toEqual([]);
  expect(time).toHaveFocus();
});

it('counts at most 500 matches', async () => {
  render(<TranscriptHarness meeting={meetingWith([segment('0-0', 1, 'a '.repeat(600))])} />);
  await userEvent.type(field(), 'a');
  expect(screen.getByText('1 sur 500+')).toBeInTheDocument();
  expect(marks()).toHaveLength(500);
});

it('keeps the current match when a poll brings text before and after it', async () => {
  const user = userEvent.setup();
  const later = [
    segment('1-0', 601, 'Le budget trois.'),
    segment('1-1', 604, 'Le budget quatre.', 'B'),
  ];
  const { rerender } = render(<TranscriptHarness meeting={meetingWith(later)} />);
  await user.type(field(), 'budget');
  expect(screen.getByText('1 sur 2')).toBeInTheDocument();
  await user.keyboard('{Enter}');
  expect(currentMark()?.closest('p')).toHaveTextContent('Le budget quatre.');
  rerender(
    <TranscriptHarness meeting={meetingWith([segment('0-0', 1, 'Le budget un.'), ...later])} />,
  );
  expect(screen.getByText('3 sur 3')).toBeInTheDocument();
  expect(currentMark()?.closest('p')).toHaveTextContent('Le budget quatre.');
  rerender(
    <TranscriptHarness
      meeting={meetingWith([
        segment('0-0', 1, 'Le budget un.'),
        ...later,
        segment('2-0', 1201, 'Le budget cinq.'),
      ])}
    />,
  );
  expect(screen.getByText('3 sur 4')).toBeInTheDocument();
  expect(currentMark()?.closest('p')).toHaveTextContent('Le budget quatre.');
});

it('keeps the first match current when the reader did not move and text arrives before it', async () => {
  const later = [segment('1-0', 601, 'Le budget trois.')];
  const { rerender } = render(<TranscriptHarness meeting={meetingWith(later)} />);
  await userEvent.type(field(), 'budget');
  rerender(
    <TranscriptHarness meeting={meetingWith([segment('0-0', 1, 'Le budget un.'), ...later])} />,
  );
  expect(screen.getByText('2 sur 2')).toBeInTheDocument();
  expect(currentMark()?.closest('p')).toHaveTextContent('Le budget trois.');
});
```

Append to `find-shortcut.test.tsx`:

```tsx
function BothSearches({ transcript }: { transcript: boolean }) {
  const list = useRef<HTMLInputElement>(null);
  useFindShortcut(list, 'mac');
  return (
    <>
      <input ref={list} type="search" aria-label="Rechercher une réunion" />
      {transcript && <TranscriptField />}
    </>
  );
}

function TranscriptField() {
  const field = useRef<HTMLInputElement>(null);
  useFindShortcut(field, 'mac', { first: true });
  return <input ref={field} type="search" aria-label="Chercher dans la transcription" />;
}

describe('two searches on screen', () => {
  it('gives Cmd+F to the transcript while it is shown, to the list otherwise', () => {
    const { rerender } = render(<BothSearches transcript />);
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(screen.getByRole('searchbox', { name: 'Chercher dans la transcription' })).toHaveFocus();
    rerender(<BothSearches transcript={false} />);
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(screen.getByRole('searchbox', { name: 'Rechercher une réunion' })).toHaveFocus();
  });
});
```

`MeetingDetail.test.tsx` line 91 becomes:

```tsx
expect(within(panel).getByText('Le budget.')).toBeInTheDocument();
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/features/meetings/Transcript.test.tsx src/renderer/features/meetings/Transcript.search.test.tsx src/renderer/features/list/find-shortcut.test.tsx`
Expected: FAIL (`Transcript` takes no `view`; no « Partie 2 · 10:00 »; turns are buttons; `useFindShortcut` ignores `{ first }` and the list field wins).

- [ ] **Step 3: Write the implementation**

`find-shortcut.ts`, `useFindShortcut` becomes:

```ts
interface FindShortcutOptions {
  /** Claims Cmd+F before the other listeners: the transcript search, while it is shown. */
  first?: boolean;
}

export function useFindShortcut(
  field: RefObject<HTMLInputElement | null>,
  platform = platformOf(navigator.platform),
  { first = false }: FindShortcutOptions = {},
): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const input = field.current;
      if (!input || event.defaultPrevented || !isFindShortcut(event, platform)) return;
      event.preventDefault();
      input.focus();
      input.select();
    }
    window.addEventListener('keydown', onKeyDown, { capture: first });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: first });
  }, [field, platform, first]);
}
```

`TranscriptTurn.tsx`:

```tsx
import { memo, type ReactNode } from 'react';
import { Play } from 'lucide-react';
import { SpeakerLabel, type SpeakerTone } from '../../components/ui';
import type { TextRange } from '../../search-text';
import { shortTimeLabel } from './detail-format';
import { speakerName } from './meeting-format';
import type { Turn } from './speaker-turns';

interface TranscriptTurnProps {
  turn: Turn;
  tone: SpeakerTone | null;
  labelled: boolean;
  active: boolean;
  matches: readonly TextRange[];
  /** Index in `matches` of the current search result, −1 when it is elsewhere. */
  currentMatch: number;
  onSeek(at: number): void;
}

function highlighted(text: string, matches: readonly TextRange[], current: number): ReactNode[] {
  const pieces: ReactNode[] = [];
  let from = 0;
  matches.forEach((range, index) => {
    if (range.start > from) pieces.push(text.slice(from, range.start));
    pieces.push(
      <mark key={range.start} aria-current={index === current ? 'true' : undefined}>
        {text.slice(range.start, range.end)}
      </mark>,
    );
    from = range.end;
  });
  if (from < text.length) pieces.push(text.slice(from));
  return pieces;
}

function turnClass(turn: Turn): string {
  const classes = ['transcript-turn'];
  if (turn.brief) classes.push('is-brief');
  if (turn.continuation) classes.push('is-continuation');
  return classes.join(' ');
}

function TranscriptTurnView(props: TranscriptTurnProps) {
  const { turn, tone, labelled, active, matches, currentMatch, onSeek } = props;
  const time = shortTimeLabel(turn.start);
  return (
    <article className={turnClass(turn)} aria-current={active ? 'time' : undefined}>
      {/* The only seek trigger: the text stays free for selection. */}
      <button
        type="button"
        className="transcript-time"
        aria-label={`Lire à partir de ${time}`}
        onClick={() => onSeek(turn.start)}
      >
        <time>{time}</time>
        <Play size={12} aria-hidden="true" />
      </button>
      <div className="transcript-body">
        {labelled && turn.speaker && tone && (
          <SpeakerLabel name={speakerName(turn.speaker)} tone={tone} />
        )}
        <p className="transcript-text">{highlighted(turn.text, matches, currentMatch)}</p>
      </div>
    </article>
  );
}

/** Memoised: a poll, a tick of the clock or a keystroke re-renders only the turns it changes. */
export const TranscriptTurn = memo(TranscriptTurnView);
```

`TranscriptList.tsx`:

```tsx
import type { Ref } from 'react';
import type { TextRange } from '../../search-text';
import { shortTimeLabel } from './detail-format';
import type { PartRow, TranscriptRow } from './transcript-rows';
import { TranscriptTurn } from './TranscriptTurn';
import type { FoundMatches } from './use-transcript-search';

// One shared empty array: a turn without match keeps the same prop across renders.
const NO_MATCHES: readonly TextRange[] = [];

interface TranscriptListProps {
  rows: readonly TranscriptRow[];
  active: number;
  found: FoundMatches;
  onSeek(at: number): void;
  ref?: Ref<HTMLDivElement>;
}

function PartSeparator({ row }: { row: PartRow }) {
  return (
    <div className="transcript-part">
      <h2 className="transcript-part-title">{`Partie ${row.part} · ${shortTimeLabel(row.start)}`}</h2>
      {row.first && (
        <p className="caption">Les intervenants sont identifiés séparément dans chaque partie.</p>
      )}
    </div>
  );
}

function currentIn(found: FoundMatches, turnId: string, ranges: readonly TextRange[]): number {
  const current = found.result.matches[found.current];
  if (!current || current.turnId !== turnId) return -1;
  return ranges.findIndex((range) => range.start === current.start);
}

export function TranscriptList({ rows, active, found, onSeek, ref }: TranscriptListProps) {
  return (
    <div className="transcript-turns" ref={ref}>
      {rows.map((row) => {
        if (row.kind === 'part') return <PartSeparator key={row.key} row={row} />;
        const matches = found.result.byTurn.get(row.turn.id) ?? NO_MATCHES;
        return (
          <TranscriptTurn
            key={row.key}
            turn={row.turn}
            tone={row.tone}
            labelled={row.labelled}
            active={row.index === active}
            matches={matches}
            currentMatch={currentIn(found, row.turn.id, matches)}
            onSeek={onSeek}
          />
        );
      })}
    </div>
  );
}
```

`TranscriptSearchBar.tsx`:

```tsx
import { useRef, type FocusEvent, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { Button } from '../../components/ui';
import { useFindShortcut } from '../list/find-shortcut';
import type { FoundMatches } from './use-transcript-search';

interface TranscriptSearchBarProps {
  found: FoundMatches;
}

function giveFocusBack(previous: HTMLElement | null, field: HTMLInputElement | null): void {
  if (previous?.isConnected) previous.focus();
  else field?.blur();
}

export function TranscriptSearchBar({ found }: TranscriptSearchBarProps) {
  const field = useRef<HTMLInputElement>(null);
  const before = useRef<HTMLElement | null>(null);
  // Shown, the transcript takes Cmd+F before the list pane (find-shortcut.ts).
  useFindShortcut(field, undefined, { first: true });
  const empty = found.result.matches.length === 0;

  function rememberFocus(event: FocusEvent<HTMLInputElement>): void {
    before.current = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      found.step(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    found.setQuery('');
    giveFocusBack(before.current, field.current);
  }

  return (
    <div className="transcript-search">
      <label className="search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={field}
          type="search"
          value={found.query}
          placeholder="Chercher dans la transcription…"
          aria-label="Chercher dans la transcription"
          onFocus={rememberFocus}
          onChange={(event) => found.setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </label>
      <span className="transcript-search-count" aria-live="polite">
        {found.label}
      </span>
      <Button
        variant="ghost"
        shape="round"
        aria-label="Résultat précédent"
        title="Résultat précédent"
        disabled={empty}
        onClick={() => found.step(-1)}
      >
        <ChevronUp size={16} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        shape="round"
        aria-label="Résultat suivant"
        title="Résultat suivant"
        disabled={empty}
        onClick={() => found.step(1)}
      >
        <ChevronDown size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}
```

`TranscriptStates.tsx`:

```tsx
import { Sparkles } from 'lucide-react';
import { Button, EmptyState } from '../../components/ui';

// Distinct from the notes prompt's id: both panels can be in the DOM at once.
const NO_AUDIO_ID = 'transcript-no-audio';

// Static: skeletons never animate. The lines come from the list pane sheet.
export function TranscriptWaiting() {
  return (
    <div className="transcript-waiting">
      <p className="caption">La transcription arrive au fur et à mesure.</p>
      <div className="notes-skeleton" aria-hidden="true">
        <span className="skeleton-line" />
        <span className="skeleton-line" />
        <span className="skeleton-line" />
        <span className="skeleton-line skeleton-line-short" />
      </div>
    </div>
  );
}

interface TranscriptEmptyProps {
  canAnalyze: boolean;
  onAnalyze(): void;
}

export function TranscriptEmpty({ canAnalyze, onAnalyze }: TranscriptEmptyProps) {
  return (
    <EmptyState title="Pas encore de transcription">
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
    </EmptyState>
  );
}
```

`Transcript.tsx`:

```tsx
import { useCallback, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { Meeting } from '../../../shared/contracts';
import { usePlaybackSelector, type PlaybackClock } from './playback-clock';
import { activeTurnIndex, partStarts, transcriptRows } from './transcript-rows';
import { TranscriptList } from './TranscriptList';
import { TranscriptSearchBar } from './TranscriptSearchBar';
import { TranscriptEmpty, TranscriptWaiting } from './TranscriptStates';
import type { TranscriptView } from './use-detail-view';
import { useStableTurns } from './use-stable-turns';
import { useTranscriptSearch } from './use-transcript-search';

interface TranscriptProps {
  meeting: Meeting;
  analyzing: boolean;
  clock: PlaybackClock;
  view: TranscriptView;
  onAnalyze(): void;
}

/** Moves to the current search result when it changes, not when the tab opens on it. */
function useCurrentMatchInView(list: RefObject<HTMLDivElement | null>, key: string | null): void {
  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (key === null) return;
    list.current?.querySelector('mark[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [list, key]);
}

function TranscriptReader({ meeting, analyzing, clock, view }: TranscriptProps) {
  const list = useRef<HTMLDivElement>(null);
  const turns = useStableTurns(meeting.transcript);
  const starts = useMemo(() => partStarts(meeting.audioChunks), [meeting.audioChunks]);
  const rows = useMemo(() => transcriptRows(turns, starts), [turns, starts]);
  const found = useTranscriptSearch(turns, view.search, view.onSearch);
  const playing = useCallback((at: number) => activeTurnIndex(turns, at), [turns]);
  // Re-renders when the active turn changes, not at every tick of the clock.
  const active = usePlaybackSelector(clock, playing);
  useCurrentMatchInView(list, found.currentKey);

  return (
    <div className="transcript">
      <TranscriptSearchBar found={found} />
      <TranscriptList ref={list} rows={rows} active={active} found={found} onSeek={view.onSeek} />
      {analyzing && <p className="caption">La transcription arrive au fur et à mesure.</p>}
    </div>
  );
}

export function Transcript(props: TranscriptProps) {
  const { meeting, analyzing, onAnalyze } = props;
  if (meeting.transcript.length > 0) return <TranscriptReader {...props} />;
  if (analyzing) return <TranscriptWaiting />;
  // A failed analysis speaks through the amber band above the tabs.
  if (meeting.status === 'error') return null;
  return <TranscriptEmpty canAnalyze={meeting.audioChunks.length > 0} onAnalyze={onAnalyze} />;
}
```

`MeetingDetail.tsx`: the `transcript` prop of `MeetingContent` becomes:

```tsx
        transcript={
          <Transcript
            meeting={meeting}
            analyzing={actions.analyzing}
            clock={playback.clock}
            view={view.transcript}
            onAnalyze={analyze}
          />
        }
```

Spec, list pane table, « Keyboard » row (line 147 on `main`), becomes: « Up and down change the selection and the detail follows. Cmd+F focuses the search; while « Transcription » shows a transcript, Cmd+F focuses the transcript search instead (`find-shortcut.ts`, `{ first: true }`). »

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/features src/renderer/App.detail.test.tsx src/renderer/App.list.test.tsx
npm run check
```

Expected: PASS. Check file sizes: `npx eslint src/renderer/features/meetings` reports no `max-lines`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features docs/superpowers/specs/2026-10-13-main-window-redesign-design.md
git commit -m "feat: selectable transcript with speaker colours, parts and highlighted search; Cmd+F goes to it"
```

---

### Task 11: Follow the playback in the transcript

**Files:**

- Create: `src/renderer/features/meetings/use-transcript-follow.ts`, `src/renderer/features/meetings/TranscriptPills.tsx`
- Create: `src/renderer/features/meetings/Transcript.follow.test.tsx`, `src/renderer/features/meetings/MeetingDetail.passage.test.tsx`
- Modify: `src/renderer/features/meetings/Transcript.tsx` (`TranscriptReader`, `useCurrentMatchInView`)

**Interfaces:**

- Consumes: `isOutOfView` (Task 7); `TranscriptView` (Task 9); `FollowPill` (Task 4); `placeReading` (Task 9, through `useDetailView`).
- Produces: `ACTIVE_TURN = '[aria-current="time"]'`; `useFollowActive(list: RefObject<HTMLDivElement | null>, active: number, following: boolean): void`; `useActiveOutOfView(scrollerRef: RefObject<HTMLElement | null>, list: RefObject<HTMLDivElement | null>, active: number): boolean`; `scrollToActive(list: HTMLElement | null): void`; `TranscriptPills({ showFollow: boolean; onFollow(): void; showBack: boolean; onBack(): void })`.

The `scroll` listener here only measures visibility for the pill; it never changes `following`. « Revenir au direct » scrolls even over a selection: it is the reader's explicit request.

- [ ] **Step 1: Write the failing tests**

`Transcript.follow.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createPlaybackClock } from './playback-clock';
import {
  handlers,
  meetingWith,
  recordScrolls,
  TranscriptHarness,
  turnOf,
} from './transcript-harness';

let scrolled: ReturnType<typeof recordScrolls>;

beforeEach(() => {
  scrolled = recordScrolls();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  document.getSelection()?.removeAllRanges();
});

const meeting = meetingWith([
  { id: '0-0', start: 1, end: 3, text: 'Bonjour.', speaker: 'A' },
  { id: '0-1', start: 4, end: 6, text: 'Salut.', speaker: 'B' },
  { id: '0-2', start: 7, end: 9, text: 'On commence.', speaker: 'A' },
]);

it('follows the playback onto the next turn, instantly', () => {
  const clock = createPlaybackClock(1);
  render(<TranscriptHarness meeting={meeting} clock={clock} />);
  act(() => clock.set(4.5));
  expect(scrolled).toHaveBeenLastCalledWith(turnOf('Salut.'), { block: 'nearest' });
});

it('does not move while the reader selects text, then follows again', () => {
  const clock = createPlaybackClock(1);
  render(<TranscriptHarness meeting={meeting} clock={clock} />);
  document.getSelection()?.selectAllChildren(screen.getByText('Bonjour.'));
  scrolled.mockClear();
  act(() => clock.set(4.5));
  expect(scrolled).not.toHaveBeenCalled();
  document.getSelection()?.removeAllRanges();
  act(() => clock.set(7.5));
  expect(scrolled).toHaveBeenLastCalledWith(turnOf('On commence.'), { block: 'nearest' });
});

it('does not move while the pointer is held in the transcript', () => {
  const clock = createPlaybackClock(1);
  render(<TranscriptHarness meeting={meeting} clock={clock} />);
  fireEvent.pointerDown(screen.getByText('Bonjour.'));
  scrolled.mockClear();
  act(() => clock.set(4.5));
  expect(scrolled).not.toHaveBeenCalled();
  fireEvent.pointerUp(window);
  act(() => clock.set(7.5));
  expect(scrolled).toHaveBeenCalled();
});

it('stays put when the reader left the follow', () => {
  const clock = createPlaybackClock(1);
  render(<TranscriptHarness meeting={meeting} clock={clock} following={false} />);
  scrolled.mockClear();
  act(() => clock.set(4.5));
  expect(scrolled).not.toHaveBeenCalled();
});

function placeActive(top: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect(
    this: Element,
  ) {
    const span = this.matches('[aria-current="time"]')
      ? { top, bottom: top + 60 }
      : { top: 0, bottom: 600 };
    return DOMRect.fromRect({ x: 0, y: span.top, width: 600, height: span.bottom - span.top });
  });
}

function scroller() {
  const element = document.createElement('div');
  document.body.append(element);
  return { current: element };
}

it('offers « Revenir au direct » when the turn playing is out of view, and goes back to it', async () => {
  placeActive(900);
  render(
    <TranscriptHarness
      meeting={meeting}
      clock={createPlaybackClock(4.5)}
      following={false}
      scroller={scroller()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Revenir au direct' }));
  expect(handlers.onFollow).toHaveBeenCalledOnce();
  expect(scrolled).toHaveBeenLastCalledWith(turnOf('Salut.'), { block: 'nearest' });
});

it('rechecks the pill when the reader scrolls back to the turn', () => {
  placeActive(900);
  const box = scroller();
  render(
    <TranscriptHarness
      meeting={meeting}
      clock={createPlaybackClock(4.5)}
      following={false}
      scroller={box}
    />,
  );
  expect(screen.getByRole('button', { name: 'Revenir au direct' })).toBeInTheDocument();
  vi.restoreAllMocks();
  placeActive(200);
  fireEvent.scroll(box.current);
  expect(screen.queryByRole('button', { name: 'Revenir au direct' })).toBeNull();
});

it('shows no pill while following, or while the turn playing is in view', () => {
  placeActive(900);
  const { unmount } = render(
    <TranscriptHarness meeting={meeting} clock={createPlaybackClock(4.5)} scroller={scroller()} />,
  );
  expect(screen.queryByRole('button', { name: 'Revenir au direct' })).toBeNull();
  unmount();
  vi.restoreAllMocks();
  placeActive(200);
  render(
    <TranscriptHarness
      meeting={meeting}
      clock={createPlaybackClock(4.5)}
      following={false}
      scroller={scroller()}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Revenir au direct' })).toBeNull();
});

it('leaves the follow when the reader moves to a search result', async () => {
  render(<TranscriptHarness meeting={meeting} />);
  await userEvent.type(
    screen.getByRole('searchbox', { name: 'Chercher dans la transcription' }),
    'salut',
  );
  expect(handlers.onRelease).toHaveBeenCalled();
});
```

`MeetingDetail.passage.test.tsx` (Task 12 appends to it):

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AudioChunk, Meeting } from '../../../shared/contracts';
import { apiFor, meetingFixture } from '../../test-api';
import { MeetingDetail } from './MeetingDetail';
import { recordScrolls, turnOf } from './transcript-harness';

let scrolled: ReturnType<typeof recordScrolls>;

beforeEach(() => {
  scrolled = recordScrolls();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const chunk = (index: number, start: number): AudioChunk => ({
  index,
  start,
  duration: 60,
  transcript: [],
});
const analysed = meetingFixture('m1', 'Revue produit', '2026-10-14T08:00:00Z', {
  status: 'ready',
  duration: 120,
  audioChunks: [chunk(0, 0), chunk(1, 60)],
  transcript: [
    { id: '0-0', start: 1, end: 3, text: 'Bonjour.', speaker: 'A' },
    { id: '1-0', start: 61, end: 63, text: 'Le budget.', speaker: 'A' },
  ],
  clarifications: [{ id: 'c1', at: 90, text: 'Le budget 2027.', createdAt: '' }],
  notes: {
    summary: 'On valide le budget.',
    keyPoints: [{ text: 'Budget validé', sourceIds: ['1-0'] }],
    decisions: [],
    actions: [],
    questions: [],
  },
});

function detail(shown: Meeting) {
  return (
    <MeetingDetail
      meeting={shown}
      api={apiFor([shown])}
      folders={[]}
      onUpdate={vi.fn()}
      onMove={vi.fn(async () => true)}
      onCreateFolder={vi.fn(async () => null)}
      onDeleted={vi.fn()}
      onSettings={vi.fn()}
    />
  );
}

function audio(): HTMLAudioElement {
  const element = document.querySelector('audio');
  if (!element) throw new Error('no audio element');
  return element;
}

it('places the turn playing when the transcript opens', async () => {
  const user = userEvent.setup();
  render(detail(analysed));
  fireEvent.loadedMetadata(audio());
  await user.click(screen.getByRole('button', { name: 'Lire' }));
  audio().currentTime = 1.5;
  fireEvent.timeUpdate(audio());
  await user.click(screen.getByRole('tab', { name: 'Transcription' }));
  expect(turnOf('Bonjour.')).toHaveAttribute('aria-current', 'time');
  expect(scrolled).toHaveBeenLastCalledWith(turnOf('Bonjour.'), { block: 'nearest' });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/features/meetings/Transcript.follow.test.tsx src/renderer/features/meetings/MeetingDetail.passage.test.tsx`
Expected: FAIL (no scroll on a turn change, no pill, `onRelease` never called). « places the turn playing when the transcript opens » may already pass through Task 9's `placeReading`: keep it, it pins the integration.

- [ ] **Step 3: Write the implementation**

`use-transcript-follow.ts`:

```ts
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { isOutOfView } from './follow-rules';

export const ACTIVE_TURN = '[aria-current="time"]';

export function scrollToActive(list: HTMLElement | null): void {
  list?.querySelector(ACTIVE_TURN)?.scrollIntoView({ block: 'nearest' });
}

// A held pointer or a selection inside the transcript: moving the text would break the copy.
function isReading(list: HTMLElement, pressed: boolean): boolean {
  if (pressed) return true;
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || !selection.anchorNode) return false;
  return list.contains(selection.anchorNode);
}

/** Keeps the turn playing in view, instantly, unless the reader left the follow or is selecting. */
export function useFollowActive(
  list: RefObject<HTMLDivElement | null>,
  active: number,
  following: boolean,
): void {
  const pressed = useRef(false);
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const press = () => {
      pressed.current = true;
    };
    const lift = () => {
      pressed.current = false;
    };
    element.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', lift);
    window.addEventListener('pointercancel', lift);
    return () => {
      element.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', lift);
      window.removeEventListener('pointercancel', lift);
    };
  }, [list]);

  useLayoutEffect(() => {
    const element = list.current;
    if (!element || !following || active < 0 || isReading(element, pressed.current)) return;
    scrollToActive(element);
  }, [list, active, following]);
}

function activeOutOfView(scroller: HTMLElement, list: HTMLElement): boolean {
  const turn = list.querySelector(ACTIVE_TURN);
  if (!turn) return false;
  const style = getComputedStyle(scroller);
  const insets = {
    top: Number.parseFloat(style.scrollPaddingTop) || 0,
    bottom: Number.parseFloat(style.scrollPaddingBottom) || 0,
  };
  return isOutOfView(turn.getBoundingClientRect(), scroller.getBoundingClientRect(), insets);
}

/** Whether the turn playing is out of view; the scroll event only measures, it never stops the follow. */
export function useActiveOutOfView(
  scrollerRef: RefObject<HTMLElement | null>,
  list: RefObject<HTMLDivElement | null>,
  active: number,
): boolean {
  const [outOfView, setOutOfView] = useState(false);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const element = list.current;
    if (!scroller || !element) return;
    const measure = () => setOutOfView(activeOutOfView(scroller, element));
    measure();
    scroller.addEventListener('scroll', measure, { passive: true });
    return () => scroller.removeEventListener('scroll', measure);
  }, [scrollerRef, list, active]);
  return outOfView;
}
```

`TranscriptPills.tsx`:

```tsx
import { FollowPill } from '../../components/ui';

interface TranscriptPillsProps {
  showFollow: boolean;
  onFollow(): void;
  showBack: boolean;
  onBack(): void;
}

/** Sticks to the bottom of the card above the player bar. */
export function TranscriptPills({ showFollow, onFollow, showBack, onBack }: TranscriptPillsProps) {
  if (!showFollow && !showBack) return null;
  return (
    <div className="transcript-pills">
      {showBack && <FollowPill label="Retour aux notes" onClick={onBack} />}
      {showFollow && <FollowPill label="Revenir au direct" onClick={onFollow} />}
    </div>
  );
}
```

`Transcript.tsx`: add imports

```ts
import { TranscriptPills } from './TranscriptPills';
import { scrollToActive, useActiveOutOfView, useFollowActive } from './use-transcript-follow';
```

`useCurrentMatchInView` takes the release and calls it after moving:

```ts
/** Moves to the current search result when it changes, not when the tab opens on it. */
function useCurrentMatchInView(
  list: RefObject<HTMLDivElement | null>,
  key: string | null,
  onRelease: () => void,
): void {
  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const mark = key === null ? null : list.current?.querySelector('mark[aria-current="true"]');
    if (!mark) return;
    mark.scrollIntoView({ block: 'nearest' });
    // Going to a result is a move of the reader: the playback must not pull the view back.
    onRelease();
  }, [list, key, onRelease]);
}
```

`TranscriptReader` becomes:

```tsx
function TranscriptReader({ meeting, analyzing, clock, view }: TranscriptProps) {
  const list = useRef<HTMLDivElement>(null);
  const turns = useStableTurns(meeting.transcript);
  const starts = useMemo(() => partStarts(meeting.audioChunks), [meeting.audioChunks]);
  const rows = useMemo(() => transcriptRows(turns, starts), [turns, starts]);
  const found = useTranscriptSearch(turns, view.search, view.onSearch);
  const playing = useCallback((at: number) => activeTurnIndex(turns, at), [turns]);
  // Re-renders when the active turn changes, not at every tick of the clock.
  const active = usePlaybackSelector(clock, playing);
  useCurrentMatchInView(list, found.currentKey, view.onRelease);
  useFollowActive(list, active, view.following);
  const outOfView = useActiveOutOfView(view.scrollerRef, list, active);

  function resume(): void {
    view.onFollow();
    scrollToActive(list.current);
  }

  return (
    <div className="transcript">
      <TranscriptSearchBar found={found} />
      <TranscriptList ref={list} rows={rows} active={active} found={found} onSeek={view.onSeek} />
      {analyzing && <p className="caption">La transcription arrive au fur et à mesure.</p>}
      <TranscriptPills
        showFollow={!view.following && outOfView}
        onFollow={resume}
        showBack={false}
        onBack={view.onBackToNotes}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/features/meetings
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings
git commit -m "feat: the transcript follows the playback, never under a selection, with « Revenir au direct »"
```

---

### Task 12: A note timestamp opens its passage

**Files:**

- Modify: `src/renderer/features/meetings/TranscriptTurn.tsx` (prop `passageKey`), `TranscriptList.tsx` (prop `passage`), `Transcript.tsx` (`TranscriptReader`)
- Create: `src/renderer/features/meetings/Transcript.passage.test.tsx`
- Modify: `src/renderer/features/meetings/MeetingDetail.passage.test.tsx` (cases appended)

**Interfaces:**

- Consumes: `passageTurn` (Task 5); `Passage`, `TranscriptView.passage`, `onBackToNotes`, `openPassage` (Task 9); `TranscriptPills` (Task 11).
- Produces: `TranscriptTurn` prop `passageKey: number` (0 when not the passage; a new value replays the flash) rendering `data-passage` on the article and a keyed `<span className="transcript-turn-flash" aria-hidden="true">`; `TranscriptList` prop `passage: { index: number; key: number }`.

The flash is an overlay keyed by `passage.key`, so a second click on the same note remounts it and the CSS animation plays again without touching the turn (its selection and memo survive). `data-passage` is what `placeReading` (Task 9) scrolls to when the tab opens.

- [ ] **Step 1: Write the failing tests**

`Transcript.passage.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  handlers,
  meetingWith,
  recordScrolls,
  TranscriptHarness,
  turnOf,
} from './transcript-harness';

beforeEach(() => {
  recordScrolls();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const meeting = meetingWith([
  { id: '0-0', start: 1, end: 3, text: 'Bonjour.', speaker: 'A' },
  { id: '0-1', start: 3, end: 5, text: 'On commence.', speaker: 'A' },
  { id: '0-2', start: 5, end: 8, text: 'Salut.', speaker: 'B' },
]);
const marked = () =>
  screen.getAllByRole('article').filter((turn) => turn.hasAttribute('data-passage'));

it('marks the passage reached from a note and offers the way back', async () => {
  render(<TranscriptHarness meeting={meeting} passage={{ sourceId: '0-2', at: 5, key: 1 }} />);
  expect(marked()).toEqual([turnOf('Salut.')]);
  await userEvent.click(screen.getByRole('button', { name: 'Retour aux notes' }));
  expect(handlers.onBackToNotes).toHaveBeenCalledOnce();
});

it('finds the turn of a segment merged into a longer turn', () => {
  render(<TranscriptHarness meeting={meeting} passage={{ sourceId: '0-1', at: 3, key: 1 }} />);
  expect(marked()).toEqual([turnOf('Bonjour. On commence.')]);
});

it('marks the turn at the time of a clarification', () => {
  render(
    <TranscriptHarness
      meeting={meeting}
      passage={{ sourceId: 'clarification:c1', at: 6, key: 1 }}
    />,
  );
  expect(marked()).toEqual([turnOf('Salut.')]);
});

it('marks nothing when no turn holds the moment, and still offers the way back', () => {
  render(
    <TranscriptHarness
      meeting={meeting}
      passage={{ sourceId: 'clarification:c2', at: 90, key: 1 }}
    />,
  );
  expect(marked()).toEqual([]);
  expect(screen.getByRole('button', { name: 'Retour aux notes' })).toBeInTheDocument();
});

it('shows no way back without a passage', () => {
  render(<TranscriptHarness meeting={meeting} />);
  expect(screen.queryByRole('button', { name: 'Retour aux notes' })).toBeNull();
});
```

Append to `MeetingDetail.passage.test.tsx`:

```tsx
it('opens the passage of a note in an extract that is not loaded, then goes back to the notes', async () => {
  const user = userEvent.setup();
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  render(detail(analysed));
  const scroller = document.querySelector<HTMLElement>('.detail-scroll');
  if (!scroller) throw new Error('no scroll container');
  scroller.scrollTop = 300;
  await user.click(screen.getByRole('button', { name: 'Écouter à 1:01' }));
  expect(screen.getByRole('tab', { name: 'Transcription' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // The extract is still loading: the turn is marked and placed already.
  expect(audio()).toHaveAttribute('src', 'meeting-media://local/m1/audio/1');
  expect(turnOf('Le budget.')).toHaveAttribute('aria-current', 'time');
  expect(turnOf('Le budget.')).toHaveAttribute('data-passage');
  expect(scrolled).toHaveBeenLastCalledWith(turnOf('Le budget.'), { block: 'nearest' });
  fireEvent.loadedMetadata(audio());
  expect(audio().currentTime).toBe(1);
  expect(play).toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Retour aux notes' }));
  expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
  expect(scroller.scrollTop).toBe(300);
});

it('opens a clarification time no turn holds, plays it and marks nothing', async () => {
  const user = userEvent.setup();
  render(detail(analysed));
  await user.click(screen.getByRole('button', { name: 'Écouter à 1:30' }));
  expect(screen.getByRole('tab', { name: 'Transcription' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(
    screen.getAllByRole('article').filter((turn) => turn.hasAttribute('data-passage')),
  ).toEqual([]);
  expect(screen.getByRole('button', { name: 'Retour aux notes' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mettre en pause' })).toBeInTheDocument();
});
```

And append to `Transcript.passage.test.tsx`:

```tsx
it('replays the flash for the same passage asked again, without remounting the turn', () => {
  const { rerender } = render(
    <TranscriptHarness meeting={meeting} passage={{ sourceId: '0-2', at: 5, key: 1 }} />,
  );
  const turn = turnOf('Salut.');
  const first = turn?.firstElementChild;
  rerender(<TranscriptHarness meeting={meeting} passage={{ sourceId: '0-2', at: 5, key: 2 }} />);
  expect(turnOf('Salut.')).toBe(turn);
  expect(turn?.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  expect(turn?.firstElementChild).not.toBe(first);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/features/meetings/Transcript.passage.test.tsx src/renderer/features/meetings/MeetingDetail.passage.test.tsx`
Expected: FAIL (no `data-passage`, no « Retour aux notes »).

- [ ] **Step 3: Write the implementation**

`TranscriptTurn.tsx`: add to the props

```ts
/** 0 when this is not the passage reached from a note; a new value replays the flash. */
passageKey: number;
```

destructure `passageKey` in `TranscriptTurnView`, and the article becomes:

```tsx
    <article
      className={turnClass(turn)}
      aria-current={active ? 'time' : undefined}
      data-passage={passageKey > 0 ? '' : undefined}
    >
      {passageKey > 0 && <span key={passageKey} className="transcript-turn-flash" aria-hidden="true" />}
```

(the rest of the article is unchanged).

`TranscriptList.tsx`: add to the props `passage: { index: number; key: number };`, destructure it, and pass to each turn:

```tsx
            passageKey={row.index === passage.index ? passage.key : 0}
```

`Transcript.tsx`: add `passageTurn` to the `transcript-rows` import and, in `TranscriptReader` after `const rows = …`:

```tsx
const passage = useMemo(
  () => ({
    index: view.passage ? passageTurn(turns, view.passage) : -1,
    key: view.passage?.key ?? 0,
  }),
  [turns, view.passage],
);
```

pass `passage={passage}` to `<TranscriptList>`, and `showBack={view.passage !== null}` to `<TranscriptPills>`.

- [ ] **Step 4: Run the tests and the project checks**

```bash
npx vitest run src/renderer/features/meetings
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/meetings
git commit -m "feat: a note timestamp plays, opens and flashes its passage, with « Retour aux notes »"
```

---

### Task 13: 1 000 turns, measured

**Files:**

- Create: `src/renderer/features/meetings/Transcript.performance.test.tsx`

**Interfaces:**

- Consumes: `TranscriptHarness`, `meetingWith`, `recordScrolls` (Task 10); `createPlaybackClock` (Task 8); `shortTimeLabel` (called exactly once per `TranscriptTurn` render, and by no other component in a single-part transcript).
- Produces: nothing new; pins Review Focus 1.

The count goes through a spy on `shortTimeLabel`, mocked for this file only: every render of a turn calls it once, and a single-part transcript has no separator calling it.

- [ ] **Step 1: Write the test**

`Transcript.performance.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Segment } from '../../../shared/contracts';
import { shortTimeLabel } from './detail-format';
import { createPlaybackClock } from './playback-clock';
import { meetingWith, recordScrolls, TranscriptHarness } from './transcript-harness';

vi.mock('./detail-format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./detail-format')>();
  return { ...actual, shortTimeLabel: vi.fn(actual.shortTimeLabel) };
});

beforeEach(() => {
  recordScrolls();
});

afterEach(cleanup);

const turnRenders = () => vi.mocked(shortTimeLabel).mock.calls.length;

// 1 000 turns in one part: two voices alternate, so every segment is its own turn.
const segments: Segment[] = Array.from({ length: 1000 }, (_segment, index) => ({
  id: `0-${index}`,
  start: index * 5,
  end: index * 5 + 5,
  text: index % 100 === 0 ? `Point budget ${index}.` : `Phrase ${index} de la réunion.`,
  speaker: index % 2 ? 'B' : 'A',
}));
const long = meetingWith(segments, { duration: 5000, audioChunks: [] });
const copy = () =>
  meetingWith(
    segments.map((segment) => ({ ...segment })),
    { duration: 5000, audioChunks: [] },
  );

it('renders each of 1 000 turns once, and none again for a poll with equal segments', () => {
  vi.mocked(shortTimeLabel).mockClear();
  const { rerender } = render(<TranscriptHarness meeting={long} />);
  expect(turnRenders()).toBe(1000);
  rerender(<TranscriptHarness meeting={copy()} />);
  expect(turnRenders()).toBe(1000);
});

it('renders only the new turn when a poll adds a segment', () => {
  const { rerender } = render(<TranscriptHarness meeting={long} />);
  vi.mocked(shortTimeLabel).mockClear();
  const more = meetingWith(
    [...segments, { id: '0-1000', start: 5000, end: 5005, text: 'Dernier mot.', speaker: 'A' }],
    { duration: 5005, audioChunks: [] },
  );
  rerender(<TranscriptHarness meeting={more} />);
  expect(turnRenders()).toBe(1);
});

it('renders no turn for a tick inside a turn, and two when the turn changes', () => {
  const clock = createPlaybackClock(2500);
  render(<TranscriptHarness meeting={long} clock={clock} />);
  vi.mocked(shortTimeLabel).mockClear();
  act(() => clock.set(2501));
  act(() => clock.set(2502.5));
  expect(turnRenders()).toBe(0);
  act(() => clock.set(2505));
  expect(turnRenders()).toBe(2);
});

it('renders only the turns that gain or lose a match while typing', async () => {
  render(<TranscriptHarness meeting={long} />);
  vi.mocked(shortTimeLabel).mockClear();
  await userEvent.type(
    screen.getByRole('searchbox', { name: 'Chercher dans la transcription' }),
    'budget',
  );
  // « b », « bu »… each keystroke touches the ten « Point budget » turns at most.
  expect(turnRenders()).toBeLessThanOrEqual(10 * 'budget'.length);
  expect(screen.getByText('1 sur 10')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/renderer/features/meetings/Transcript.performance.test.tsx`
Expected: PASS. If a count is higher, find the prop that changes identity (React DevTools « Why did this render? » or a temporary `console.log` of changed props in `TranscriptTurnView`), fix the source (unstable callback, new array, new turn object), and do not loosen the expectation.

- [ ] **Step 3: Project checks**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/features/meetings/Transcript.performance.test.tsx
git commit -m "test: 1 000 turns re-render only what a poll, a tick or a keystroke changes"
```

---

### Task 14: Verification

- [ ] **Step 1: Leftovers**

```bash
grep -rnE "extrait \\$\\{|· extrait|Aucun passage ne contient|La transcription commence avec|l’onglet Notes|function matching|playback\\.at\\b|at=\\{playback|INITIAL_VIEW, PlaybackController|transcript-turn\\.active|playSource" src/renderer
```

Expected: no output.

- [ ] **Step 2: Project checks**

Run: `npm run check`. Copy the summary lines (files, tests) into the report.

- [ ] **Step 3: Look at the real app**

`npm run dev` on macOS, in light and in dark (Réglages → Apparence), with reduced motion and increased contrast on, on the longest analysed meeting available:

- the transcript reads as text: no card per turn, the active turn alone on a grey ground; drag-select across three turns and paste in a text editor: no times;
- hovering a turn shows ▶ in place of its time; Tab reaches the time buttons in order, ▶ shows on focus; Enter plays from there;
- speakers: dot and label in four distinct colours, never the blue accent nor the red, amber or green of the statuses; « Partie 2 · 10:00 » between extracts, the sentence under the first one only; a meeting analysed locally (no diarisation) shows no label and no separator;
- search « budget »: every turn stays, matches highlighted, the current one stronger, « 3 sur 12 »; Enter, Shift+Enter, ↑/↓; « Aucun résultat »; Escape empties the field and gives the focus back; Cmd+F on « Transcription » goes to this field, on « Notes » to the list search;
- play: the active turn follows without any jump while the reader keeps still; scroll with the trackpad: the follow stops, « Revenir au direct » appears once the turn playing leaves the view, and brings it back; select text during playback: nothing moves until the selection is gone;
- in « Notes », click a timestamp in a later extract: « Transcription » opens on the turn, which flashes in the accent tint then settles on the active ground (still flashing with reduced motion, colour only); « Retour aux notes » brings the notes back where they were;
- the sticky search sits under the tab bar; a turn reached by Enter or by the follow is never hidden behind it;
- during an analysis: « La transcription arrive au fur et à mesure. » and four static skeleton lines, then the turns arrive without the view jumping; a meeting not analysed shows « Pas encore de transcription » and the analysis button.

- [ ] **Step 4: Measure on 1 000+ turns**

On a meeting of one hour or more (about 1 000 turns), DevTools → Performance, 10 s of playback including a 2 s poll (an analysis running on another meeting keeps the poll on): record the longest task, the commit of a turn change and the commit of a poll; target under 16 ms each, no layout of the off-screen turns (`content-visibility`). Then type a six-letter word in the search and record the longest keystroke task. If no such meeting exists, write « not measured in the app; render counts pinned by `Transcript.performance.test.tsx` ».

- [ ] **Step 5: Report**

Commits, check summary, the measurements of Step 4, deviations with file and line, anything not seen in the real app.
