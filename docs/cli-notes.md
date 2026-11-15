# Notes written by Claude Code or Codex

Optional notes providers (`claude-code`, `codex`). They reuse the CLI already installed and logged in
on the Mac, so the subscription pays instead of an API key. Never the default. Transcription stays on
whisper.cpp; the CLI only writes the notes.

What leaves the machine: the transcript and the clarifications go to Anthropic (Claude Code) or
OpenAI (Codex) through the user's own account. Codex also receives the frames (`--image`); Claude
Code receives text only, because its image path needs a tool that is switched off. The settings
screen says so before the choice is saved.

## How each CLI is locked down

The transcript is untrusted input and the CLI is an agent. Each run uses an argument array (no shell),
the prompt on stdin, a fresh empty temporary folder deleted afterwards, a 5 minute timeout, a 2 MB
output cap, an abort signal tied to the app quitting, and a minimal environment (no API key, no
token; `HOME`, locale, proxy and the CLI's own config folder only).

Claude Code (`claude -p`):

| Flag                                                     | Why                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `--tools ""`                                             | no built-in tool: nothing to run, read, write or fetch        |
| `--strict-mcp-config` (no `--mcp-config`)                | no MCP server                                                 |
| `--safe-mode`, `--setting-sources ""`                    | no CLAUDE.md, skills, plugins, hooks, agents or user settings |
| `--disable-slash-commands`, `--no-chrome`                | no command or browser integration                             |
| `--no-session-persistence`                               | nothing written to the session history                        |
| `--permission-mode dontAsk`, `--permission-prompts none` | a permission request is refused, never asked                  |
| `--system-prompt`                                        | replaces the coding-agent prompt by the notes instruction     |
| `--output-format json`, `--json-schema`                  | one JSON result, shaped like the notes                        |

Codex (`codex exec`): `--sandbox read-only`, `-c approval_policy="never"`, `-c web_search="disabled"`,
`--disable` of the shell, unified exec, apps, plugins, hooks, browser, computer use, multi-agent,
image generation, view image and skill search, `--ignore-user-config`, `--ignore-rules`,
`--ephemeral`, `--skip-git-repo-check`, `-C <temp folder>`, `--output-schema`, `-o`, and `--json`.
The event stream is read: if the agent ran a command or called a tool, the notes are refused.

The answer then goes through `parseGroundedNotes`: an item citing an id that is not in the transcript
is dropped, and notes that cite nothing real are refused.

## Real check

`SAYBACK_REAL_CLI=claude-code|codex npx vitest run src/backend/infrastructure/cli-notes.real.test.ts`
calls the real CLI once on a synthetic meeting (costs a little of the subscription). Optional:
`SAYBACK_REAL_FRAME=<jpeg>` and `SAYBACK_REAL_LOG=<file>`.
