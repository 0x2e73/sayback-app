# Frontend

- Dark, native macOS look: translucent sidebar over vibrancy, opaque near-black content pane, one accent, one primary action per screen.
- Every colour, size, radius, space and duration is a token from `src/renderer/styles.css`; feature CSS holds layout only, no literals. `src/renderer/design-tokens.test.ts` enforces this and fails on any literal, fallback or undeclared token.
- Share Button, Field, Select, Dialog, Notice, EmptyState and StatusBadge from `src/renderer/components/ui.tsx`; extract on a real second use.
- Semantic HTML, labelled controls, keyboard support, visible focus; motion is CSS only, one curve, three durations, no exit animation, reduced motion in `styles.css` only.
- Concise French copy, no slogans or invented statistics; show real loading, empty, recording, processing, error and ready states. Notes come first; transcript, video and clarifications share timestamps.
- Share the visual behavior of buttons, fields, dialogs and notices through `src/renderer/components/ui`. Keep screen-specific layout and copy in the owning feature.
