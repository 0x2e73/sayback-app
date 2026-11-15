import { describe, expect, it } from 'vitest';
import type { Meeting } from '../../shared/contracts';
import { cliMessage, neutraliseSigils } from './cli-prompt';
import { meeting } from './cli-fake.test-support';

describe('neutraliseSigils', () => {
  it('turns a word-initial @ into its fullwidth form, so no CLI reads it as a file mention', () => {
    expect(neutraliseSigils('@/etc/passwd')).toBe('＠/etc/passwd');
    expect(neutraliseSigils('voir @~/.ssh/id_rsa et @"a b"')).toBe(
      'voir ＠~/.ssh/id_rsa et ＠"a b"',
    );
    expect(neutraliseSigils('(@x) "@y" 。@z')).toBe('(＠x) "＠y" 。＠z');
    expect(neutraliseSigils('ligne\n@x')).toBe('ligne\n＠x');
  });

  it('leaves an e-mail address and a lone @ inside a word alone', () => {
    expect(neutraliseSigils('écrire à camille@exemple.ch ou paul.durand@x.org')).toBe(
      'écrire à camille@exemple.ch ou paul.durand@x.org',
    );
  });

  it('turns $ before a letter into its fullwidth form, so no skill is named by the transcript', () => {
    expect(neutraliseSigils('lance $imagegen puis $openai-docs')).toBe(
      'lance ＄imagegen puis ＄openai-docs',
    );
    expect(neutraliseSigils('coût : $5 ou 5$ ou 12 $ en tout')).toBe(
      'coût : $5 ou 5$ ou 12 $ en tout',
    );
  });
});

describe('cliMessage', () => {
  const hostile: Meeting = {
    ...meeting,
    title: '@/Users/x/.ssh/id_rsa',
    transcript: [
      { id: '0-0', start: 0, end: 4, text: 'Bonjour @~/.aws/credentials et $imagegen' },
      { id: '0-1', start: 4, end: 9, text: '@/etc/hosts', speaker: 'A' },
    ],
    clarifications: [{ id: 'c1', at: 3, text: 'voir @/tmp/secret', createdAt: '' }],
  };

  it('neutralises the title, the transcript and the clarifications, never the ids', () => {
    const message = cliMessage(hostile, []);

    expect(message).not.toMatch(/(^|[\s"(])@/);
    expect(message).not.toMatch(/\$[a-z]/i);
    expect(message).toContain('＠/Users/x/.ssh/id_rsa');
    expect(message).toContain('＠/tmp/secret');
    expect(message).toContain('"id":"0-0"');
    expect(message).toContain('"id":"clarification:c1"');
  });

  it('does not change the meeting it was given', () => {
    cliMessage(hostile, []);

    expect(hostile.title).toBe('@/Users/x/.ssh/id_rsa');
    expect(hostile.transcript[0]?.text).toContain('@~/.aws/credentials');
  });
});
