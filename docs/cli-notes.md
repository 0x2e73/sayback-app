# Notes written by Claude Code or Codex

Optional notes providers (`claude-code`, `codex`). They reuse the CLI already installed and logged in
on the Mac, so the subscription pays instead of an API key. Never the default. Transcription stays on
whisper.cpp; the CLI only writes the notes.

## What leaves the machine

- Both: the title of the meeting, the transcript and the clarifications, sent to Anthropic (Claude
  Code) or OpenAI (Codex) through the user's own account.
- Codex only: the frames (up to 24), attached as image files. Claude Code receives text only, because
  its image path is a tool that is switched off.
- Codex also adds its own skills catalog (names and descriptions of the skills installed on the Mac)
  to its prompt. No switch removes it; the tools to use those skills are off.

The settings screen says so before the choice is saved (transcript, title, clarifications, and the
screenshots for Codex).

## Where it runs

Each run gets a fresh private folder in `<user data>/cli-runs` (mode 0700), deleted after the run.
It holds nothing for Claude Code. For Codex it holds the frames and the JSON schema
(`frame-N.jpg`, `notes-schema.json`) and, at the end, the last message. The whole `cli-runs` folder is
wiped when the app starts and when it closes, so a crash cannot leave frames behind.

## Locking down the CLI

The transcript is untrusted input and the CLI is an agent. Each run uses an argument array (no
shell), the prompt on stdin, a 5 minute timeout, a 2 MB output cap, an abort signal tied to the app
quitting, and a minimal environment (no API key, no token; `HOME`, locale, proxy and the CLI's own
config folder only).

The text sent to the CLI has every word-initial `@` and every `$` before a letter replaced by its
fullwidth form (`＠`, `＄`), in the title, the transcript and the clarifications. Claude Code reads
`@path` files itself, before the model runs and whatever `--tools` says; Codex resolves `$skill`
mentions. E-mail addresses and prices are untouched.

Claude Code (`claude -p`):

| Flag or variable                                         | Why                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `--tools ""`                                             | no built-in tool: nothing to run, read, write or fetch        |
| `--strict-mcp-config` (no `--mcp-config`)                | no MCP server                                                 |
| `--safe-mode`, `--setting-sources ""`                    | no CLAUDE.md, skills, plugins, hooks, agents or user settings |
| `--disable-slash-commands`, `--no-chrome`                | no command or browser integration                             |
| `--no-session-persistence`                               | nothing written to the session history                        |
| `--permission-mode dontAsk`, `--permission-prompts none` | a permission request is refused, never asked                  |
| `--system-prompt`                                        | replaces the coding-agent prompt by the notes instruction     |
| `--output-format json`, `--json-schema`                  | one JSON result, shaped like the notes                        |
| `CLAUDE_CODE_DISABLE_FILE_MENTIONS=1`                    | the client does not read `@path` files                        |
| `CLAUDE_CODE_DISABLE_ATTACHMENTS=1`                      | the client skips its attachment pipeline                      |

After the run, a non-empty `permission_denials` in the result refuses the notes. (`num_turns` is not
checked: an answer shaped by `--json-schema` takes two turns by itself.)

Codex (`codex exec`): `--sandbox read-only`, `-c approval_policy="never"`, `-c web_search="disabled"`,
`--disable` of the shell, unified exec, apps, plugins, hooks, browser (three variants), computer use,
multi-agent, image generation, view image, skill search, tool suggestion and skill MCP install,
`--ignore-user-config`, `--ignore-rules`, `--ephemeral`, `--skip-git-repo-check`, `-C <run folder>`,
`--output-schema`, `-o`, and `--json`. `code_mode_host` is left on: the models need it.

The `--json` event stream is checked against an allowlist that fails closed: only the lifecycle events
(`thread.started`, `turn.started`, `turn.completed`) and `item.*` events of type `agent_message`,
`reasoning` or `todo_list` are accepted. Any other event or item type, or a line that is not JSON,
refuses the notes. This is detection after the fact; the real barrier is the switches above.

The answer then goes through `parseGroundedNotes`: an item citing an id that is not in the transcript
is dropped, and notes that cite nothing real are refused.

## Errors

The message shown is chosen from the error text of the CLI only (its stderr, the Claude `result` when
`is_error` is true, the Codex `error` and `turn.failed` messages), never from what the model wrote.
The screen shows no binary name or command. To log in again, run these in a terminal:

- Claude Code: `claude`, then `/login` (check with `claude auth status`)
- Codex: `codex login` (check with `codex login status`)

## Known limits

- Codex loads `~/.codex/AGENTS.md` (global instructions of the user) even with `--ignore-user-config`,
  which only skips `config.toml`. Its content goes to OpenAI with every run and can contradict the
  notes instruction. `CODEX_HOME` is not changed: that would break the login.
- `codex debug models` (used to list the models) is a debugging command; if it changes, only
  `default` is offered.
- Claude Code with `--json-schema` makes two turns; a long meeting costs more than a short one on the
  subscription.

## Real check

`SAYBACK_REAL_CLI=claude-code|codex npx vitest run src/backend/infrastructure/cli-notes.real.test.ts`
calls the real CLI once on a synthetic meeting (costs a little of the subscription). Optional:
`SAYBACK_REAL_FRAME=<jpeg>`, `SAYBACK_REAL_LOG=<file>`, and `SAYBACK_REAL_CANARY=<file>`, a file the
transcript mentions as `@<path>` and whose token must never appear in the output.
