import * as fs from 'fs';
import * as path from 'path';
import { Song, parseSong, sortSongsByTitle } from '../../src/songbook';
import { ChordNotation } from '../../src/songbook/parser/chord-tokenizer';

/** Where the songbook keeps the real songs, relative to the project root. */
export const SONGS_DIR = 'songs';
/** Committed print history. It lives under src/assets so the app can read it too. */
export const HISTORY_FILE = path.join('src', 'assets', 'print-history.json');

export function findProjectRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return startDir;
    }
    dir = parent;
  }
}

/**
 * Every .txt under the songs directory, including subdirectories - a folder
 * never hides a song. Folders carry no meaning yet; the songbook is ordered
 * alphabetically by title once the files are parsed.
 */
export function listSongFiles(songsDir: string): string[] {
  const found: string[] = [];

  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const relative = prefix ? path.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), relative);
      } else if (entry.name.endsWith('.txt')) {
        found.push(relative);
      }
    }
  };

  walk(songsDir, '');
  return found;
}

export function loadSongs(songsDir: string, chordNotation: ChordNotation = 'pl'): Song[] {
  const songs = listSongFiles(songsDir).map(file => parseSong(fs.readFileSync(path.join(songsDir, file), 'utf8'), file, { chordNotation }));
  return sortSongsByTitle(songs);
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function timestampSlug(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
