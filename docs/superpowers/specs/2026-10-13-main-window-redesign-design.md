# Main window redesign

Status: draft, awaiting owner review. Date: 2026-10-13.

## Goal

The main window becomes a dark, native macOS app in two panes. On the left, a translucent pane holds the search, the folder filters and the meetings grouped by date: the list is the navigation. On the right, an opaque card holds the selected meeting, with Notes and Transcription in one reading column.

The motion is rebuilt on one curve and three durations. The transcript becomes readable, selectable and searchable.

## Non-goals

- Chat and "ask about this meeting".
- Any data model change: folders stay folders (no tags), action items get no checkbox, speakers cannot be renamed.
- The capture mechanics. The menu bar panel spec moves the session into the main process later. This redesign restyles the recording screen only.
- A light theme.

## Why

An audit of the current renderer, read from the code (file and line references are in the audit, not repeated here):

- No native chrome: system title bar plus a 58 px custom top bar, and the whole document scrolls, sidebar included.
- About 102 hard-coded colours (18 near-identical greys), 22 font sizes, 14 radii, 16 gaps, 10 durations, for one CSS token.
- "À analyser", "Analyse en cours" and "À reprendre" render as the same grey; only "ready" and "recording" have styles.
- The recording waveform spans have no width or background, so the level is very likely invisible; the live dot has no style either.
- The whole app shell slides 8 px on every launch, then the library replays a 410 ms cascade on every return and on search. Nothing else animates: no dialog, no view change, no hover or press.
- The transcript is a list of buttons, so its text cannot be selected; search filters out context; auto-scroll fights manual scrolling; 1000+ turns re-render about four times a second.
- Five marketing slogans on the main screen, "local" said four times.

## Decisions taken while writing this spec

1. **Dark values go straight onto `:root`** in the first step. There is no light theme, so no theme class and no later switch.
2. **This redesign ships before the menu bar panel.** It creates the tokens and the shared pieces the panel spec relies on: `Button` sizes and pill shape, `Notice` tones, `LevelMeter`, `SpeakerLabel`, `FollowPill`.
3. **Until the panel's capture host lands**, the list stays locked during a recording, as today, and the recording preview stays the live stream.
4. **Durations are 120, 200 and 220 ms only**, one curve (`--ease-out`), no exit animation. 220 ms is reserved for content arriving.
5. **One CSS shadow**, `--shadow-float`, for what floats in the DOM (dialogs, popovers, floating notice). Everything else is separated by borders.
6. **Window options are checked with a throwaway build** before step 3 commits to them.

## Layout

```
Window 1320×870 (min 900×650), vibrancy behind everything, no separate title bar
┌──────────────────────────┬──────────────────────────────────────────────┐
│ ● ● ●  [ Rechercher…   ] │ ╭──────────────────────────────────────────╮ │
│ drag 52px (field no-drag)│ │ drag 52px                                │ │
│ [tag] Tous Acme Interne +│ │ Titre de la réunion            24/600    │ │
│ ──────────────────────── │ │ Acme · 12 oct. 2026 · 52 min             │ │
│ Aujourd'hui              │ │ [      Notes | Transcription          ]  │ │
│ ▌Revue produit      14:32│ │ (one 680 px column, ONE scroll)          │ │
│  Résumé sur deux lignes… │ │                                          │ │
│ Hier                     │ │                                          │ │
│  Point hebdo         Hier│ ├──────────────────────────────────────────┤ │
│  ○ À analyser            │ │ [▶] 04:12 ──●──── 52:10  (copy|export|del)│ │
│ (réglages)[Démarrer l'enr.]│╰──────────────────────────────────────────╯ │
└──────────────────────────┴──────────────────────────────────────────────┘
 Left: clamp(280px, 25vw, 360px), translucent     Right: card, 8 px margin, radius 16
```

| Zone              | Behaviour                                                                               |
| ----------------- | --------------------------------------------------------------------------------------- |
| `html`, `body`    | `overflow: hidden; height: 100%`. The document never scrolls.                           |
| Left header       | Fixed, 52 px, drag region; the search field is `no-drag`.                               |
| Left filters      | Fixed, 32 px, horizontal scroll with an edge mask.                                      |
| Left list         | The only scrolling area on the left.                                                    |
| Left footer       | Fixed, 56 px: round settings button, pill "Démarrer l'enregistrement".                  |
| Right header band | 52 px drag region.                                                                      |
| Right content     | One scroll container, replacing the nested 62vh frame. The segmented control is sticky. |
| Right footer      | Fixed, 56 px: player on the left, action pill on the right. No chat field.              |

Removed: `Sidebar`, `.topbar`, `.workspace-footer`, the Library page (eyebrow, `h1`, subtitle, intro strip, folder row, toolbar), the five slogans.

Window options, macOS, to confirm by the throwaway build: `titleBarStyle: 'hiddenInset'`, `trafficLightPosition: { x: 16, y: 18 }`, `vibrancy: 'sidebar'`, `visualEffectState: 'active'`, `backgroundColor: '#00000000'`, no `transparent`, `show: false` until `ready-to-show`. In full screen the traffic lights disappear and `--traffic-inset` drops to 0. Windows and Linux keep the default frame, an opaque `#0f1117` background (`--color-bg`, pinned by `design-tokens.test.ts`) and no vibrancy. On macOS the transparent background replaces that pin, and the test changes with it.

## Screens

French labels below are the exact UI copy. Global notices float at the bottom of the right card, absolutely positioned, so nothing shifts.

### List pane

| Decision   | Value                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Groups     | « Aujourd'hui », « Hier », « Cette semaine », « Ce mois-ci », then « Septembre 2026 » and so on, from a pure `groupByDate(meetings, now)`. Heading 12/600, subtle, no uppercase.                                                                       |
| Row date   | Today `14:32`, yesterday « Hier », else `11 oct.`, other year `11 oct. 2025`, `Intl` `fr-CH`.                                                                                                                                                          |
| Row        | Padding 8×12, radius 12, no icon, no arrow. Rest transparent, hover `--color-surface`, selected `--color-surface-raised`. Title 14/600, two-line summary 12, folder chip only if any.                                                                  |
| Status     | Ready: no marker, the summary shows. « À analyser »: hollow subtle dot. « Analyse en cours »: accent dot and a 2 px `scaleX` progress line. « À reprendre »: amber dot, never red. « Enregistrement »: live dot. The status replaces the summary line. |
| Search     | Title and summary, on the current filter. With no result under a folder: link « Chercher dans toutes les réunions ».                                                                                                                                   |
| Folders    | Chips « Tous », one per folder, « Sans dossier » (now selectable), « + » for an inline « Nom du dossier » field. The selected chip opens a menu « Renommer », « Supprimer… ».                                                                          |
| Filing     | Drag a row onto a chip, or use the folder control in the detail header. The per-row `<select>` disappears.                                                                                                                                             |
| Keyboard   | Up and down change the selection and the detail follows. Cmd+F focuses the search; while « Transcription » shows a transcript, Cmd+F focuses the transcript search instead (`find-shortcut.ts`, `{ first: true }`).                                    |
| First load | The most recent meeting is selected, so the right card is never empty.                                                                                                                                                                                 |

States: five static skeleton rows while loading; « Aucune réunion » with an empty state on the right (« Enregistrez votre première réunion », no extra button); « Aucune réunion pour « … » »; on error a floating notice « Impossible de charger vos réunions. » with « Réessayer », keeping the last data.

### Meeting detail

| Element         | Decision                                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header          | Title 24/600, then one line: folder chip, date, duration, status. No summary sentence under the title, it would repeat « Résumé ».                                      |
| Folder          | « Acme ⌄ » or « Ajouter à un dossier… », one `Select`: « Sans dossier », the folders, « Nouveau dossier… ».                                                             |
| Analysis        | A 2 px line at the top of the card and « Analyse en cours · 3 segments sur 12 » in the meta line. No layout shift, no second message.                                   |
| Segmented       | « Notes » / « Transcription », full width, `tablist` with arrow keys, `aria-controls` and panels. Each tab keeps its scroll position.                                   |
| Notes           | « Résumé », « Points clés », « Décisions », « Actions », « À clarifier ». One 680 px column, 32 px between sections. Plain bullets for actions.                         |
| Timestamps      | `[4:12]` at the end of the line, 12 px tabular. Every source is shown (the current `slice(0, 3)` drops the rest silently).                                              |
| Timestamp click | Plays from there, switches to « Transcription », highlights the turn, shows « Retour aux notes » which restores the notes position.                                     |
| Clarifications  | « Ajouter une précision » opens a textarea « Votre précision », a « Moment » field in `mm:ss` prefilled with the playback position, and « Ajouter ».                    |
| Footer          | Player (play, position, duration, progress) and an action pill: « Copier les notes », « Exporter », « Supprimer la réunion ».                                           |
| Video           | When present, a 16:9 block (max height 240, radius 12) at the top of the content, driven by the footer player. The « Passage audio » `<select>` disappears.             |
| Delete          | `ConfirmDialog`: « Supprimer cette réunion ? », « Les notes et les enregistrements locaux seront supprimés. Cette action est définitive. », « Annuler », « Supprimer ». |

States: when not analysed yet, « Prêt pour l'analyse. » with « Transcrire et créer le compte rendu », disabled with « Aucun audio n'a été enregistré. » when there is no audio; analysis failure as an amber band « L'analyse n'a pas abouti. » with « Réessayer l'analyse »; media failure as « Ce passage ne peut pas être lu. ».

### Transcript

```
 [▶ 12:04]  ● Intervenant A          (12/600, 6 px dot in the speaker colour)
            Selectable text, 14/1.6, a continuous paragraph…
 ─── Partie 2 · 10:00 ───
 [ 0:31]  ● Intervenant B  Oui, d'accord.    (brief turn on one line)
```

| Topic        | Decision                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Time column  | 48 px button, 12 px tabular; it turns into a play icon on hover or focus. It is the only seek trigger, so the text is free for selection.                                                                                                                                                                                                                        |
| Text         | A plain `<p>` with `user-select: text`; timestamps are `user-select: none`, so a copy holds no times.                                                                                                                                                                                                                                                            |
| Background   | No card per turn. Only the active turn gets `--color-surface`, radius 12, 120 ms.                                                                                                                                                                                                                                                                                |
| Continuation | A turn split at 900 characters for the same speaker shows no new label and a 4 px gap.                                                                                                                                                                                                                                                                           |
| Speakers     | « Intervenant A », without « · extrait N ». Dot and label in `--color-speaker-1..4`, cycling; body text in one colour. Never the accent or a semantic colour.                                                                                                                                                                                                    |
| Parts        | Labels are assigned chunk by chunk, so a discreet « Partie 2 · 10:00 » separator marks each chunk change. The first one carries « Les intervenants sont identifiés séparément dans chaque partie. »                                                                                                                                                              |
| Export       | `speakerLabel` becomes « Intervenant A (partie 2) », shared by the exported Markdown.                                                                                                                                                                                                                                                                            |
| Search       | No filtering: every turn stays, matches are highlighted with `<mark>`, the current one stronger, capped at 500. Case and accent insensitive. Enter / Shift+Enter or arrows, counter « 3 sur 12 » (polite live region), « Aucun résultat ». Escape clears.                                                                                                        |
| Follow       | `following` starts true and turns false only on an explicit gesture (wheel, touch, scroll keys, scrollbar pointer), never on the `scroll` event. When false and the active turn is out of view, the pill « Revenir au direct » appears. A timestamp click re-enables it. Instant `scrollIntoView({ block: 'nearest' })` with scroll padding for the sticky bars. |
| Performance  | Active turn by binary search on sorted starts. `TranscriptTurn` memoised with stable references across polls. Playback time read through a small external store by the transcript and the player only. `content-visibility: auto` per turn, no virtualisation library; to measure on 1000+ turns.                                                                |

Shared with the panel's `LiveTurn`: `SpeakerLabel` and `FollowPill` in `components/`, the 12/600 label and 14 px text. Distinct: live turns have tracks, revisions, the 220 ms entrance and the log role; batch turns have the time column, selection, search, active turn and parts.

### Recording

The timer dominates (48/600 tabular, above the 24/600 title). One accent button, « Terminer la réunion »; « Pause » is secondary. A static live dot, never pulsing; paused shows « En pause » in amber and « Reprendre ». `LevelMeter` replaces the 37-bar waveform; after 10 s of silence an amber notice « Aucun son détecté. Vérifiez votre micro. ». Mood copy is removed. Finalizing shows « Finalisation… » and an indeterminate 2 px line, then fades to the detail in 200 ms. On error: « L'enregistrement s'est interrompu. Ce qui a été capturé est conservé. » with « Ouvrir la réunion ».

### Dialogs

New meeting: title field « Titre de la réunion » with inline « Titre requis », source chips (« Microphone », « Écran », « Son du système »), the source list capped at 220 px, a switch « Lancer l'analyse à l'arrêt » with one caption, and a fixed footer « Annuler » / « Commencer l'enregistrement » at content width. Source change: « Changer la source capturée », « La réunion et le son continuent pendant le changement. », footer « Annuler » / « Utiliser cette source ». Both show skeletons while loading, an empty message with « Actualiser », and errors inside the dialog.

### Settings

Three groups in the right card, 680 px wide, label left and control right, separated by hairlines: « Analyse », « Mode local » (when local), « Général ». One `Select` replaces two native selects, `ModelSelect` and a `datalist`. « Enregistrer » is disabled until something changes; « ✓ Enregistré » takes a reserved slot. Jargon goes: « URL de base de l'API compatible » becomes « Adresse de l'API (compatible OpenAI) »; `/chat/completions`, `/models`, « ID », `whisper-cli` and `ffmpeg` move to the local guide.

### Onboarding

One centred column, max 520 px, on the dark translucent ground. The four step texts stay as they are. Removed: the visual column, orbits, animated pictogram, step numbers, the « sayback. » mark. Progress is a 2 px `scaleX` line with « Étape 2 sur 4 » for screen readers. Steps change with the 200 ms state entrance.

## Motion

| Existing                                                   | Fate                                                                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Library cascade, row arrow, dead 160 ms row transition     | Removed                                                                                                                     |
| Shell entrance, onboarding pictogram, folder landing flash | Removed; the drop feedback is the row's new folder plus a polite announcement « Réunion déplacée dans Acme »                |
| Dragged row `scale(.985)` set imperatively                 | React state, `opacity: .5`, 120 ms                                                                                          |
| Drop target lift, scale and shadow                         | Background and accent border, 120 ms                                                                                        |
| Mixed 220/180 ms hover transitions                         | Colours only, 120 ms                                                                                                        |
| Busy spinner widening the button                           | Label and spinner stacked in one cell; reduced motion hides the spinner and dims the label, which keeps its accessible name |
| Onboarding text, progress dots                             | State entrance 200 ms; progress line `scaleX` 200 ms                                                                        |
| Keyframes and reduced motion spread over three files       | Both keyframes (`state-enter`, `fade-enter`) and all reduced motion rules live in `styles.css` only                         |

| Added                                        | Property                              | Duration | Reduced motion |
| -------------------------------------------- | ------------------------------------- | -------- | -------------- |
| Right card section change                    | `opacity`, `translateY(4px)` on enter | 200 ms   | Opacity only   |
| Dialog open, backdrop                        | `opacity`, `translateY(4px)`          | 200 ms   | Opacity only   |
| Floating notice, « Revenir au direct »       | `opacity`, `translateY(4px)`          | 200 ms   | Opacity only   |
| Popover, menu, `Select`                      | `opacity`, `translateY(-4px)`         | 120 ms   | Opacity only   |
| Hover on row, chip, button, tab; active turn | `background-color`, `color`           | 120 ms   | Kept           |
| Button press                                 | `transform: scale(.97)`               | 120 ms   | Off            |
| Turn targeted from a note                    | `background-color` back to active     | 200 ms   | Kept           |
| Analysis progress lines                      | `transform: scaleX`                   | 200 ms   | No transition  |
| Finalizing line                              | `translateX` loop                     | 1.6 s    | Static bar     |

Never animated: the shell, pane widths, window resize; list rows entering, leaving or filtering; changing meeting with the keyboard; switching tabs; the timer and counters; transcript auto-scroll and turns arriving during analysis; skeletons; « Enregistré »; the live dot; `height`, `width`, `top`, `left`. Dialogs close instantly.

## Tokens

Added to the panel's tokens, dark values on `:root`:

| Token                               | Value                                                         | Use                                     |
| ----------------------------------- | ------------------------------------------------------------- | --------------------------------------- |
| `--color-pane`                      | `#0a0b10`                                                     | Right card                              |
| `--color-overlay`                   | `#161a23`                                                     | Dialogs, popovers, floating notice      |
| `--color-backdrop`                  | `rgb(0 0 0 / .5)`                                             | `::backdrop`                            |
| `--color-border-strong`             | `rgb(255 255 255 / .16)`                                      | Field and control borders               |
| `--color-danger`                    | `#ff6b61`                                                     | Destructive actions                     |
| `--color-highlight`, `-strong`      | `rgb(122 169 255 / .28)`, `/ .55`                             | Search matches                          |
| `--color-speaker-1..4`              | `#c4a8ff` `#8fd8e8` `#ffa8c5` `#e8c98f`                       | Transcript speakers                     |
| `--shadow-float`                    | `0 12px 40px rgb(0 0 0 / .45), 0 0 0 1px var(--color-border)` | Floating elements only                  |
| `--text-title-lg`                   | 24 / 1.25 / 600 / −0.02em                                     | Detail, settings, recording, onboarding |
| `--text-section`                    | 15 / 1.4 / 600                                                | Note and settings headings              |
| `--text-read`                       | 14 / 1.6 / 400                                                | Notes and transcript                    |
| `--text-timer-lg`                   | 48 / 1 / 600, tabular                                         | Recording timer                         |
| `--space-6`, `--space-7`            | 32, 48 px                                                     | Section spacing                         |
| `--control-xs`                      | 24 px                                                         | Chips, timestamps                       |
| `--pane-list-width`                 | `clamp(280px, 25vw, 360px)`                                   | Left pane                               |
| `--header-height`, `--pane-gap`     | 52 px, 8 px                                                   | Drag band, card margin                  |
| `--reading-width`                   | 680 px                                                        | Reading column                          |
| `--traffic-inset`                   | 76 px, 0 in full screen and outside macOS                     | Left inset for the traffic lights       |
| `--duration-fast`, `-base`, `-slow` | 120, 200, 220 ms                                              | The three durations                     |

Mapping of what exists: 18 text greys to 3 tokens, 15 borders to 2, about 27 backgrounds to 5 plus `color-mix` tints for status grounds, 10 blues to the accent, 14 radii to 4 (8, 12, 16, pill), 22 font sizes to 8 (h2, card and dialog titles at 16 px, only h1 and the onboarding title at 24 px), 5 weights to 400/500/600, 5 letter spacings to 0 and −0.02em, 16 gaps to the 4-8-12-16-24-32-48 scale, control heights to 24/32/44, 10 durations to 3, 3 curves to 1, 4 shadows to 1.

## Components

| Component                                                                                                                     | Status               | Note                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Button`                                                                                                                      | Extended             | `size` sm 32 / lg 44, `shape` pill / round, stacked busy cell, press                                                |
| `Notice`                                                                                                                      | Extended             | `tone` warning / danger / info, `floating`, flex, action slot                                                       |
| `Dialog`                                                                                                                      | Extended             | Header, body, fixed footer; closes on backdrop click unless busy                                                    |
| `StatusBadge`                                                                                                                 | Extended             | Dot and label, five styled statuses                                                                                 |
| `Field`, `Select`, `Popover`, `Segmented`, `Switch`, `Chip`, `SearchField`, `EmptyState`, `Skeleton`, `Card`, `ConfirmDialog` | Created              | In `components/`, exported from `ui.tsx`                                                                            |
| `LevelMeter`, `SpeakerLabel`, `FollowPill`                                                                                    | Created              | In `components/`, reused later by the panel                                                                         |
| `AppShell`, `WorkspaceContent`                                                                                                | Rewritten            | Two panes, drag regions, right card switch                                                                          |
| `Sidebar`; `Library`, `LibraryPage`, `FolderBoard`, `EmptyLibrary`                                                            | Removed              | Replaced by `ListPane`, `MeetingRow`, `FolderFilter`, `date-groups.ts`                                              |
| `MeetingDetail`, `MeetingHeader`, `AnalysisProgress`, `ClarificationForm`                                                     | Rewritten            | Plus new `NotesView`, `PlaybackBar`, `MeetingActions`                                                               |
| `MeetingNotes`, `NoteSection`, `MeetingContext`, `MediaPlayer` UI                                                             | Removed              | `use-media-playback` stays                                                                                          |
| `Transcript`, `TranscriptTurn`, `speaker-turns.ts`, `meeting-format.ts`                                                       | Rewritten            | Plus new `transcript-search.ts`, `use-follow-playback.ts`, pure, tested                                             |
| `RecordingView`, `NewMeetingDialog`, `RecordingSourceDialog`, `CaptureSources`                                                | Rewritten            | No waveform                                                                                                         |
| `SettingsView`, `ApiSettingsForm`; `ModelSelect`, `model-select.css`                                                          | Rewritten; removed   | One `Select`                                                                                                        |
| `Onboarding`, `LocalSetupPanel`                                                                                               | Simplified, restyled |                                                                                                                     |
| CSS                                                                                                                           | Reorganised          | `styles.css` holds tokens, base, keyframes, reduced motion; `shared.css` removed; one file per component or feature |

## Delivery steps

Each step leaves the app usable and passes `npm run check`.

| #   | Content                                                                                                                                                                             | What the eye checks                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Dark tokens on `:root`, every literal replaced through the mapping, `color-scheme: dark`, system font, base size, status styles. CSS, `index.html`, window background only.         | The whole app is dark, native controls and scrollbars included; the three grey statuses are now distinct; no structure changed. |
| 2   | Primitives and motion: extended and new components, defects removed, keyframes and reduced motion centralised, `window.confirm` replaced.                                           | No shell slide or list cascade; crisp hover and press; dialogs enter; busy buttons do not shift.                                |
| 3   | Native chrome after the throwaway window check: drag band, traffic lights, translucent left pane, right card, no document scroll; top bar, footer, slogans and intro strip removed. | One title area; translucent left, opaque right; the left pane no longer scrolls with the page; readable over a light wallpaper. |
| 4   | List pane: rows, date groups, folder filters, search, statuses, footer; the Library page and nav disappear; initial selection.                                                      | The list lives on the left, no icons or arrows per row, drag onto a chip works, skeletons while loading.                        |
| 5   | Detail: header, segmented control, notes, player bar, actions, delete confirmation, `mm:ss` clarifications, analysis line.                                                          | One reading column, no « Le contexte » panel, analysis no longer pushes content.                                                |
| 6   | Transcript: selectable turns, speaker colours, parts, highlighted search with navigation, follow that respects manual scroll, note to passage, memoisation.                         | Text copies; no jump while reading during playback; « 3 sur 12 »; smooth on 1000+ turns.                                        |
| 7   | Recording screen and both dialogs.                                                                                                                                                  | The timer dominates; the start button stays visible with many windows.                                                          |
| 8   | Settings, onboarding, dead CSS purge, `.codex/rules/frontend.md` rewritten.                                                                                                         | No light ground anywhere; every screen reads the tokens.                                                                        |

Step 1 first because it changes the overall impression most for the least risk: one layer, no logic, one commit to revert.

## Project rule rewrite

`.codex/rules/frontend.md`, step 8, replacing "Bright, quiet UI":

```
- Dark, native macOS look: translucent sidebar over vibrancy, opaque near-black content pane, one accent, one primary action per screen.
- Every colour, size, radius, space and duration is a token from `src/renderer/styles.css`; feature CSS holds layout only, no literals.
- Share Button, Field, Select, Dialog, Notice, EmptyState and StatusBadge from `src/renderer/components/ui.tsx`; extract on a real second use.
- Semantic HTML, labelled controls, keyboard support, visible focus; motion is CSS only, one curve, three durations, no exit animation, reduced motion in `styles.css` only.
- Concise French copy, no slogans or invented statistics; show real loading, empty, recording, processing, error and ready states. Notes come first; transcript, video and clarifications share timestamps.
```

## Tests

- Pure and tested in Node: `groupByDate`, row date formatting, transcript search normalisation and match indexing, active turn binary search, follow state transitions, `speakerLabel`.
- Existing tests that cover rewritten components are updated, not deleted; `speaker-turns.test.ts` keeps its cases.
- By eye, per step: the right column of the delivery table, over a light and a dark wallpaper, with reduced motion and reduced transparency on.

## Assumed, to confirm

- The window options and the `sidebar` material over a light wallpaper (throwaway build before step 3).
- A continuous timeline from `use-media-playback` over chunked audio, for the footer player.
- A "modified" state in `useSettings` to disable « Enregistrer ».
- `content-visibility: auto` is enough on 1000+ turns.
