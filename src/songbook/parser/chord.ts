/**
 * Chords in two notations, and the translation between them.
 *
 * English / American:   A  B  C  D  E  F  G,  C#  Db,  minor as Am, C#m
 * Polish / German:      A  H  C  D  E  F  G,  Cis Des, minor as lowercase: a, cis
 *
 * The two disagree on the letter B, which is the whole reason a song has to say
 * which one it is written in:
 *
 *   English B   = Polish H        (B natural)
 *   English Bb  = Polish B        (B flat)
 *
 * A chord is parsed into a neutral shape - an English letter plus an accidental -
 * and printed back out in whichever notation the document asks for. Everything
 * after the root travels untouched: 7, sus4, maj7, add9, dim, aug are written the
 * same in both.
 */

export type ChordNotation = 'pl' | 'en';

/** The seven natural notes, named the English way: this is the neutral form. */
export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export interface ChordRoot {
  step: Step;
  /** -1 flat, 0 natural, +1 sharp. */
  accidental: -1 | 0 | 1;
}

export interface Chord {
  root: ChordRoot;
  minor: boolean;
  /** Everything after the root and the minor marker, carried over verbatim. */
  suffix: string;
  /** The note after a slash, as in C/G. Never minor. */
  bass?: ChordRoot;
  /** The token exactly as written. */
  raw: string;
  /** False when the token could not be read - it is then printed as written. */
  known: boolean;
}

// ----------------------------------------------------------------- the maps

/** Polish spelling of every root. The flats are the irregular part. */
const PL_NATURAL: Record<Step, string> = {
  C: 'C',
  D: 'D',
  E: 'E',
  F: 'F',
  G: 'G',
  A: 'A',
  B: 'H',
};

const PL_SHARP: Record<Step, string> = {
  C: 'Cis',
  D: 'Dis',
  E: 'Eis',
  F: 'Fis',
  G: 'Gis',
  A: 'Ais',
  B: 'His',
};

const PL_FLAT: Record<Step, string> = {
  C: 'Ces',
  D: 'Des',
  E: 'Es',
  F: 'Fes',
  G: 'Ges',
  A: 'As',
  B: 'B',
};

/**
 * Every Polish spelling, longest first so `Cis` wins over `C` and `As` over `A`.
 * Built from the maps above, so the two can never drift apart.
 */
const PL_ROOTS: { spelling: string; root: ChordRoot }[] = [
  ...Object.entries(PL_SHARP).map(([step, spelling]) => ({
    spelling,
    root: { step: step as Step, accidental: 1 as const },
  })),
  ...Object.entries(PL_FLAT).map(([step, spelling]) => ({
    spelling,
    root: { step: step as Step, accidental: -1 as const },
  })),
  ...Object.entries(PL_NATURAL).map(([step, spelling]) => ({
    spelling,
    root: { step: step as Step, accidental: 0 as const },
  })),
].sort((a, b) => b.spelling.length - a.spelling.length);

const ENGLISH_STEPS = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B']);

/** `maj` is not the minor marker, and `sus` must not be eaten by `As`/`Es`. */
const MAJ = /^maj/i;
const SUS_AFTER_FLAT = /^us/i;

// ------------------------------------------------------------------ parsing

export function parseChord(raw: string, notation: ChordNotation): Chord {
  const token = raw.trim();
  const unknown: Chord = {
    root: { step: 'C', accidental: 0 },
    minor: false,
    suffix: '',
    raw: token,
    known: false,
  };

  if (!token) {
    return unknown;
  }

  const head = notation === 'pl' ? readPolishRoot(token) : readEnglishRoot(token);
  if (!head) {
    return unknown;
  }

  let rest = head.rest;
  let minor = head.minor;

  // Both notations tolerate an explicit `m`: it is how English marks a minor
  // chord, and a Polish file that happens to use it means the same thing.
  if (/^m/i.test(rest) && !MAJ.test(rest)) {
    minor = true;
    rest = rest.slice(1);
  }

  let bass: ChordRoot | undefined;
  const slash = rest.indexOf('/');
  if (slash >= 0) {
    const bassHead = notation === 'pl' ? readPolishRoot(rest.slice(slash + 1)) : readEnglishRoot(rest.slice(slash + 1));
    if (bassHead && bassHead.rest === '') {
      bass = bassHead.root;
      rest = rest.slice(0, slash);
    }
  }

  return { root: head.root, minor, suffix: rest, bass, raw: token, known: true };
}

interface RootMatch {
  root: ChordRoot;
  minor: boolean;
  rest: string;
}

function readEnglishRoot(token: string): RootMatch | null {
  const letter = token[0]?.toUpperCase();
  if (!letter || !ENGLISH_STEPS.has(letter)) {
    return null;
  }

  let accidental: -1 | 0 | 1 = 0;
  let length = 1;
  const next = token[1];
  if (next === '#') {
    accidental = 1;
    length = 2;
  } else if (next === 'b') {
    accidental = -1;
    length = 2;
  }

  return {
    root: { step: letter as Step, accidental },
    // English never uses case to mean minor; a lowercase token is just sloppy.
    minor: false,
    rest: token.slice(length),
  };
}

function readPolishRoot(token: string): RootMatch | null {
  for (const { spelling, root } of PL_ROOTS) {
    if (token.length < spelling.length) {
      continue;
    }
    const head = token.slice(0, spelling.length);
    if (head.toLowerCase() !== spelling.toLowerCase()) {
      continue;
    }

    // `asus4` is A minor with a sus4, not A flat followed by `us4`. Same for Es.
    const rest = token.slice(spelling.length);
    if (spelling.length === 2 && spelling.toLowerCase().endsWith('s') && SUS_AFTER_FLAT.test(rest)) {
      continue;
    }

    return { root, minor: head[0] === head[0].toLowerCase(), rest };
  }

  // A Polish file may still spell a chord the English way: C#, Db.
  const english = readEnglishRoot(token);
  if (english && (token[1] === '#' || token[1] === 'b')) {
    return { ...english, minor: token[0] === token[0].toLowerCase() };
  }
  return null;
}

// --------------------------------------------------------------- formatting

export function formatChord(chord: Chord, notation: ChordNotation): string {
  if (!chord.known) {
    return chord.raw;
  }

  const root = notation === 'pl' ? polishRoot(chord.root, chord.minor) : englishRoot(chord.root);
  const minorMark = notation === 'en' && chord.minor ? 'm' : '';
  const bass = chord.bass ? `/${notation === 'pl' ? polishRoot(chord.bass, false) : englishRoot(chord.bass)}` : '';

  return `${root}${minorMark}${chord.suffix}${bass}`;
}

function englishRoot(root: ChordRoot): string {
  const accidental = root.accidental === 1 ? '#' : root.accidental === -1 ? 'b' : '';
  return `${root.step}${accidental}`;
}

function polishRoot(root: ChordRoot, minor: boolean): string {
  const table = root.accidental === 1 ? PL_SHARP : root.accidental === -1 ? PL_FLAT : PL_NATURAL;
  const spelling = table[root.step];
  // Polish marks a minor chord by writing the whole root in lower case.
  return minor ? spelling.toLowerCase() : spelling;
}

// --------------------------------------------------------------- detection

/**
 * Guesses which notation a song was written in.
 *
 * Only the markers that exist in one notation and not the other count: an `m`
 * for minor is English, a lower-case root or an `is`/`es` spelling or an `H` is
 * Polish. Chords like `E` or `A` say nothing and are ignored. Returns null when
 * nothing decisive was found, which is the caller's cue to use its default.
 */
export function detectNotation(tokens: string[]): ChordNotation | null {
  let english = 0;
  let polish = 0;

  for (const token of tokens) {
    if (/^[A-G](#|b)?m(?!aj)/.test(token)) {
      english++;
    }
    if (/^[A-G]b/.test(token)) {
      english++;
    }
    if (/^[a-h]/.test(token)) {
      polish++;
    }
    if (/^[A-Ha-h](is|es)/i.test(token)) {
      polish++;
    }
    if (/^[Hh]/.test(token)) {
      polish++;
    }
  }

  if (english === polish) {
    return null;
  }
  return english > polish ? 'en' : 'pl';
}

/** Reads the value of a `{notation}` tag. */
export function parseNotation(value: string | undefined): ChordNotation | null {
  switch (value?.trim().toLowerCase()) {
    case 'pl':
    case 'pol':
    case 'polish':
    case 'de':
    case 'german':
      return 'pl';
    case 'en':
    case 'eng':
    case 'english':
    case 'us':
    case 'american':
    case 'intl':
      return 'en';
    default:
      return null;
  }
}
