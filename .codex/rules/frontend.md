# Frontend

- Light and dark follow the system or the user's choice; translucent sidebar over vibrancy, opaque content card, one accent, one primary action per screen.
- Every colour, size, radius, space and duration is a token from `src/renderer/styles.css`; feature CSS holds layout only, no literals. `src/renderer/design-tokens.test.ts` enforces it for colours, type, radii and gaps, and fails on any literal, fallback or undeclared token; spaces and durations join as each screen is rewritten.
- Share Button, Field, Select, Dialog, Notice, EmptyState and StatusBadge from `src/renderer/components/ui.tsx`; extract on a real second use; screen-specific layout and copy stay in the owning feature.
- Semantic HTML, labelled controls, keyboard support, visible focus; motion is CSS only, one curve, three durations, no exit animation, reduced motion in `styles.css` only.
- Concise French copy, no slogans, invented statistics or implementation jargon; show real loading, empty, recording, processing, error and ready states. Notes come first; transcript, video and clarifications share timestamps.
