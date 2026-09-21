# Testing

- TDD: write a failing behavior test, observe failure, implement minimally, refactor with green tests.
- Test lifecycle, persistence across restarts, retry, concurrency, boundary validation and correction provenance.
- Use real use cases and temporary SQLite databases. Replace only external AI, OS or media boundaries.
- UI tests assert accessible interactions and visible outcomes, not internal state or class names.
- Default tests never make paid API calls. Inject provider network responses for contract tests.
- Run `npm run check` before claiming completion. Document live-provider and platform limitations honestly.
