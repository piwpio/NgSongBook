/**
 * Splits a compact chord string such as `AaDeD` or `abDeGEGE`
 * into single chords: ['A','a','D','e','D'] / ['a','b','D','e','G','E','G','E'].
 *
 * Notation:
 *  - 'pl'   (default) - Polish/German naming. `H` = B natural, `B` = B flat,
 *                       lowercase = minor. A bare `b` is therefore a ROOT, never a flat.
 *  - 'intl'           - international naming, `b` right after a root means "flat".
 */
export type ChordNotation = 'pl' | 'intl';

const ROOT = /[A-Ha-h]/;

/**
 * Suffix words that may start with a letter which is also a valid root
 * (a -> add/aug, ...). They are matched BEFORE a new root is started.
 */
const SUFFIX_WORDS = ['maj', 'add', 'aug', 'sus', 'dim', 'm'];

/** Single characters that always continue the current chord. */
const SUFFIX_CHARS = new Set(['#', '+', '-', '*', '°', 'Δ', '(', ')']);

const SEPARATORS = new Set([' ', '\t', ',', ';', '|']);

function isRoot(ch: string | undefined): boolean {
  return !!ch && ROOT.test(ch);
}

function matchSuffixWord(input: string, at: number): string | null {
  for (const word of SUFFIX_WORDS) {
    if (input.startsWith(word, at)) {
      return word;
    }
  }
  return null;
}

export function tokenizeChords(raw: string, notation: ChordNotation = 'pl'): string[] {
  const input = raw ?? '';
  const chords: string[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (SEPARATORS.has(ch)) {
      i++;
      continue;
    }

    if (!isRoot(ch)) {
      // Garbage before any root - keep it as its own token so nothing is lost.
      let junk = '';
      while (i < input.length && !isRoot(input[i]) && !SEPARATORS.has(input[i])) {
        junk += input[i++];
      }
      if (junk) {
        chords.push(junk);
      }
      continue;
    }

    let chord = input[i++];
    const accidental = consumeAccidental(input, i, notation);
    chord += accidental;
    i += accidental.length;

    // Quality / extensions.
    for (;;) {
      if (i >= input.length) {
        break;
      }
      const c = input[i];

      if (c >= '0' && c <= '9') {
        chord += c;
        i++;
        continue;
      }
      if (SUFFIX_CHARS.has(c)) {
        chord += c;
        i++;
        continue;
      }
      if (c === '/' && isRoot(input[i + 1])) {
        chord += c + input[i + 1];
        i += 2;
        const bassAccidental = consumeAccidental(input, i, notation);
        chord += bassAccidental;
        i += bassAccidental.length;
        continue;
      }
      const word = matchSuffixWord(input, i);
      if (word) {
        chord += word;
        i += word.length;
        continue;
      }
      break;
    }

    chords.push(chord);
  }

  return chords;
}

function consumeAccidental(input: string, at: number, notation: ChordNotation): string {
  const c = input[at];
  if (c === '#') {
    return '#';
  }
  if (c === 'b' && notation === 'intl') {
    return 'b';
  }
  return '';
}

/** Human readable chord line, e.g. 'AaDeD' -> 'A a D e D'. */
export function formatChords(chords: string[], separator = '  '): string {
  return chords.join(separator);
}
