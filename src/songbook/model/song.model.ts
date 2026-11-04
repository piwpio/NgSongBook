/**
 * Framework-agnostic song model.
 * Shared by the Angular app and the Node CLI - must not import anything
 * from @angular/* nor from node builtins.
 */

export type SongBlockKind = 'verse' | 'chorus';

export interface SongMeta {
  title: string;
  author?: string;
  extra?: string;
}

export interface SongLine {
  /** Lyrics without the `|chords` part and without the `ref.` marker. */
  lyrics: string;
  /** Chords exactly as written in the file (possibly inherited from an earlier line). */
  rawChords: string;
  /** `rawChords` split into single chords, e.g. 'AaDeD' -> ['A','a','D','e','D']. */
  chords: string[];
  /** true when this very line carried its own `|chords`, false when inherited. */
  chordsExplicit: boolean;
  /**
   * A `{chords}` line: an instrumental passage - an intro, a bridge, an
   * interlude - with no lyrics. It is printed in the lyrics column, because
   * there is nothing for it to sit beside.
   */
  chordsOnly?: boolean;
}

export interface SongBlock {
  kind: SongBlockKind;
  /** True when this chorus came from a bare `[ref]` line, not from the original one. */
  isRepeat?: boolean;
  lines: SongLine[];
}

export interface Song {
  /** Stable id derived from the source file name - used for PDF anchors. */
  id: string;
  /** File name the song was loaded from, e.g. 'test1.txt'. */
  sourceFile: string;
  meta: SongMeta;
  blocks: SongBlock[];
  /** Raw file content, kept for change detection in the print history. */
  raw: string;
  /** False when `errors` is non-empty - the song is then left out of the PDF. */
  valid: boolean;
  /** Things that make the song unusable: a missing {title}, {author} or lyrics. */
  errors: string[];
  /** Non-fatal remarks, e.g. an unknown meta key or the old chorus spelling. */
  warnings: string[];
}

export function songLineCount(song: Song): number {
  return song.blocks.reduce((sum, block) => sum + block.lines.length, 0);
}

export function hasAnyChords(song: Song): boolean {
  return song.blocks.some(block => block.lines.some(line => line.rawChords.length > 0));
}

/**
 * The songbook's order: alphabetical by title, Polish collation. Songs are
 * sorted after parsing, so the order follows what the reader sees in the table
 * of contents rather than the file names on disk.
 */
export function sortSongsByTitle(songs: Song[]): Song[] {
  return [...songs].sort((a, b) => {
    const byTitle = a.meta.title.localeCompare(b.meta.title, 'pl', { sensitivity: 'base' });
    return byTitle !== 0 ? byTitle : a.sourceFile.localeCompare(b.sourceFile, 'pl');
  });
}
