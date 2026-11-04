import { Song, SongBlock, SongBlockKind, SongMeta } from '../model/song.model';
import { ChordNotation, tokenizeChords } from './chord-tokenizer';

export const SONG_FORMAT = {
  /** `{title}...`, `{author}...`, `{extra}...` - one per line, at the top of the file. */
  metaLine: /^\s*\{([a-zA-Z][\w-]*)\}[ \t]?(.*)$/,
  /** Everything after the first `|` on a lyrics line is the chord string. */
  chordSeparator: '|',
  /** `{ref}` followed by lyrics - the block that defines the chorus. */
  chorusMarker: /^\{ref}\s*/i,
  /** A line holding nothing but `{ref}` - print the chorus again here. */
  chorusRepeat: /^\{ref}$/i,
  /** `{chords}` followed by chords - an instrumental line with no lyrics. */
  chordsLine: /^\{chords}\s*/i,
  /** Pre-`{ref}` spellings, still accepted as a definition but warned about. */
  legacyChorusMarker: /^(\[ref]|ref|refren|refr|chorus)(\.|:|\s|$)\s*/i,
  /**
   * Keys that look like meta but are not: they open the body of the song, so
   * the meta scan has to stop when it meets one.
   */
  bodyMarkerKeys: ['ref', 'chords'] as const,
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

  const blocks = parseBlocks(rest, notation, warnings);
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
    errors,
    warnings,
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
    const key = match[1].toLowerCase();
    if ((SONG_FORMAT.bodyMarkerKeys as readonly string[]).includes(key)) {
      // `{ref}` / `{chords}` look like meta lines but they open the body.
      break;
    }
    const value = match[2].trim();
    if (!(SONG_FORMAT.knownMetaKeys as readonly string[]).includes(key)) {
      warnings.push(`Unknown meta key: {${key}}`);
    }
    if (value) {
      meta[key] = value;
    }
  }

  return { meta, rest: lines.slice(index) };
}

function parseBlocks(lines: string[], notation: ChordNotation, warnings: string[]): SongBlock[] {
  const blocks: SongBlock[] = [];
  let current: SongBlock | null = null;
  /** The chorus as written, so a bare `[ref]` can print it again. */
  let chorus: SongBlock | null = null;
  /** Chords carry over line after line, and across blocks, until replaced. */
  let lastChords = '';

  const closeBlock = () => {
    if (current && current.lines.length > 0) {
      blocks.push(current);
      if (current.kind === 'chorus' && !current.isRepeat) {
        chorus = current;
      }
    }
    current = null;
  };

  for (const rawLine of lines) {
    if (rawLine.trim() === '') {
      closeBlock();
      continue;
    }

    // A line that is only `[ref]` is not lyrics - it repeats the chorus.
    if (SONG_FORMAT.chorusRepeat.test(rawLine.trim())) {
      closeBlock();
      if (chorus) {
        blocks.push(repeatOf(chorus));
      } else {
        warnings.push('{ref} used before the chorus was written out - skipped.');
      }
      continue;
    }

    // `{chords}` is a passage with no words - an intro, a bridge, an interlude.
    // It does NOT touch the running chords: whatever follows still inherits the
    // chords of the last line that had lyrics.
    const chordsMatch = SONG_FORMAT.chordsLine.exec(rawLine.trim());
    if (chordsMatch) {
      const rest = rawLine.trim().slice(chordsMatch[0].length).trim();
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

    let kind: SongBlockKind = 'verse';

    if (!current) {
      const marker = SONG_FORMAT.chorusMarker.exec(lyrics);
      if (marker) {
        kind = 'chorus';
        lyrics = lyrics.slice(marker[0].length).trim();
      } else {
        const legacy = SONG_FORMAT.legacyChorusMarker.exec(lyrics);
        if (legacy) {
          kind = 'chorus';
          lyrics = lyrics.slice(legacy[0].length).trim();
          warnings.push(`Chorus marked as "${legacy[0].trim()}" - write {ref} instead.`);
        }
      }
      current = { kind, lines: [] };
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

/**
 * A copy of the chorus for a bare `[ref]`. The chords come along, and the
 * running chord state is left alone, so whatever follows picks up where the
 * verse before the chorus left off.
 */
function repeatOf(chorus: SongBlock): SongBlock {
  return {
    kind: 'chorus',
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
