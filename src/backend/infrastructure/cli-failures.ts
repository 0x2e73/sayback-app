import {
  CliCancelledError,
  CliTimeoutError,
  CliTooMuchOutputError,
  CliUnavailableError,
} from './cli-runner';

export interface CliLabels {
  /** « Claude Code » or « Codex », as the user knows it. */
  label: string;
}

/** A failure the CLI reported itself: its text is read to classify it, never shown. */
export class CliReportedError extends Error {}

/** A refusal whose message is already the sentence to show. */
export class CliRefusalError extends Error {}

export const notInstalled = ({ label }: CliLabels) => `${label} n’est pas installé.`;
export const loginNeeded = ({ label }: CliLabels) =>
  `Votre session ${label} est fermée : reconnectez-vous à ${label}, puis réessayez.`;
export const brokenInstall = ({ label }: CliLabels) =>
  `L’installation de ${label} semble endommagée : réinstallez ${label}, puis réessayez.`;
export const toolRefused = ({ label }: CliLabels) =>
  `${label} a tenté d’utiliser un outil. Notes refusées. Relancez l’analyse ou choisissez un autre fournisseur.`;

/**
 * A program that cannot start is not a closed session: the shell says 127 (not found) or 126 (not
 * executable), which includes a `#!/usr/bin/env node` launcher without node. Only the exit code
 * says it: a warning on stderr ("No such file or directory (os error 2)") proves nothing.
 */
export function looksBroken(output: { exitCode: number }): boolean {
  return output.exitCode === 126 || output.exitCode === 127;
}

// A status code counts only next to a word that says it is one: `"output_tokens":401` is a count.
const statusCode = (codes: string) =>
  `\\b(?:http|status|error|code)\\b[^0-9\\n]{0,15}\\b(?:${codes})\\b`;

// Order matters: a closed session is reported before a limit.
const rules: Array<[RegExp, (labels: CliLabels) => string]> = [
  [
    /unknown (option|argument|flag)|unexpected argument|unrecognized (option|argument)/i,
    ({ label }) => `Mettez à jour ${label}, cette version est trop ancienne.`,
  ],
  [
    new RegExp(
      `not logged in|please (?:run )?/login|\\blog ?in\\b|unauthorized|authenticat|token (?:has )?expired|${statusCode('401')}`,
      'i',
    ),
    loginNeeded,
  ],
  [
    new RegExp(`usage limit|rate limit|quota|limit reached|${statusCode('429')}`, 'i'),
    ({ label }) => `Limite de votre abonnement ${label} atteinte. Réessayez plus tard.`,
  ],
];

/**
 * Maps the error text of a CLI (its stderr, or the message it flagged as an error) to a sentence
 * of ours. Never give it what the model wrote: that is the transcript's words, not a diagnosis.
 */
export function explainOutput(text: string, labels: CliLabels): string {
  const rule = rules.find(([pattern]) => pattern.test(text));
  return rule ? rule[1](labels) : `${labels.label} n’a pas pu créer les notes. Réessayez.`;
}

export function explainError(error: unknown, labels: CliLabels): Error {
  if (error instanceof CliUnavailableError) return new Error(notInstalled(labels));
  if (error instanceof CliCancelledError) return new Error('Analyse interrompue.');
  if (error instanceof CliTimeoutError) {
    return new Error(`${labels.label} a mis trop de temps. Votre enregistrement est conservé.`);
  }
  if (error instanceof CliTooMuchOutputError) {
    return new Error(`Réponse ${labels.label} trop volumineuse. Relancez l’analyse.`);
  }
  return error instanceof Error ? error : new Error(`${labels.label} n’a pas pu créer les notes.`);
}
