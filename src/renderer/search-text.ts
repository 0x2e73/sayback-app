const APOSTROPHES = /[\u2019\u2018\u02bc\u0060\u00b4]/;
// Hyphen, non-breaking hyphen and en dash read as a space.
const DASHES = /[-\u2011\u2013]/;
const MARKS_AND_VARIATION_SELECTORS = /[\u0300-\u036f\ufe0f]/g;
const LETTERS: Readonly<Record<string, string>> = {
  '\u0153': 'oe',
  '\u00e6': 'ae',
  '\u00df': 'ss',
  '\u00f8': 'o',
};
const SPACE = /\s/;
const NON_ASCII = /\P{ASCII}/u;
const ASCII_LIMIT = 0x80;

export interface FoldedText {
  /** Case, accent, ligature, apostrophe and dash insensitive, whitespace collapsed and trimmed. */
  folded: string;
  /** For each UTF-16 unit of `folded`, the source range of the character it comes from. */
  starts: number[];
  ends: number[];
  /** Source ranges of the grapheme clusters longer than one unit, in order: a match never cuts one. */
  clusters: TextRange[];
}

export interface TextRange {
  start: number;
  end: number;
}

// Most text is ASCII: skip the Unicode normalisation for it.
function foldAscii(code: number, char: string): string {
  if (code === 0x60) return "'";
  if (code === 0x2d) return ' ';
  return code >= 0x41 && code <= 0x5a ? String.fromCharCode(code + 0x20) : char;
}

// One code point at a time, so every folded unit keeps its origin; NFKD only decomposes.
function foldChar(char: string): string {
  const code = char.charCodeAt(0);
  if (code < ASCII_LIMIT) return foldAscii(code, char);
  if (APOSTROPHES.test(char)) return "'";
  if (DASHES.test(char)) return ' ';
  const bare = char
    .normalize('NFKD')
    .replace(MARKS_AND_VARIATION_SELECTORS, '')
    .toLocaleLowerCase('fr-CH');
  return Array.from(bare, (letter) => LETTERS[letter] ?? letter).join('');
}

interface Folding {
  /** Pieces of `folded`: appending to a string and reading its end is quadratic on a long text. */
  pieces: string[];
  starts: number[];
  ends: number[];
  lastIsSpace: boolean;
}

function append(folding: Folding, folded: string, start: number, end: number): void {
  // A dropped accent belongs to the letter before it: a highlight takes both.
  if (folded === '' && folding.ends.length > 0) folding.ends[folding.ends.length - 1] = end;
  for (const letter of folded) {
    const space = SPACE.test(letter);
    if (space && (folding.pieces.length === 0 || folding.lastIsSpace)) continue;
    const unit = space ? ' ' : letter;
    folding.pieces.push(unit);
    folding.lastIsSpace = space;
    for (let index = 0; index < unit.length; index += 1) {
      folding.starts.push(start);
      folding.ends.push(end);
    }
  }
}

let segmenter: Intl.Segmenter | undefined;

// Computed once per text, and only when something beyond ASCII can join into a cluster.
function clustersOf(text: string): TextRange[] {
  if (!NON_ASCII.test(text)) return [];
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const found: TextRange[] = [];
  for (const { segment, index } of segmenter.segment(text)) {
    if (segment.length > 1) found.push({ start: index, end: index + segment.length });
  }
  return found;
}

export function foldText(text: string): FoldedText {
  const folding: Folding = { pieces: [], starts: [], ends: [], lastIsSpace: false };
  let offset = 0;
  for (const char of text) {
    const end = offset + char.length;
    append(folding, foldChar(char), offset, end);
    offset = end;
  }
  if (folding.lastIsSpace) {
    folding.pieces.pop();
    folding.starts.pop();
    folding.ends.pop();
  }
  return {
    folded: folding.pieces.join(''),
    starts: folding.starts,
    ends: folding.ends,
    clusters: clustersOf(text),
  };
}

export function normalizeSearch(text: string): string {
  return foldText(text).folded;
}

/** The cluster holding a source offset, found by bisection; undefined for a lone unit. */
function clusterAt(clusters: readonly TextRange[], offset: number): TextRange | undefined {
  let low = 0;
  let high = clusters.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const cluster = clusters[middle];
    if (!cluster) return undefined;
    if (offset < cluster.start) high = middle - 1;
    else if (offset >= cluster.end) low = middle + 1;
    else return cluster;
  }
  return undefined;
}

/** A highlight takes the whole emoji or accented letter it touches, never half of it. */
function wholeClusters(clusters: readonly TextRange[], start: number, end: number): TextRange {
  return {
    start: clusterAt(clusters, start)?.start ?? start,
    end: clusterAt(clusters, end - 1)?.end ?? end,
  };
}

/** Ranges of the source text; two matches inside one expanded letter (« ss » from ß) give one. */
export function findMatches(
  { folded, starts, ends, clusters }: FoldedText,
  needle: string,
  limit: number,
): TextRange[] {
  const found: TextRange[] = [];
  if (!needle) return found;
  let from = folded.indexOf(needle);
  while (from >= 0 && found.length < limit) {
    const first = starts[from] ?? 0;
    const range = wholeClusters(clusters, first, ends[from + needle.length - 1] ?? first);
    const last = found[found.length - 1];
    if (!last || range.start >= last.end) found.push(range);
    from = folded.indexOf(needle, from + needle.length);
  }
  return found;
}
