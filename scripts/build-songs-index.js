const fs = require('fs');
const path = require('path');

/**
 * A browser cannot list a directory over HTTP, so the app needs an index of
 * the song files. It is generated from `songs/` before `npm start` and
 * `npm run build`, is gitignored, and is never edited by hand - the CLI reads
 * the directory directly and ignores this file entirely.
 */
const ROOT = path.join(__dirname, '..');
const SONGS_DIR = path.join(ROOT, 'songs');
const INDEX_FILE = path.join(ROOT, 'src', 'assets', 'songs-index.json');

function listSongs(dir, prefix = '') {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...listSongs(path.join(dir, entry.name), relative));
    } else if (entry.name.endsWith('.txt')) {
      found.push(relative);
    }
  }
  return found;
}

const songs = listSongs(SONGS_DIR).sort((a, b) => a.localeCompare(b, 'pl'));
fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
fs.writeFileSync(INDEX_FILE, `${JSON.stringify({ songs }, null, 2)}\n`, 'utf8');
console.log('\x1b[32m%s\x1b[0m', `songs-index.json written with ${songs.length} song(s)`);
