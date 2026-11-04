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
}

export interface SongBlock {
  kind: SongBlockKind;
  /** Marker found in the source, e.g. 'ref.' - only for `chorus`. */
  label?: string;
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
  valid: boolean;
  /** Non-fatal problems, e.g. a missing {title}. */
  warnings: string[];
}

export function songLineCount(song: Song): number {
  return song.blocks.reduce((sum, block) => sum + block.lines.length, 0);
}

export function hasAnyChords(song: Song): boolean {
  return song.blocks.some(block => block.lines.some(line => line.rawChords.length > 0));
}
