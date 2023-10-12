const path = require('path');
const fs = require('fs');

const directory = '../src/assets/';
const listFileName = '_songs_.txt';

const allSongsList = [];
function fromDir(startPath, filter) {
  if (!fs.existsSync(startPath)) {
    console.log('NO DIRECTORY ', startPath);
    return;
  }

  const files = fs.readdirSync(startPath);
  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const filePath = path.join(startPath, fileName);
    const stat = fs.lstatSync(filePath);

    if (stat.isDirectory()) {
      fromDir(filePath, filter);
    } else if (fileName.endsWith(filter) && fileName !== listFileName) {
      allSongsList.push(fileName);
    }
  }

  const list = allSongsList.sort().join('\n');
  fs.writeFile(`${directory}${listFileName}`, list, err => {
    if (err) {
      console.error(err);
      return;
    }

    console.log('\x1b[32m%s\x1b[0m', `File _songs_.txt created successfully`);
  });
}

fromDir(directory, '.txt');
