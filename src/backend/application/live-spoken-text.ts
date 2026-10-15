// What Whisper writes for what is not speech: « [BLANK_AUDIO] », « (musique) », « *rires* », « ♪ ».
const MARKS = [/\[[^[\]]*\]/g, /\([^()]*\)/g, /\*[^*]*\*/g];
const NOTES = /[♪♫]/g;

/** The words only. Marks are removed from the innermost out, so « [[x]] » goes too. */
export function spokenText(raw: string): string {
  let text = raw.replace(NOTES, ' ');
  for (let previous = ''; previous !== text;) {
    previous = text;
    for (const mark of MARKS) text = text.replace(mark, ' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}
