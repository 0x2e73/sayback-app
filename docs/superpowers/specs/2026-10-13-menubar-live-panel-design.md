# Menu bar panel with live local transcription

Status: draft, awaiting owner review. Date: 2026-10-13.

## Goal

A menu bar icon on macOS opens a panel attached under the bar. From it the user starts a recording without opening the main window and reads the transcript live, locally, as speaker turns labelled "Toi" and "Les autres", with a timer, Pause and Stop.

The live text is an ephemeral draft. When the recording stops, the existing batch pipeline produces the stored transcript and the notes exactly as it does today. The `Meeting` model, the SQLite schema and the library do not change.

## Non-goals

- Chat tab and "ask about this meeting" field.
- Telling remote speakers apart live (Speaker 1 / Speaker 2). Local whisper does not diarize.
- Redesign of the main window. It follows in a separate spec and reuses the tokens defined here.
- Windows and Linux menu bar support. Their build and current behaviour must not regress.

## Rules that hold everywhere

1. No failure of the live path may stop or delay the capture. A test proves it.
2. The live path never calls a remote provider, even when the final transcription uses one.
3. Nothing from the live draft is persisted.
4. `npm run check` is green at the end of every step.

## Evidence gathered before design

Measured on one Apple M5 Pro with a synthetic French voice, median of three runs, time to transcribe one chunk:

| Model             | Audio | `whisper-cli`, one process per chunk | `whisper-server`, kept warm |
| ----------------- | ----- | ------------------------------------ | --------------------------- |
| base              | 5 s   | 0.26 s                               | 0.09 s                      |
| base              | 10 s  | 0.43 s                               | 0.13 s                      |
| large-v3-turbo-q5 | 5 s   | 0.91 s                               | 0.49 s                      |
| large-v3-turbo-q5 | 10 s  | 1.03 s                               | 0.56 s                      |

`ffmpeg` webm to wav: 0.03 s. Server model load: 0.3 to 0.4 s. A chunk cut mid-sentence starts mid-word. Not measured: a real multi-voice meeting, a slower machine, two tracks in parallel.

Homebrew's whisper.cpp formula installs `whisper-cli` and `whisper-server` together, so the live engine adds no new install step.

## Architecture

### Capture host window

Today the recording session lives in the React state of the main window (`use-recording.ts`). A render error or a closed window would orphan a recording.

A dedicated `BrowserWindow` with `show: false` and `backgroundThrottling: false`, without React, hosts `CaptureSession` for every recording, whatever started it. The main window and the panel become two remote controls. The truth of the session lives in a service of the main process.

Consequences, all moved into the session service:

- the two hour limit, today in `RecordingView.tsx`;
- the trigger of the automatic analysis, today in `use-auto-analysis.ts`;
- the API key checks, today in `meeting-handlers.ts`.

`capture-permissions.ts` grants capture to the host window instead of the main window. The main process checks microphone and screen permissions before it commands the host, so errors are precise.

Visible cost: the video preview of the main window can no longer receive the stream. It shows one relayed frame per second.

Rejected: keeping the capture in a hidden main window (about half the work, but the state is born in a UI window and "close" becomes "hide" forever); capturing in the panel renderer (two owners depending on the entry point).

### Session states

`idle`, `starting`, `recording`, `paused`, `finalizing`, `error`.

The live path has its own independent state: `off`, `starting`, `ready`, `unavailable` with a reason (`no-model`, `no-binary`, `engine-failed`).

### Live audio path

- The two source streams are already separate before the mix (`capture-resources.ts` creates one source per stream). Both original tracks are exposed. The 48 kHz mix graph and the stored media do not change.
- A second `AudioContext({ sampleRate: 16000 })` taps the same tracks through an `AudioWorklet`. Chromium resamples. Blocks of 200 ms, Int16, sent to the main process through a validated `invoke`.
- Rejected: a second `MediaRecorder` with short rotation. It yields webm that must be converted, cuts blindly, and allows neither overlap nor silence detection.

### Utterance segmentation (main process, pure)

- 20 ms frames. An utterance opens after 60 ms of speech, with 200 ms of pre-roll, and closes after 600 ms of silence.
- Hard cap at 15 s, cut at the lowest-energy point of the last 3 s. Utterances with less than 300 ms of speech are dropped.
- While an utterance is open it is decoded again in full every 2 s. Every decode starts on silence, so no word is truncated at the start and no text has to be stitched.
- Rejected: a sliding window with overlap, which requires stitching and keeps the mid-word defect.

Target latency on Apple Silicon: first text under 3 s, sentence final under 1.5 s after the silence. The thresholds are starting values, tuned in prototype P3.

### Two tracks

- One segment per utterance, id `<track>-<n>`, `speaker` set to "Toi" (microphone) or "Les autres" (system audio), timestamped with session time excluding pauses, replaced by revision.
- Without headphones the microphone picks up the others. A pure text de-duplication drops a "Toi" utterance covered by a near-identical "Les autres" utterance. P3 decides whether it is needed.
- Known limit: the stored transcript has no "Toi / Les autres", because the stored audio is mixed.

### Live engine

One `whisper-server` process kept warm for both tracks.

- Ephemeral port picked by the main process, `--host 127.0.0.1`, `--request-path /<random token>`. The binary exposes `/load` and a CORS header, so without a token a local web page could call it. Only the main process calls it. The renderer CSP already blocks `http://127.0.0.1`.
- PCM is wrapped as WAV in memory. No `ffmpeg`, no temporary file.
- Started with the session, killed before `finishMeeting` (SIGTERM, then SIGKILL after 1 s) and on quit. A PID file lets the next launch kill an orphan after checking the command name.
- Two restarts per session on crash, then live is `unavailable`.
- Queue: finals first, at most one pending partial per track, the latest wins. On a slow machine partials space out instead of piling up.
- Model: `whisperModelPath`, else `findWhisperModel`. With no model the recording starts and the panel says live is unavailable. No new setting.
- Rejected: `whisper-cli` per chunk, even as a fallback. The repeated decode every 2 s makes model reloading too expensive, and a second adapter doubles the test surface.

### Tray and panel (main process)

- Tray on macOS only, template image, `setTemplateImage(true)` set explicitly. Left click toggles the panel. Right click opens "Ouvrir SayBack / Quitter". The timer shows as the tray title while recording.
- Panel window: `frame: false`, `type: 'panel'`, `vibrancy: 'hud'`, `visualEffectState: 'active'`, `backgroundColor: '#00000000'`, `hasShadow: true`, not resizable, movable, minimizable, maximizable or fullscreenable, `hiddenInMissionControl: true`, always on top at the `floating` level, `show: false`, sandboxed. No `transparent: true`. Visible on all workspaces including full screen.
- Position: pure function, centred under `tray.getBounds()`, clamped to the work area, recomputed on every show.
- Hiding: on blur when the session is idle. While recording or paused the panel stays pinned. Only the tray icon or Escape closes it.
- Rejected: `nativeTheme.themeSource = 'dark'`, which would darken the main window too.

### App lifecycle

- The Dock icon stays.
- `requestSingleInstanceLock()` after `app.setPath('userData')`. A second instance focuses the main window.
- With a hidden host window, `window-all-closed` no longer fires. Outside macOS, closing the main window must call `app.quit()` explicitly, or Windows and Linux regress.
- Quit while recording: `before-quit` blocks and offers "Arrêter et quitter / Continuer". The first finalizes, then quits, without starting the analysis.

### IPC contracts

Zod schemas in `src/shared`. The registrar checks a role per window (`main`, `panel`, `capture-host`) and replaces the single-window test in `ipc.ts`. Three separate preload files with no shared runtime import, because a sandboxed preload cannot load a shared chunk.

| Direction    | Channels                                                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI to main   | `session:get`, `session:start`, `session:pause`, `session:resume`, `session:stop`, `session:draft`; `session:switch-source` (main role); `panel:open-main`, `panel:hide` (panel role)           |
| Main to UI   | `session:state` (snapshot on each transition), `session:tick` (timer and level, 10 Hz), `session:live` (segment with `final` and `revision`), `session:preview` (main role), `meetings:changed` |
| Main to host | `host:start`, `host:pause`, `host:resume`, `host:stop`, `host:switch-source`, `host:live`                                                                                                       |
| Host to main | `host:ready`, `host:report`, `host:pcm`, and `meetings:create`, `meetings:finish`, `media:save`, `capture:select`, which move to the host role only                                             |

## Panel interface

### Window

Fixed width 380 px, 16 px inner margin. Two heights, switched natively without animation: compact 296 px (idle, missing model, permission) and session 520 px (recording, paused, finalizing, done). Top corners square against the bar, bottom corners 16 px. No close button.

Three levels of hierarchy only: the timer and the latest turn; the buttons and older turns; speaker labels, captions and the footer.

### States

| State                                   | Content                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Idle                                    | Product name, source toggles, one filled button "Démarrer l'enregistrement", caption, "Ouvrir SayBack"                                     |
| Nothing can transcribe                  | Warning, "Ouvrir les réglages". If only the live model is missing, the idle state shows with a caption saying the analysis runs at the end |
| Permission denied                       | Which permission, the exact System Settings path, "Ouvrir les réglages système", and "Réessayer" or "Enregistrer le micro seul"            |
| Starting                                | The start button turns busy. No intermediate screen                                                                                        |
| Recording, no speech yet                | "En écoute…" and one caption                                                                                                               |
| Recording, with text                    | Header with level meter, timer, Pause, "Terminer". Turn list. Footer "Brouillon en direct · définitif à l'arrêt"                           |
| Paused                                  | Timer frozen, "En pause" in amber, flat meter, "Reprendre" replaces Pause                                                                  |
| Finalizing                              | Timer, "Ouvrir la réunion", indeterminate 2 px line, the live text stays visible and dimmed                                                |
| Done                                    | Title, "Notes prêtes", scrollable summary, "Ouvrir la réunion", "Nouvel enregistrement"                                                    |
| Live engine failed, recording continues | Header unchanged. Amber notice "Texte en direct interrompu", "Réessayer". Never red: nothing is lost                                       |

### Live transcript

- A turn is identified by `(track, id)`. A packet from the same track within 6 s of the last word extends the turn. Beyond 6 s or 400 characters it opens a new one. This lives in a new `live-turns.ts`, not in `speaker-turns.ts`.
- One column sorted by turn start. No left and right bubbles.
- Speaker label 12 px above the text with a 6 px dot, accent blue for "Toi", white at 55 % for "Les autres". Body text is the same colour for everyone. The label repeats only when the track changes or after 6 s of silence.
- Two brightness levels: the latest turn of each track in full text colour, everything else muted. A 24 px top mask fades the oldest lines.
- When a turn grows, existing text does not move. Only the new suffix fades in. When the engine revises a turn, the text is replaced with no animation.
- "Draft" is said once, in the fixed footer. Never per turn.
- Scrolling follows the bottom when within 48 px of it. If the user scrolls up, following stops and a "Revenir au direct" pill appears.

### Motion

CSS only, no animation library. Nothing here needs gestures, springs, layout animation or list reordering.

One curve, the existing `--ease-out`. Three durations: 120 ms, 200 ms, 220 ms. No exit animations. The level meter is the one exception: its 100 ms linear step matches the 10 Hz data rate, it is not a UI duration.

| Element            | Property                                                      | Duration      | Reduced motion                           |
| ------------------ | ------------------------------------------------------------- | ------------- | ---------------------------------------- |
| Panel opening      | `opacity`, `translateY(-4px)`                                 | 120 ms        | Opacity only                             |
| Panel closing      | none, the window hides at once                                |               |                                          |
| Turn entering      | `opacity`, `translateY(6px)`, keyframe on mount               | 220 ms        | Opacity only                             |
| Suffix growing     | `opacity` on the new span                                     | 220 ms        | Same                                     |
| Older turn dimming | `color`                                                       | 200 ms        | Same                                     |
| Level meter        | `transform: scaleY()` on 5 bars through refs, no state update | 100 ms linear | Fixed heights, opacity carries the level |
| State change       | `opacity`, `translateY(4px)` on the content only              | 200 ms        | Opacity only                             |
| Buttons            | hover `background-color`, press `scale(0.97)`                 | 120 ms        | Hover only                               |
| Finalizing line    | `translateX()` loop                                           | 1.6 s linear  | Static bar                               |

Never animated: the timer, the Pause and Reprendre label, a text correction, the window size and position, `height`, `width`, `top`, `left`. No pulsing recording dot.

The existing waveform in `RecordingView` animates `height` on 37 bars with a state update every 200 ms. It is not reused.

### Tokens

Defined in `src/renderer/styles.css` by the main window redesign, which ships first (see `2026-10-13-main-window-redesign-design.md`). The dark values sit directly on `:root` with `color-scheme: dark`. There is no light theme and no theme class. The light column below records what each token replaces.

| Token                             | Light (today's value) | Dark (panel)                                                       |
| --------------------------------- | --------------------- | ------------------------------------------------------------------ |
| `--color-bg`                      | `#f6f8fa`             | `transparent`                                                      |
| `--color-bg-tint`                 | none                  | `linear-gradient(180deg, rgb(8 10 16 / .55), rgb(14 24 48 / .55))` |
| `--color-surface`                 | `#fff`                | `rgb(255 255 255 / .06)`                                           |
| `--color-surface-raised`          | `#f2f5f8`             | `rgb(255 255 255 / .10)`                                           |
| `--color-border`                  | `#e3e9ee`             | `rgb(255 255 255 / .09)`                                           |
| `--color-text`                    | `#17212b`             | `rgb(255 255 255 / .95)`                                           |
| `--color-text-muted`              | `#62707f`             | `rgb(255 255 255 / .72)`                                           |
| `--color-text-subtle`             | `#7c8995`             | `rgb(255 255 255 / .55)`                                           |
| `--color-accent`, `--color-focus` | `#3974d6`             | `#7aa9ff`                                                          |
| `--color-live`                    | `#ae4840`             | `#ff6b61`                                                          |
| `--color-paused`                  | `#9a711b`             | `#f5b94a`                                                          |
| `--color-ready`                   | `#267953`             | `#5fd3a0`                                                          |
| `--color-action`                  | `#273b54`             | `#f4f6fa`                                                          |
| `--color-on-action`               | `#fff`                | `#0d1017`                                                          |

Type: system UI font first. Timer 22 px / 600, tabular figures. Title 16 px / 600. Body 14 px / 1.5. Control 13 px / 600. Caption 12 px / 500. Weights 400, 500 and 600 only.

Spacing 4, 8, 12, 16, 24 px. Radii 8, 12, 16 (panel) and pill. Control heights 32 and 44 px. No CSS shadow: the window shadow is native.

When macOS asks for reduced transparency, the main process signals it and the tint becomes opaque `#10141d`.

### Keyboard and accessibility

- Root is `<main aria-label="SayBack">`, focused on open so Space and Escape work at once.
- Escape hides the panel and never stops a recording. Space toggles pause when focus is not on a button. Stop has no single-key shortcut.
- Focus ring 2 px, offset 2 px.
- One polite live region announces state changes only. The transcript is a `role="log"` with `aria-live="off"`: reading three to six seconds of text over a meeting would harm both.
- The level meter is `aria-hidden`. The tray title gives the timer to VoiceOver users without opening the panel.
- Contrast on a translucent ground is estimated, not measured. It must be measured on a capture over a light wallpaper before sign-off.

### Components

- Extend `Button` with `size` (`sm` 32 px, `lg` 44 px) and `shape="pill"`. `.button-primary` reads the two action tokens, whose light values equal today's literals.
- Extend `Notice` with `tone` and `role`.
- Reuse `StatusBadge`.
- Do not touch `Transcript`, `TranscriptTurn` or `speaker-turns`.
- Create `LiveTurn`, `LiveTranscript`, `LevelMeter`, `live-turns.ts`, the panel root and one component per state.

## Files

| Path                                                                                                                                                       | Layer          | Role                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| `src/shared/session-contracts.ts`, `session-validation.ts` (new)                                                                                           | shared         | Session and live types, Zod schemas for commands, host reports and PCM frames      |
| `src/shared/contracts.ts`                                                                                                                                  | shared         | `DesktopApi` loses four write methods, gains session and subscriptions             |
| `src/backend/domain/recording-session.ts`, `live-transcript.ts` (new)                                                                                      | domain         | States and transitions, two hour limit; ids, revision, echo de-duplication         |
| `src/backend/application/recording-session.ts`, `live-transcription.ts`, `live-segmenter.ts`, `analysis-launcher.ts` (new)                                 | application    | Session service; decode queue; segmentation; key checks then processing            |
| `src/backend/application/ports.ts`                                                                                                                         | application    | Ports `CaptureHost`, `LiveEngine`, `SessionEvents`                                 |
| `src/backend/infrastructure/whisper-server.ts`, `whisper-server-client.ts` (new)                                                                           | infrastructure | Spawn, port, token, health, stop, orphans; WAV in memory, POST, validated response |
| `src/main/window-registry.ts`, `capture-host-window.ts`, `panel-window.ts`, `tray.ts`, `session-handlers.ts`, `app-lifecycle.ts`, `live-services.ts` (new) | main           | Roles, host adapter, panel, tray, channels, lifecycle, live composition            |
| `src/main/assets/trayTemplate.png`, `@2x` (new)                                                                                                            | main           | Monochrome tray icon                                                               |
| `src/main/ipc.ts`, `capture-permissions.ts`, `meeting-handlers.ts`, `services.ts`, `window.ts`, `index.ts`                                                 | main           | Roles, host permissions, moved channels, composition                               |
| `src/preload/panel.ts`, `capture-host.ts` (new), `index.ts`                                                                                                | preload        | One explicit API per window                                                        |
| `src/renderer/capture-host.html`, `capture-host/*` (new)                                                                                                   | renderer       | Host: commands to `CaptureSession`, reports                                        |
| `features/recording/live-audio-tap.ts`, `pcm-worklet.ts` (new)                                                                                             | renderer       | 16 kHz tap per track                                                               |
| `features/recording/*`, `App.tsx`, `WorkspaceContent.tsx`                                                                                                  | renderer       | Main window as a remote control                                                    |
| `features/meetings/use-auto-analysis.ts` and its test (removed)                                                                                            | renderer       | Behaviour taken over by the session service and its test                           |
| `features/session/use-session.ts` (new)                                                                                                                    | renderer       | State subscription shared by both windows                                          |
| `panel.html`, `panel/*`, `features/live/*`, `styles/panel.css` (new)                                                                                       | renderer       | Panel                                                                              |
| `electron.vite.config.ts`, `tsconfig.json`                                                                                                                 | config         | Three pages, three preloads                                                        |
| `.codex/rules/frontend.md`, `docs/security-and-models.md`, `docs/local-setup.md`                                                                           | docs           | Dark panel exception, local server, setup                                          |

`capture-session.ts` is at 236 useful lines against a limit of 250. Any addition there must extract first.

## Prototypes before code

Throwaway, outside the repository.

- **P1, blocks step 2.** A hidden window commanded over IPC with no click. Does `getDisplayMedia` with loopback succeed without a gesture, or through `executeJavaScript(code, true)`? If both fail, starting system audio from the panel is invalid. Does the microphone prompt show? Does `MediaRecorder` rotation stay on time over three minutes? Are captured frames non-black? Does `audioWorklet.addModule` load under the current CSP in dev and in a packaged build? How much system sound leaks into the microphone track, with headphones and with speakers?
- **P2, blocks step 4.** Real `whisper-server`: does `--request-path` cover `/load` and `/health`? Exact shape of `verbose_json`? Two concurrent requests, memory with turbo-q5, SIGTERM behaviour, timings on utterances of 1 to 15 s.
- **P3, before step 6 is called done.** A ten minute two-voice meeting in French, base then turbo-q5: perceived latency, language switches with `auto`, invented text on silence, echo duplicates.

## Delivery steps

Each step is one reviewable change.

| #   | Content                                                                                               | `npm run check` proves                                | Manual test proves                                                                    |
| --- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 0   | Prototypes P1 and P2                                                                                  | nothing                                               | see above                                                                             |
| 1   | Role registry, per-role registrar, three build entries, single instance, explicit quit outside macOS  | Role matrix; exactly three preload files in the build | Existing manual script unchanged; a second launch focuses the window                  |
| 2   | Session service, capture host, main window as remote, analysis and two hour limit in main, quit guard | State machine; `meetings.test.ts` unchanged and green | Full manual script; close and reopen the window while recording; quit while recording |
| 3   | Tray and panel, no live                                                                               | Position, hiding rule, panel in jsdom                 | Start, pause, stop with the main window never opened; full screen; two displays       |
| 4   | Live engine alone                                                                                     | Supervisor, client, queue                             | `ps`: one process during the session, none after Stop or quit                         |
| 5   | Separate tracks, audio tap, worklet, segmenter                                                        | Segmenter, PCM schema                                 | Segments from both tracks in the logs; stored files identical to step 2               |
| 6   | Live panel, turns, unavailable state, echo                                                            | Live turns, de-duplication, panel                     | Real meeting: turns, partials, pause, model removed                                   |
| 7   | Docs, frontend rule, dmg, NSIS build                                                                  | Build                                                 | Installed dmg; the Windows app launches and quits on close                            |

## Tests

- Node: segmenter on synthetic PCM; live queue with a fake engine; state machine with a fake host (double start, idempotent stop, host crash, two hour limit, quit guard); supervisor with a fake `spawn` (arguments, restart, signal escalation, orphan PID); client with injected `fetch`; schemas; IPC role matrix; panel position; hiding rule; live turns.
- jsdom: panel states, turns and buttons; main window as remote.
- Manual only: tray and panel rendering, full screen, multiple displays, macOS prompts, capture from a window never shown, real track separation, latency, orphan after `kill -9`, dmg, Windows launch.

## Risks

- Windows: the capture goes through the hidden host there too and cannot be run here. The build stays green; behaviour is untested.
- Server stop is guaranteed on a normal quit. After a `kill -9` of the main process it is only cleaned up at the next launch.
- On macOS 15 and later the periodic screen capture prompt can appear during a start from the panel.
- Assumed, not executed: `type: 'panel'` gives a non-activating panel that floats above full screen; the `hud` material stays dark in light mode; one track can feed two `AudioContext`s; `whisper-server` serves requests serially; the path token protects every endpoint. P1 and P2 settle these.

## Open questions for the owner

1. **Does a start from the panel record the screen?** System audio only arrives with a display capture today. Default taken: yes, same defaults as the dialog (main display, microphone, system audio), and the panel toggle is labelled "Écran et son du système" so nothing is recorded silently. "System audio without video" is a separate capture change.
2. ~~Tray icon artwork.~~ Settled: the logo is a ghost whose hem is four level bars. Its monochrome glyph is `build/tray-icon.svg`; step 3 exports it to `src/main/assets/trayTemplate.png` and `@2x`.

## Decided after the first draft

The whole app turns dark, in a native macOS style (decided 2026-10-13). `.codex/rules/frontend.md` says "Bright, quiet UI" and is rewritten in the main window redesign, not patched with an exception. The main window redesign ships before this panel. It creates the tokens and the shared pieces this spec relies on (`Button` sizes and pill shape, `Notice` tones, `LevelMeter`, `SpeakerLabel`, `FollowPill`); the panel reuses them instead of creating them.
