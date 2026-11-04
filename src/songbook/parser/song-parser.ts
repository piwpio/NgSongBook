import { Song, SongBlock, SongBlockKind, SongLine, SongMeta } from '../model/song.model';
import { ChordNotation, tokenizeChords } from './chord-tokenizer';

export const SONG_FORMAT = {
  /** `{title}...`, `{author}...`, `{extra}...` - one per line, at the top of the file. */
  metaLine: /^\s*\{([a-zA-Z][\w-]*)\}[ \t]?(.*)$/,
  /** Everything after the first `|` on a lyrics line is the chord string. */
  chordSeparator: '|',
  /** Marks the beginning of a chorus block. Must be followed by `.`, `:` or whitespace. */
  chorusMarker: /^(ref|refren|refr|chorus)(\.|:|\s)\s*/i,
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

  const lines = normalise(raw).split('\n');
  const { meta, rest } = readMeta(lines, warnings);

  const title = meta['title'] ?? options.fallbackTitle ?? prettifyFileName(sourceFile);
  if (!meta['title']) {
    warnings.push('Brak {title} - tytuł wzięty z nazwy pliku.');
  }

  const songMeta: SongMeta = { title };
  if (meta['author']) {
    songMeta.author = meta['author'];
  }
  if (meta['extra']) {
    songMeta.extra = meta['extra'];
  }

  const blocks = parseBlocks(rest, notation);
  if (blocks.length === 0) {
    warnings.push('Piosenka nie zawiera żadnego tekstu.');
  }

  return {
    id: slugify(sourceFile || title),
    sourceFile,
    meta: songMeta,
    blocks,
    raw,
    valid: blocks.length > 0,
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
    const value = match[2].trim();
    if (!(SONG_FORMAT.knownMetaKeys as readonly string[]).includes(key)) {
      warnings.push(`Nieznany klucz meta: {${key}}`);
    }
    if (value) {
      meta[key] = value;
    }
  }

  return { meta, rest: lines.slice(index) };
}

function parseBlocks(lines: string[], notation: ChordNotation): SongBlock[] {
  const blocks: SongBlock[] = [];
  let current: SongBlock | null = null;
  /** Chords carry over line after line, and across blocks, until replaced. */
  let lastChords = '';

  const closeBlock = () => {
    if (current && current.lines.length > 0) {
      blocks.push(current);
    }
    current = null;
  };

  for (const rawLine of lines) {
    if (rawLine.trim() === '') {
      closeBlock();
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
    let label: string | undefined;

    if (!current) {
      const chorusMatch = SONG_FORMAT.chorusMarker.exec(lyrics);
      if (chorusMatch) {
        kind = 'chorus';
        label = chorusMatch[0].trim();
        lyrics = lyrics.slice(chorusMatch[0].length).trim();
      }
      current = label ? { kind, label, lines: [] } : { kind, lines: [] };
    }

    const line: SongLine = {
      lyrics,
      rawChords: lastChords,
      chords: tokenizeChords(lastChords, notation),
      chordsExplicit: hasOwnChords && ownChords.length > 0,
    };
    current.lines.push(line);
  }

  closeBlock();
  return blocks;
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
