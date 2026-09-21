# Voice Meets MVP

Electron desktop for macOS and Windows; React and TypeScript; OpenAI; no authentication. Light Vercel-inspired UI grounded in the supplied reference.

## Flow

Library → title and sources → screen/microphone/system audio recording → stop → timestamped transcription and cited notes using selected screenshots → replay moments → clarify and regenerate.

Media and SQLite data remain local. Analysis sends audio and selected images to OpenAI on request, using a personal key saved in settings. No automatic recording or fabricated meetings.

## Architecture

Separate frontend and backend TypeScript folders. Domain/application/infrastructure layers behind a narrow validated Electron IPC API. Node built-in SQLite. No HTTP server needed for a local single-user app; future HTTP/auth adapters can reuse use cases.

Incremental WebM video writes, independently decodable bounded audio chunks with offsets, screenshots at 30-second intervals with a total cap, checkpointed transcription for retries. Interrupted sessions survive restart. Maximum recording duration is two hours in V1.

## Provider

Whisper verbose transcription supplies segment timestamps. A configurable vision-capable OpenAI model generates schema-validated notes. Human clarifications remain separate and are included in regeneration. Validate citations against real segment IDs.

## Validation

TDD on lifecycle, persistence, retry, concurrency, corrections, provider contracts and UI. Strict type checking, lint and build. Real capture needs OS permissions; live analysis needs the user's funded key. Report actual verification and limits.

## Reference

https://github.com/brocoders/nestjs-boilerplate inspected for modular architecture and auth. No copied code: its server/auth infrastructure exceeds local MVP needs.
