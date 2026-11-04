import * as fs from 'fs';
import * as path from 'path';
import { Song, parseSong } from '../../src/songbook';
import { ChordNotation } from '../../src/songbook/parser/chord-tokenizer';

export const SONG_LIST_FILE = '__songs__.txt';
export const HISTORY_FILE = 'print-history.json';

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
 * Song order follows `__songs__.txt` when it exists (same source the Angular
 * app uses), otherwise falls back to an alphabetical scan of the assets dir.
 */
export function listSongFiles(assetsDir: string): string[] {
  const listPath = path.join(assetsDir, SONG_LIST_FILE);
  if (fs.existsSync(listPath)) {
    const listed = fs
      .readFileSync(listPath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.endsWith('.txt') && line !== SONG_LIST_FILE)
      .filter(file => fs.existsSync(path.join(assetsDir, file)));
    if (listed.length > 0) {
      return listed;
    }
  }

  return fs
    .readdirSync(assetsDir)
    .filter(file => file.endsWith('.txt') && file !== SONG_LIST_FILE)
    .sort((a, b) => a.localeCompare(b, 'pl'));
}

export function loadSongs(assetsDir: string, chordNotation: ChordNotation = 'pl'): Song[] {
  return listSongFiles(assetsDir).map(file => parseSong(fs.readFileSync(path.join(assetsDir, file), 'utf8'), file, { chordNotation }));
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function timestampSlug(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
