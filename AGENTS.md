# SayBack

Read every Markdown file in `.codex/rules/` before changing code. These tracked rules apply to every contributor and every file, including AI-generated changes.

SayBack is a local-first Electron application in TypeScript. Local models (whisper.cpp, Ollama) are the reference path; remote providers stay optional and use the user’s own key. No accounts, billing or cloud synchronization.

Use `npm run check` before claiming completion. Never commit secrets, recordings or generated build files. Keep comments short and explain only non-obvious constraints.
