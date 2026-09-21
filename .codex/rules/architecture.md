# Architecture

- TypeScript strict. Apply YAGNI, DRY and SOLID through small modules and explicit dependencies, without speculative abstractions.
- `src/backend/domain`: entities and invariants. No Electron, SQL or OpenAI imports.
- `src/backend/application`: use cases and injected ports.
- `src/backend/infrastructure`: SQLite, media, encrypted credentials and OpenAI adapters.
- `src/main`: composition and validated IPC transport. No business logic in handlers.
- `src/shared`: serializable contracts and boundary schemas.
- `src/renderer`: React and browser capture. No Node, database or provider SDK imports.
- Place reusable pure helpers near their domain first; move them to `src/shared` only when used across boundaries. Keep feature-specific hooks and components inside their feature folder.
- Put genuinely shared interface primitives in `src/renderer/components/ui`; compose pages from those primitives and feature components. Avoid a catch-all `utils` module or global component for a single use.
- Expose explicit preload methods, never arbitrary IPC or filesystem access. Validate payloads and sender origins.
- Persist media incrementally. Keep original transcription and human clarifications separate. Validate AI citations against transcript IDs.
- Credentials stay encrypted in the main process. Never ship a hosted service key.
- Use parameterized SQL, bounded inputs and a lockfile. Failures preserve recordings and allow retry.
- No OAuth, accounts, billing or synchronization in V1. Comments explain only non-obvious constraints.
