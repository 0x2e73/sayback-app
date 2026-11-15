import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CliCancelledError,
  CliTimeoutError,
  CliTooMuchOutputError,
  CliUnavailableError,
  spawnCliRunner,
  type CliRun,
} from './cli-runner';

// A real child process, but always `node` itself: no CLI of a provider is ever started here.
let directory = '';

beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'sayback-runner-')));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function run(script: string, overrides: Partial<CliRun> = {}): CliRun {
  return {
    command: process.execPath,
    args: ['-e', script],
    input: '',
    cwd: directory,
    env: {},
    timeoutMs: 10_000,
    maxOutputBytes: 100_000,
    ...overrides,
  };
}

describe('spawnCliRunner', () => {
  it('feeds the input on stdin and answers with the exit code and both streams', async () => {
    const script =
      "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(d.toUpperCase());console.error('warn');process.exit(3)})";

    const output = await spawnCliRunner(run(script, { input: 'bonjour' }));

    expect(output).toEqual({ exitCode: 3, stdout: 'BONJOUR\n', stderr: 'warn\n' });
  });

  it('starts in the given folder with only the given environment', async () => {
    // macOS adds __CF_USER_TEXT_ENCODING to every process it starts: not ours to remove.
    const script =
      'const {__CF_USER_TEXT_ENCODING:_,...env}=process.env;console.log(JSON.stringify({cwd:process.cwd(),env}))';

    const output = await spawnCliRunner(run(script, { env: { ONLY: 'this' } }));

    expect(JSON.parse(output.stdout)).toEqual({ cwd: directory, env: { ONLY: 'this' } });
  });

  it('passes an argument as one literal word: nothing is interpreted by a shell', async () => {
    const hostile = '$(touch pwned); `touch pwned`; echo done > pwned';
    const script = 'console.log(JSON.stringify(process.argv.slice(1)))';

    const output = await spawnCliRunner(run(script, { args: ['-e', script, hostile] }));

    expect(JSON.parse(output.stdout)).toEqual([hostile]);
    expect(await readdir(directory)).toEqual([]);
  });

  it('stops a process that outlives its time limit', async () => {
    const started = Date.now();

    await expect(
      spawnCliRunner(run('setInterval(()=>{},1000)', { timeoutMs: 200 })),
    ).rejects.toBeInstanceOf(CliTimeoutError);

    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('stops a process whose output grows past the limit', async () => {
    const script = "setInterval(()=>process.stdout.write('x'.repeat(1000)),1)";

    await expect(spawnCliRunner(run(script, { maxOutputBytes: 5_000 }))).rejects.toBeInstanceOf(
      CliTooMuchOutputError,
    );
  });

  it('stops a process when the signal fires, and never starts one for a spent signal', async () => {
    const controller = new AbortController();
    const pending = spawnCliRunner(run('setInterval(()=>{},1000)', { signal: controller.signal }));
    setTimeout(() => controller.abort(), 100);
    await expect(pending).rejects.toBeInstanceOf(CliCancelledError);

    await expect(
      spawnCliRunner(
        run("require('fs').writeFileSync('started','1')", { signal: AbortSignal.abort() }),
      ),
    ).rejects.toBeInstanceOf(CliCancelledError);
    expect(await readdir(directory)).toEqual([]);
  });

  it('reports a program that does not exist', async () => {
    await expect(
      spawnCliRunner(run('', { command: join(directory, 'missing-cli') })),
    ).rejects.toBeInstanceOf(CliUnavailableError);
  });
});
