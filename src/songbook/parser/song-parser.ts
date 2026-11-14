import { Song, SongBlock, SongBlockKind, SongMeta } from '../model/song.model';
import { ChordNotation, detectNotation, parseNotation } from './chord';
import { parseChords, tokenizeChords } from './chord-tokenizer';

export const SONG_FORMAT = {
  /**
   * `{title}...`, `{author}...`, `{extra}...` - one per line, at the top of the
   * file. Square brackets are accepted for every tag too, with a warning.
   */
  metaLine: /^\s*(?:\{([a-zA-Z][\w-]*)\}|\[([a-zA-Z][\w-]*)\])[ \t]?(.*)$/,
  /** Everything after the first `|` on a lyrics line is the chord string. */
  chordSeparator: '|',
  /**
   * `{ref}` opens a chorus; `{ref1}`, `{ref5}`, ... are separate choruses in
   * the same song. With lyrics after it the marker WRITES OUT that chorus,
   * alone on its line it REPEATS the one written out under that number.
   *
   * Numbers need not run in order, and `{ref}` is a chorus of its own - NOT a
   * synonym for `{ref1}`. Mixing the two in one song is a mistake worth
   * hearing about rather than quietly aliasing.
   */
  chorusMarker: /^\{ref(\d*)}\s*/i,
  /** The same marker in square brackets - accepted, warned about. */
  chorusMarkerBrackets: /^\[ref(\d*)]\s*/i,
  /**
   * `{ver}`, `{ver1}`, `{ver7}` - a verse whose chords repeat. Written out with
   * lyrics the first time, it becomes the pattern; a later `{ver1}` with new
   * words borrows that pattern line by line, and `{ver1}` on its own prints the
   * verse again. Same idea as `{ref}`, without the chorus indent.
   */
  verseMarker: /^\{ver(\d*)}\s*/i,
  verseMarkerBrackets: /^\[ver(\d*)]\s*/i,
  /** Spelled out as a word, from before the tag syntax - accepted, warned about. */
  chorusMarkerWord: /^(?:ref|refren|refr|chorus)(\d*)(?:\.|:|\s|$)\s*/i,
  /** `{chords}` followed by chords - an instrumental line with no lyrics. */
  chordsLine: /^(?:\{chords}|\[chords])\s*/i,
  /**
   * Keys that look like meta but are not: they open the body of the song, so
   * the meta scan has to stop when it meets one. `ref`, `ref1`, `ref2`, ...
   */
  bodyMarkerKey: /^(?:ref\d*|ver\d*|chords)$/i,
  knownMetaKeys: ['title', 'author', 'extra', 'notation'] as const,
} as const;

export interface ParseSongOptions {
  /**
   * Which notation to read the chords as when the file neither declares one
   * with `{notation}` nor gives the guess anything to go on.
   */
  defaultNotation?: ChordNotation;
  /** Fallback title when the file has no `{title}`. Defaults to the prettified file name. */
  fallbackTitle?: string;
}

export function parseSong(raw: string, sourceFile = '', options: ParseSongOptions = {}): Song {
  const warnings: string[] = [];
  const errors: string[] = [];

  const lines = normalise(raw).split('\n');
  const { meta, rest } = readMeta(lines, warnings);

  // Which notation the chords are written in. Declared beats guessed, guessed
  // beats the default - a songbook holds songs copied from all sorts of places,
  // so this cannot be one setting for the whole run.
  const declared = parseNotation(meta['notation']);
  if (meta['notation'] && !declared) {
    warnings.push(`Unknown {notation} "${meta['notation']}" - expected pl or en.`);
  }
  const guessed = declared ? null : detectNotation(collectChordTokens(rest));
  const notation = declared ?? guessed ?? options.defaultNotation ?? 'pl';

  // {title} and {author} are required; {extra} is not.
  const title = meta['title'] ?? options.fallbackTitle ?? prettifyFileName(sourceFile);
  if (!meta['title']) {
    errors.push('Missing {title}.');
  }
  if (!meta['author']) {
    errors.push('Missing {author}.');
  }

  const songMeta: SongMeta = { title, notation, notationGuessed: !declared };
  if (meta['author']) {
    songMeta.author = meta['author'];
  }
  if (meta['extra']) {
    songMeta.extra = meta['extra'];
  }

  const blocks = parseBlocks(rest, notation, warnings, errors);
  if (blocks.length === 0) {
    errors.push('The song has no lyrics.');
  }

  return {
    id: slugify(sourceFile || title),
    sourceFile,
    meta: songMeta,
    blocks,
    raw,
    valid: errors.length === 0,
    // The same remark can be triggered by many lines; say it once.
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

export function parseSongs(files: { name: string; content: string }[], options: ParseSongOptions = {}): Song[] {
  return files.map(file => parseSong(file.content, file.name, options));
}

// ---------------------------------------------------------------- internals

const NON_BREAKING_SPACE = String.fromCharCode(0xa0);

function normalise(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').split(NON_BREAKING_SPACE).join(' ').trimEnd();
}

/**
 * Meta lines live at the top of the file. Scanning (instead of splitting on a
 * fixed blank-line count) means a file may have no meta at all, blank lines
 * between meta entries, or any number of blank lines before the lyrics.
 */
function readMeta(lines: string[], warnings: string[]): { meta: Record<string, string>; rest: string[] } {
  const meta: Record<string, string> = {};
  let index = 0;

  for (; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() === '') {
      continue;
    }
    const match = SONG_FORMAT.metaLine.exec(line);
    if (!match) {
      break;
    }
    const key = (match[1] ?? match[2]).toLowerCase();
    if (match[2] !== undefined) {
      warnings.push(BRACKET_WARNING);
    }
    if (SONG_FORMAT.bodyMarkerKey.test(key)) {
      // `{ref}`, `{ref2}`, `{chords}` look like meta lines but open the body.
      break;
    }
    const value = match[3].trim();
    if (!(SONG_FORMAT.knownMetaKeys as readonly string[]).includes(key)) {
      warnings.push(`Unknown meta key: {${key}}`);
    }
    if (value) {
      meta[key] = value;
    }
  }

  return { meta, rest: lines.slice(index) };
}

type TagSyntax = 'braces' | 'brackets' | 'word';

interface BlockMarker {
  kind: SongBlockKind;
  /** Which one: '' for a bare `{ref}` / `{ver}`, otherwise the number written. */
  key: string;
  /** What follows the marker - empty means "repeat", non-empty means "write out". */
  rest: string;
  syntax: TagSyntax;
}

/** `{ref007}` and `{ref7}` are the same chorus; `{ref}` is its own. */
function chorusKeyOf(digits: string): string {
  return digits ? String(Number(digits)) : '';
}

function blockLabel(kind: SongBlockKind, key: string): string {
  const tag = kind === 'chorus' ? 'ref' : 'ver';
  return `{${tag}${key}}`;
}

/** The number a block was tagged with, whichever kind of block it is. */
function patternKeyOf(block: SongBlock): string | undefined {
  return block.kind === 'chorus' ? block.chorusKey : block.verseKey;
}

function matchBlockMarker(line: string): BlockMarker | null {
  const forms: [RegExp, SongBlockKind, TagSyntax][] = [
    [SONG_FORMAT.chorusMarker, 'chorus', 'braces'],
    [SONG_FORMAT.verseMarker, 'verse', 'braces'],
    [SONG_FORMAT.chorusMarkerBrackets, 'chorus', 'brackets'],
    [SONG_FORMAT.verseMarkerBrackets, 'verse', 'brackets'],
    [SONG_FORMAT.chorusMarkerWord, 'chorus', 'word'],
  ];

  for (const [pattern, kind, syntax] of forms) {
    const match = pattern.exec(line);
    if (match) {
      return {
        kind,
        key: chorusKeyOf(match[1]),
        rest: line.slice(match[0].length).trim(),
        syntax,
      };
    }
  }
  return null;
}

function noteSyntax(syntax: TagSyntax, warnings: string[]): void {
  if (syntax === 'brackets') {
    warnings.push(BRACKET_WARNING);
  } else if (syntax === 'word') {
    warnings.push(WORD_CHORUS_WARNING);
  }
}

function parseBlocks(lines: string[], notation: ChordNotation, warnings: string[], errors: string[]): SongBlock[] {
  const blocks: SongBlock[] = [];
  let current: SongBlock | null = null;
  /**
   * Every tagged block written out so far, by number - the chord patterns a
   * later block of the same tag borrows, and what a bare marker prints again.
   * Choruses and verses are kept apart so `{ref1}` and `{ver1}` are two things.
   */
  const written: Record<SongBlockKind, Map<string, SongBlock>> = { chorus: new Map(), verse: new Map() };
  /** Chords carry over line after line, and across blocks, until replaced. */
  let lastChords = '';
  /** The block the open block is borrowing its chords from, if any. */
  let pattern: SongBlock | null = null;
  let patternAt = 0;

  const closeBlock = () => {
    const block = current;
    const key = block ? patternKeyOf(block) : undefined;
    if (block && block.lines.length > 0) {
      blocks.push(block);
      if (!block.isRepeat && key !== undefined) {
        const label = blockLabel(block.kind, key);
        const named = block.kind === 'chorus' ? 'chorus' : 'verse';
        // Numbered, but with nothing to borrow and nothing of its own - almost
        // always a number that does not match the block it was meant to copy.
        // Only numbers can be mistyped: a bare `{ver}` or `{ref}` is just how
        // a block is opened, and it may well live off the chords carried in.
        if (key !== '' && !pattern && !block.lines.some(line => line.chordsExplicit)) {
          warnings.push(`${label} has no chords of its own and no ${named} of that number to borrow from.`);
        }
        if (pattern && pattern.lines.length !== block.lines.length) {
          warnings.push(
            `${label} has ${block.lines.length} lines but its chords were written for ${pattern.lines.length} - the pattern repeats to fill it.`
          );
        }
        // The first block under a number is the one its tag stands for: the
        // chords later ones borrow, and the text a bare marker prints again.
        const store = written[block.kind];
        if (!store.has(key)) {
          store.set(key, block);
        }
      }
    }
    current = null;
    pattern = null;
    patternAt = 0;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed === '') {
      closeBlock();
      continue;
    }

    const marker = matchBlockMarker(trimmed);

    // A marker alone on its line is not lyrics - it prints that block again.
    if (marker && marker.rest === '') {
      closeBlock();
      noteSyntax(marker.syntax, warnings);
      const defined = written[marker.kind].get(marker.key);
      if (defined) {
        blocks.push(repeatOf(defined));
      } else {
        errors.push(`${blockLabel(marker.kind, marker.key)} is used before it is written out.`);
      }
      continue;
    }

    // `{chords}` is a passage with no words - an intro, a bridge, an interlude.
    // It does NOT touch the running chords: whatever follows still inherits the
    // chords of the last line that had lyrics.
    const chordsMatch = SONG_FORMAT.chordsLine.exec(trimmed);
    if (chordsMatch) {
      if (chordsMatch[0].startsWith('[')) {
        warnings.push(BRACKET_WARNING);
      }
      const rest = trimmed.slice(chordsMatch[0].length).trim();
      const chordText = rest.includes(SONG_FORMAT.chordSeparator) ? rest.slice(rest.indexOf(SONG_FORMAT.chordSeparator) + 1).trim() : rest;

      if (!chordText) {
        warnings.push('{chords} with no chords after it - skipped.');
        continue;
      }

      current ??= { kind: 'verse', lines: [] };
      current.lines.push({
        lyrics: '',
        rawChords: chordText,
        chords: parseChords(chordText, notation),
        chordsExplicit: true,
        chordsOnly: true,
      });
      continue;
    }

    const separatorAt = rawLine.indexOf(SONG_FORMAT.chordSeparator);
    const hasOwnChords = separatorAt >= 0;
    let lyrics = (hasOwnChords ? rawLine.slice(0, separatorAt) : rawLine).trim();
    const ownChords = hasOwnChords ? rawLine.slice(separatorAt + 1).trim() : '';

    // A bare `|` with nothing after it is a declaration too: it says this line
    // has NO chords. Like any other declaration it then holds for the lines
    // that follow, until the next `|`.
    if (hasOwnChords) {
      lastChords = ownChords;
    }

    if (!current) {
      const opening = matchBlockMarker(lyrics);
      if (opening && opening.rest !== '') {
        noteSyntax(opening.syntax, warnings);
        lyrics = opening.rest;

        // The first block under a number writes the pattern down; every later
        // one borrows it for new words. That is the point of tagging at all,
        // and a chorus works exactly like a verse here - a song that sings the
        // same tune to eight different choruses is written, not repeated.
        pattern = written[opening.kind].get(opening.key) ?? null;
        patternAt = 0;
        current =
          opening.kind === 'chorus'
            ? { kind: 'chorus', chorusKey: opening.key, lines: [] }
            : { kind: 'verse', verseKey: opening.key, lines: [] };
      } else {
        current = { kind: 'verse', lines: [] };
      }
    }

    // A line that declares anything of its own - chords or a bare `|` - keeps
    // what it declared. Otherwise a borrowed pattern wins over what the running
    // chords happen to be, and the pattern repeats if the verse is longer.
    let rawChords = lastChords;
    if (pattern && !hasOwnChords && pattern.lines.length > 0) {
      rawChords = pattern.lines[patternAt % pattern.lines.length].rawChords;
    }
    patternAt += 1;

    current.lines.push({
      lyrics,
      rawChords,
      chords: parseChords(rawChords, notation),
      chordsExplicit: hasOwnChords && ownChords.length > 0,
    });
  }

  closeBlock();
  return blocks;
}

const BRACKET_WARNING = 'Tag written in square brackets - braces are the form to use, e.g. {title} or {ref1}.';
const WORD_CHORUS_WARNING = 'Chorus marked with a bare word - write {ref} instead.';

/**
 * A copy of the chorus for a bare `[ref]`. The chords come along, and the
 * running chord state is left alone, so whatever follows picks up where the
 * verse before the chorus left off.
 */
function repeatOf(block: SongBlock): SongBlock {
  return {
    ...block,
    isRepeat: true,
    lines: block.lines.map(line => ({ ...line, chords: [...line.chords] })),
  };
}

/**
 * Every chord token in the body, used to guess the notation before the song is
 * properly parsed. Tokenised as Polish on purpose: that split never swallows a
 * `b` into the root, so an English `Bb` still shows up as evidence.
 */
function collectChordTokens(lines: string[]): string[] {
  const tokens: string[] = [];
  for (const line of lines) {
    const at = line.indexOf(SONG_FORMAT.chordSeparator);
    const source =
      at >= 0 ? line.slice(at + 1) : SONG_FORMAT.chordsLine.test(line.trim()) ? line.trim().replace(SONG_FORMAT.chordsLine, '') : '';
    if (source.trim()) {
      tokens.push(...tokenizeChords(source.trim(), 'pl'));
    }
  }
  return tokens;
}

export function prettifyFileName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  if (!base) {
    return 'Bez tytułu';
  }
  const spaced = base.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function slugify(value: string): string {
  const from = 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ';
  const to = 'acelnoszzACELNOSZZ';
  let normalised = '';
  for (const ch of value) {
    const at = from.indexOf(ch);
    normalised += at >= 0 ? to[at] : ch;
  }
  return (
    normalised
      .toLowerCase()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'song'
  );
}
