const APOSTROPHES = /[’‘ʼ`´]/;
// Hyphen, non-breaking hyphen and en dash read as a space.
const DASHES = /[-‑–]/;
const MARKS_AND_VARIATION_SELECTORS = /[̀-ͯ️]/g;
const LETTERS: Readonly<Record<string, string>> = { œ: 'oe', æ: 'ae', ß: 'ss', ø: 'o' };
const SPACE = /\s/;

export interface FoldedText {
  /** Case, accent, ligature, apostrophe and dash insensitive, whitespace collapsed and trimmed. */
  folded: string;
  /** For each UTF-16 unit of `folded`, the source range of the character it comes from. */
  starts: number[];
  ends: number[];
}

export interface TextRange {
  start: number;
  end: number;
}

// One code point at a time, so every folded unit keeps its origin; NFKD only decomposes.
function foldChar(char: string): string {
  if (APOSTROPHES.test(char)) return "'";
  if (DASHES.test(char)) return ' ';
  const bare = char
    .normalize('NFKD')
    .replace(MARKS_AND_VARIATION_SELECTORS, '')
    .toLocaleLowerCase('fr-CH');
  return Array.from(bare, (letter) => LETTERS[letter] ?? letter).join('');
}

function append(result: FoldedText, folded: string, start: number, end: number): void {
  // A dropped accent belongs to the letter before it: a highlight takes both.
  if (folded === '' && result.ends.length > 0) result.ends[result.ends.length - 1] = end;
  for (const letter of folded) {
    const space = SPACE.test(letter);
    if (space && (result.folded === '' || result.folded.endsWith(' '))) continue;
    const unit = space ? ' ' : letter;
    result.folded += unit;
    for (let index = 0; index < unit.length; index += 1) {
      result.starts.push(start);
      result.ends.push(end);
    }
  }
}

export function foldText(text: string): FoldedText {
  const result: FoldedText = { folded: '', starts: [], ends: [] };
  let offset = 0;
  for (const char of text) {
    const end = offset + char.length;
    append(result, foldChar(char), offset, end);
    offset = end;
  }
  if (result.folded.endsWith(' ')) {
    result.folded = result.folded.slice(0, -1);
    result.starts.pop();
    result.ends.pop();
  }
  return result;
}

export function normalizeSearch(text: string): string {
  return foldText(text).folded;
}

/** Ranges of the source text; two matches inside one expanded letter (« ss » from ß) give one. */
export function findMatches(
  { folded, starts, ends }: FoldedText,
  needle: string,
  limit: number,
): TextRange[] {
  const found: TextRange[] = [];
  if (!needle) return found;
  let from = folded.indexOf(needle);
  while (from >= 0 && found.length < limit) {
    const start = starts[from] ?? 0;
    const end = ends[from + needle.length - 1] ?? start;
    const last = found[found.length - 1];
    if (!last || start >= last.end) found.push({ start, end });
    from = folded.indexOf(needle, from + needle.length);
  }
  return found;
}
