import {
  CliCancelledError,
  CliTimeoutError,
  CliTooMuchOutputError,
  CliUnavailableError,
} from './cli-runner';

export interface CliLabels {
  /** « Claude Code » or « Codex », as the user knows it. */
  label: string;
  /** What to type in the terminal to log in again. */
  login: string;
}

/** A failure the CLI reported itself: its text is read to classify it, never shown. */
export class CliReportedError extends Error {}

/** A refusal whose message is already the sentence to show. */
export class CliRefusalError extends Error {}

export const notInstalled = ({ label }: CliLabels) => `${label} n’est pas installé.`;
export const loginNeeded = ({ login }: CliLabels) =>
  `Connectez-vous dans le terminal avec ${login}.`;

// Order matters: a closed session is reported before a limit.
const rules: Array<[RegExp, (labels: CliLabels) => string]> = [
  [
    /unknown (option|argument|flag)|unexpected argument|unrecognized (option|argument)/i,
    ({ label }) => `Mettez à jour ${label}, cette version est trop ancienne.`,
  ],
  [
    /not logged in|\/login|log ?in|unauthorized|\b401\b|authenticat|token (has )?expired/i,
    loginNeeded,
  ],
  [
    /usage limit|rate limit|quota|limit reached|\b429\b/i,
    ({ label }) => `Limite de votre abonnement ${label} atteinte. Réessayez plus tard.`,
  ],
];

/** Maps what a CLI printed to a sentence of ours. What it printed may hold the transcript. */
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
