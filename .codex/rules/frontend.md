# Frontend

- Bright, quiet UI: white surfaces, cool gray backgrounds, near-black text, fine borders, restrained shadows.
- Centralize tokens in `src/renderer/styles.css`. Share buttons, fields, dialogs, empty states and badges.
- Extract repeated components and behavior when a real second use exists.
- Share the visual behavior of buttons, fields, dialogs and notices through `src/renderer/components/ui`. Keep screen-specific layout and copy in the owning feature.
- Semantic HTML, accessible labels, keyboard support, visible focus, reduced-motion support.
- Concise French copy. No verbose comments, implementation jargon or invented dashboard statistics.
- Show real sessions and useful empty, loading, recording, processing, error and ready states.
- Notes take priority. Synchronize video, transcript and clarification timestamps.
