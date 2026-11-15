import type { CliNotesProvider, NotesProvider } from './contracts';

/** The model choice that leaves the pick to the CLI itself: no `--model` is passed. */
export const cliDefaultModel = 'default';

/** Notes written by a CLI of the user, through their subscription: no key, no URL. */
export function isCliNotesProvider(provider: NotesProvider): provider is CliNotesProvider {
  return provider === 'claude-code' || provider === 'codex';
}
