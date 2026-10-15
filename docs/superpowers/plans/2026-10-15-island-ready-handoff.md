# Ready Island: Main-Process Handoff

**For:** Raphaël, who builds the ready island UI and the main renderer's start handler.
**Spec:** `docs/superpowers/specs/2026-10-15-start-recording-design.md`, « Îlot prêt » section.
**Branch:** `feat/island-ready`. The main side, the contracts and both preloads are done. Nothing under `src/renderer` was changed except test fixtures (`test-api.ts`, `IslandApp.test.tsx`), which gained the new API members and `mode: 'recording'`.

## How it fits

```
tray left click ─► island.toggle() ─► ready window (showInactive, expanded)
island page ── island:request {type:'start'} ──► main ── recording:start-request ──► main renderer
                                                   ◄── recording:start-result ────┘
island page ◄── island:start-result ── main                  (failure: island stays ready)
main renderer ── recording:state ──► main ── island:state {mode:'recording'} ──► island page
```

The main window carries the capture. If it is closed, main creates it with `show: false` and never shows it on this path. If it is hidden or minimised, it stays that way.

## Island page (`window.sayBackIsland`, `IslandApi`)

| Member                    | Channel               | Notes                                                   |
| ------------------------- | --------------------- | ------------------------------------------------------- |
| `ready()`                 | `island:ready`        | Shows the window and returns the first `IslandSnapshot` |
| `request(r)`              | `island:request`      | Island role only, 5 per second, validated by Zod        |
| `onState(listener)`       | `island:state`        | Every later snapshot                                    |
| `onExpanded(listener)`    | `island:expanded`     | `false` on a ready island means it is closing: fold now |
| `onLevel(listener)`       | `island:level`        | Recording only                                          |
| `onStartResult(listener)` | `island:start-result` | `{ ok: true }` or `{ ok: false, error }`: busy is over  |

### `IslandSnapshot` (`src/shared/island.ts`)

It is now a union on `mode`:

- `{ mode: 'recording', recording, expanded, shape }`: the recording island, the same as before.
- `{ mode: 'ready', recording: { recording: false }, expanded: true, shape, ready }`, where `ready: IslandReadyState` holds:
  - `title`: the default title at the opening (`defaultMeetingTitle`). Show it, but it cannot be edited. To name the moment the recording starts, as the dialog does, recompute it when sending `start`.
  - `remembered: { microphone, systemAudio, screen }`: the capture-prefs at the opening. Use it to set the chips once, then keep your own state through `normalizeSelection()`. Later `island:state` messages carry the same `remembered` value and must not reset the chips.
  - `screen: { id, name } | null`: the remembered screen if it still exists, otherwise the main one (`Écran 1`). `null` means there is no screen.
  - `screenCount`: show « Changer » from 2.
  - `error: 'screen-denied' | 'no-audio-source' | 'no-screen' | 'failed' | null`: when set, it replaces the screen line. It is computed at the opening when the remembered selection includes the screen (permission denied, or no screen listed), and after each start failure and each `cycle-screen`.

Every opening starts fresh: title, prefs and screens are read again. Main sets `expanded: true` on a ready snapshot. Render the compact shell first, then set `data-expanded` on the next frame, as the spec describes.

### `IslandRequest`

- Strings: `pause`, `resume`, `stop` (recording); `open`, which brings SayBack forward on a recording island, and on a ready island opens the « Nouvelle réunion » dialog and closes the island; `close` (the ×, ready only); `open-privacy-settings` (the screen recording pane, ready only); `cycle-screen` (« Changer » and « Réessayer »: main lists the screens again, moves to the next one, then sends `island:state`).
- Start: `{ type: 'start', title, selection: { microphone, systemAudio, screen, screenId? } }`, with these rules:
  - `title`: trimmed, 1 to 160 characters.
  - `screenId`: must match `screen:<n>:<n>`, and is required when `screen` is true.
  - `systemAudio: true` requires `screen: true`. Send `normalizeSelection()` output.
  - No other field is accepted.
  - An invalid payload is answered by `request()` with `{ ok: false, error: 'Vérifiez les informations saisies.' }`.

  The analysis setting is not sent: the main renderer reads it from capture-prefs.

### Rendering a start

1. On « Démarrer », set the button `busy` and disable the chips, then send `start`. Main suspends its close timers while busy and ignores a second `start`.
2. `onStartResult`:
   - `ok: true`: wait. `island:state` with `mode: 'recording'` follows in the same window. Cross-fade to the recording content. Main restarts the hover with the recording delays, so the island folds into wings 300 ms after the cursor leaves.
   - `ok: false`: clear busy and show the error line, using the copy in the spec. `no-audio-source` comes straight from main and is never relayed.

### Closing (main decides)

| Rule                                           | Where                                    |
| ---------------------------------------------- | ---------------------------------------- |
| 3 s after the cursor leaves the open rectangle | `READY_HOVER.close` in `island-hover.ts` |
| 15 s if the cursor never entered               | `READY_HOVER.untouched`                  |
| No auto-close for 30 s after an error          | `READY_ERROR_HOLD`                       |
| No auto-close while a start is busy            | `ReadySession.holding()`                 |
| ×, second tray click, « Ouvrir SayBack »       | Immediate                                |

To close, main sends `island:expanded` `false`, stops taking clicks, and destroys the window 400 ms later (`FOLD_FALLBACK`). Fold the shell and fade the content within that time; `--duration-island` is 280 ms. The page does not report `transitionend`. Under reduced motion, a fade is enough.

## Main renderer (`window.sayBack`, `DesktopApi`)

| Member                            | Channel                   | Notes                                                |
| --------------------------------- | ------------------------- | ---------------------------------------------------- |
| `onStartRequest(listener)`        | `recording:start-request` | `{ id, title, selection }` (`RecordingStartRequest`) |
| `answerStartRequest(id, outcome)` | `recording:start-result`  | Main role only, 5 per second, validated by Zod       |

What the handler must do:

1. **Subscribe early**, in the same effect as `onMenuBarNewRecording` in `use-menu-bar.ts`, before the first `announceRecordingState`. Main waits for that first announcement on a freshly created or still-loading window. After 15 s (`READY_TIMEOUT`) it answers the island with `failed`.
2. Run the dialog's start: if `selection.screen`, call `selectSource(screenId, systemAudio)`, then `onStart(title, { ...selection, source }, autoAnalyze && analysisReady)`. `autoAnalyze` comes from `getCapturePrefs()`. `source` is the `CaptureSource` whose id is `screenId`, from `getSources()`; if it is missing, answer `no-screen`.
3. On success, remember the choices as the dialog does (`setCapturePrefs` with the screen), then call `answerStartRequest(id, { ok: true })`.
4. Map failures:
   - Screen permission denied, or a `NotAllowedError` from `getDisplayMedia`: `screen-denied`.
   - No audio source: `no-audio-source`.
   - Screen not found, or `getDisplayMedia` without a source: `no-screen`.
   - Anything else, including a recording already running: `failed`.
5. Never show or focus the window on this path. Main answers `failed` if no answer arrives within 60 s (`ANSWER_TIMEOUT`, which leaves room for the microphone prompt). A late answer is dropped. If the recording started anyway, `recording:state` still switches the island to recording.

Until the handler exists, a start from the island ends in `failed` after 60 s.

## Tray

- Left click: open or close the ready island. During a recording, it opens the recording island, which waits 15 s for the cursor and then folds.
- Right click: the menu, through `popUpContextMenu`. Its first entry is now « Nouvelle réunion… » and opens the dialog.
- Clicking the Dock icon shows a hidden main window (`activate`).

## Known limits (not verified in the app)

- The main window keeps `backgroundThrottling` at its default (`true`). While it is hidden, Chromium throttles its timers to about 1 Hz. The level feed (100 ms) and the 30 s frame timer of `capture-session.ts` are affected, and Chromium may pause the muted `<video>` preview of a hidden page. None of this blocks the capture. Fixing it means calling `webContents.setBackgroundThrottling(false)` while recording, which is pending a decision.
- The desktopCapturer path in a never-shown window was not exercised: the probe session lacked the Screen Recording permission.
