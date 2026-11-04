import { Song, SongBlock, SongMeta } from '../model/song.model';
import { ChordNotation, tokenizeChords } from './chord-tokenizer';

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
  /** Spelled out as a word, from before the tag syntax - accepted, warned about. */
  chorusMarkerWord: /^(?:ref|refren|refr|chorus)(\d*)(?:\.|:|\s|$)\s*/i,
  /** `{chords}` followed by chords - an instrumental line with no lyrics. */
  chordsLine: /^(?:\{chords}|\[chords])\s*/i,
  /**
   * Keys that look like meta but are not: they open the body of the song, so
   * the meta scan has to stop when it meets one. `ref`, `ref1`, `ref2`, ...
   */
  bodyMarkerKey: /^(?:ref\d*|chords)$/i,
  knownMetaKeys: ['title', 'author', 'extra'] as const,
} as const;

export interface ParseSongOptions {
  chordNotation?: ChordNotation;
  /** Fallback title when the file has no `{title}`. Defaults to the prettified file name. */
  fallbackTitle?: string;
}

export function parseSong(raw: string, sourceFile = '', options: ParseSongOptions = {}): Song {
  const notation = options.chordNotation ?? 'pl';
  const warnings: string[] = [];
  const errors: string[] = [];

  const lines = normalise(raw).split('\n');
  const { meta, rest } = readMeta(lines, warnings);

  // {title} and {author} are required; {extra} is not.
  const title = meta['title'] ?? options.fallbackTitle ?? prettifyFileName(sourceFile);
  if (!meta['title']) {
    errors.push('Missing {title}.');
  }
  if (!meta['author']) {
    errors.push('Missing {author}.');
  }

  const songMeta: SongMeta = { title };
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

interface ChorusMarker {
  /** Which chorus: '' for a bare `{ref}`, otherwise the number written. */
  key: string;
  /** What follows the marker - empty means "repeat", non-empty means "write out". */
  rest: string;
  syntax: TagSyntax;
}

/** `{ref007}` and `{ref7}` are the same chorus; `{ref}` is its own. */
function chorusKeyOf(digits: string): string {
  return digits ? String(Number(digits)) : '';
}

function chorusLabel(key: string): string {
  return key ? `{ref${key}}` : '{ref}';
}

function matchChorusMarker(line: string): ChorusMarker | null {
  const forms: [RegExp, TagSyntax][] = [
    [SONG_FORMAT.chorusMarker, 'braces'],
    [SONG_FORMAT.chorusMarkerBrackets, 'brackets'],
    [SONG_FORMAT.chorusMarkerWord, 'word'],
  ];

  for (const [pattern, syntax] of forms) {
    const match = pattern.exec(line);
    if (match) {
      return {
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
  /** Every chorus written out so far, by number, so `{ref2}` can come back. */
  const choruses = new Map<string, SongBlock>();
  /** Chords carry over line after line, and across blocks, until replaced. */
  let lastChords = '';

  const closeBlock = () => {
    if (current && current.lines.length > 0) {
      blocks.push(current);
      if (current.kind === 'chorus' && !current.isRepeat && current.chorusKey !== undefined) {
        choruses.set(current.chorusKey, current);
      }
    }
    current = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed === '') {
      closeBlock();
      continue;
    }

    const marker = matchChorusMarker(trimmed);

    // A marker alone on its line is not lyrics - it prints that chorus again.
    if (marker && marker.rest === '') {
      closeBlock();
      noteSyntax(marker.syntax, warnings);
      const defined = choruses.get(marker.key);
      if (defined) {
        blocks.push(repeatOf(defined));
      } else {
        errors.push(`${chorusLabel(marker.key)} is used before it is written out.`);
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
        chords: tokenizeChords(chordText, notation),
        chordsExplicit: true,
        chordsOnly: true,
      });
      continue;
    }

    const separatorAt = rawLine.indexOf(SONG_FORMAT.chordSeparator);
    const hasOwnChords = separatorAt >= 0;
    let lyrics = (hasOwnChords ? rawLine.slice(0, separatorAt) : rawLine).trim();
    const ownChords = hasOwnChords ? rawLine.slice(separatorAt + 1).trim() : '';

    if (hasOwnChords && ownChords) {
      lastChords = ownChords;
    }

    if (!current) {
      // A marker with lyrics after it opens - and defines - that chorus.
      const opening = matchChorusMarker(lyrics);
      if (opening && opening.rest !== '') {
        noteSyntax(opening.syntax, warnings);
        if (choruses.has(opening.key)) {
          // A chorus is written out once and then recalled; two texts under one
          // number means one of them would silently never be printed.
          errors.push(`${chorusLabel(opening.key)} is written out twice - a chorus may only be written out once.`);
        }
        lyrics = opening.rest;
        current = { kind: 'chorus', chorusKey: opening.key, lines: [] };
      } else {
        current = { kind: 'verse', lines: [] };
      }
    }

    current.lines.push({
      lyrics,
      rawChords: lastChords,
      chords: tokenizeChords(lastChords, notation),
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
function repeatOf(chorus: SongBlock): SongBlock {
  return {
    kind: 'chorus',
    chorusKey: chorus.chorusKey,
    isRepeat: true,
    lines: chorus.lines.map(line => ({ ...line, chords: [...line.chords] })),
  };
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
