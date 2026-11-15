import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { CliNotesProvider } from '../../shared/contracts';
import { cliEnvironment } from './cli-environment';
import { loginNeeded, notInstalled, type CliLabels } from './cli-failures';
import type { CliNotesDependencies } from './cli-notes';
import { CliUnavailableError, type CliOutput } from './cli-runner';

/** The CLI's own choice, listed first: the notes then follow whatever the account offers. */
export const cliDefaultModel = 'default';

const claudeAliases = ['sonnet', 'opus', 'haiku'];

interface CliKind extends CliLabels {
  binary: 'claude' | 'codex';
  /** A read-only call that costs nothing and says whether the account is logged in. */
  statusArgs: string[];
}

const kinds: Record<CliNotesProvider, CliKind> = {
  'claude-code': {
    label: 'Claude Code',
    binary: 'claude',
    statusArgs: ['auth', 'status'],
  },
  codex: { label: 'Codex', binary: 'codex', statusArgs: ['login', 'status'] },
};

const catalogSchema = z.object({
  models: z.array(z.object({ slug: z.string(), visibility: z.string().optional() })),
});

const statusTimeoutMs = 20_000;

function claudeLoggedIn(output: CliOutput): boolean {
  if (output.exitCode !== 0) return false;
  try {
    return z.object({ loggedIn: z.boolean() }).parse(JSON.parse(output.stdout)).loggedIn;
  } catch {
    return false;
  }
}

/** Is the CLI there, and logged in? Says so in French when not; lists the models otherwise. */
export class CliSetup {
  constructor(private readonly dependencies: CliNotesDependencies) {}

  async models(provider: CliNotesProvider): Promise<string[]> {
    const kind = kinds[provider];
    const command = this.dependencies.locate(kind.binary);
    if (!command) throw new Error(notInstalled(kind));
    const directory = await mkdtemp(join(this.dependencies.tempRoot, 'sayback-setup-'));
    try {
      const status = await this.run(kind, command, directory, kind.statusArgs);
      const ready = provider === 'codex' ? status.exitCode === 0 : claudeLoggedIn(status);
      if (!ready) throw new Error(loginNeeded(kind));
      if (provider === 'claude-code') return [cliDefaultModel, ...claudeAliases];
      return [cliDefaultModel, ...(await this.codexCatalog(kind, command, directory))];
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  // The catalog is a debugging command: when it fails the default model is still offered.
  private async codexCatalog(kind: CliKind, command: string, directory: string) {
    try {
      const output = await this.run(kind, command, directory, ['debug', 'models']);
      if (output.exitCode !== 0) return [];
      return catalogSchema
        .parse(JSON.parse(output.stdout))
        .models.filter((model) => model.visibility === 'list')
        .map((model) => model.slug);
    } catch {
      return [];
    }
  }

  private async run(kind: CliKind, command: string, directory: string, args: string[]) {
    const folder = command.slice(0, command.lastIndexOf('/')) || '/usr/bin';
    try {
      return await this.dependencies.runner({
        command,
        args,
        input: '',
        cwd: directory,
        env: cliEnvironment(this.dependencies.environment, folder),
        timeoutMs: statusTimeoutMs,
        maxOutputBytes: 2_000_000,
        signal: this.dependencies.signal,
      });
    } catch (error) {
      if (error instanceof CliUnavailableError) throw new Error(notInstalled(kind));
      throw new Error(`${kind.label} ne répond pas. Réessayez.`);
    }
  }
}
