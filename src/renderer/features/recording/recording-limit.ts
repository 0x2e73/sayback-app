/**
 * A recording stops by itself after two hours of recorded time: pauses and sleep do not count.
 * The capture times it, not the view: a hidden window throttles its timers.
 */
export const MAX_RECORDING_SECONDS = 7200;

export const RECORDING_LIMIT_NOTE = 'L’enregistrement s’arrête de lui-même au bout de 2 heures.';
