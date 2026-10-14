import { timeLabel } from '../../../shared/format';

export type MomentResult = { ok: true; seconds: number } | { ok: false; error: string };

const FORMAT_ERROR = 'Indiquez un moment au format mm:ss, par exemple 04:12.';

// Bare seconds (« 75 »), m:ss with one or two second digits (« 1:5 » is 1:05), or h:mm:ss.
function toSeconds(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text);
  const parts = /^(?:(\d+):)?(\d+):(\d{1,2})$/.exec(text);
  if (!parts) return null;
  const [, hours, minutes = '', seconds = ''] = parts;
  if (Number(seconds) > 59) return null;
  if (hours !== undefined && Number(minutes) > 59) return null;
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds);
}

// NFKC turns full-width digits and colons and no-break spaces into their plain forms.
function normalized(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/\s*:\s*/g, ':')
    .trim();
}

/** Reads the « Moment » field; the backend refuses a moment past the meeting too (meeting-rules.ts:29). */
export function parseMoment(input: string, duration: number): MomentResult {
  const seconds = toSeconds(normalized(input));
  if (seconds === null) return { ok: false, error: FORMAT_ERROR };
  if (seconds > duration) {
    return {
      ok: false,
      error: `Ce moment dépasse la fin de la réunion (${timeLabel(duration)}).`,
    };
  }
  return { ok: true, seconds };
}
