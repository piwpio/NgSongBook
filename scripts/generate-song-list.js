const path = require('path');
const fs = require('fs');

const LIST_FILE_NAME = '__songs__.txt';
const DEFAULT_DIRECTORY = path.join(__dirname, '..', 'src', 'assets');

/** Collects every .txt in the directory, sorted the way Polish sorts. */
function collectSongs(startPath) {
  if (!fs.existsSync(startPath)) {
    console.error(`No directory: ${startPath}`);
    process.exit(1);
  }

  const songs = [];
  for (const fileName of fs.readdirSync(startPath)) {
    const filePath = path.join(startPath, fileName);
    if (fs.lstatSync(filePath).isDirectory()) {
      continue;
    }
    if (fileName.endsWith('.txt') && fileName !== LIST_FILE_NAME) {
      songs.push(fileName);
    }
  }
  return songs.sort((a, b) => a.localeCompare(b, 'pl'));
}

// `node generate-song-list [directory]` - defaults to src/assets.
const directory = path.resolve(process.argv[2] ? process.argv[2] : DEFAULT_DIRECTORY);
const songs = collectSongs(directory);
const listPath = path.join(directory, LIST_FILE_NAME);

fs.writeFileSync(listPath, songs.length > 0 ? `${songs.join('\n')}\n` : '', 'utf8');
console.log('\x1b[32m%s\x1b[0m', `${LIST_FILE_NAME} written with ${songs.length} song(s): ${listPath}`);
