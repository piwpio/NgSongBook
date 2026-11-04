import { Song } from '../model/song.model';
import { emptyHistory, markPrinted, nextBatchNumber, parseHistory, selectForPrint, serialiseHistory } from './print-history';

function songOf(file: string, raw = 'tekst'): Song {
  return {
    id: file.replace('.txt', ''),
    sourceFile: file,
    meta: { title: file, author: 'A' },
    blocks: [],
    raw,
    valid: true,
    errors: [],
    warnings: [],
  };
}

describe('print history batches', () => {
  it('starts at batch 1', () => {
    expect(nextBatchNumber(emptyHistory())).toBe(1);
  });

  it('counts a batch per recorded print run, not per song', () => {
    let history = markPrinted(emptyHistory(), [songOf('a.txt'), songOf('b.txt')]);
    expect(history.batches).toBe(1);
    expect(nextBatchNumber(history)).toBe(2);

    history = markPrinted(history, [songOf('c.txt')]);
    expect(history.batches).toBe(2);
    expect(history.entries['c.txt'].batch).toBe(2);
    expect(history.entries['a.txt'].batch).toBe(1);
  });

  it('survives a round trip through the file', () => {
    const history = markPrinted(emptyHistory(), [songOf('a.txt')]);
    const reloaded = parseHistory(serialiseHistory(history));
    expect(reloaded.batches).toBe(1);
    expect(nextBatchNumber(reloaded)).toBe(2);
  });

  it('reads a history written before batches existed as batch 0', () => {
    const old = JSON.stringify({ version: 1, entries: {} });
    expect(nextBatchNumber(parseHistory(old))).toBe(1);
  });

  it('only offers songs that have not been printed', () => {
    const songs = [songOf('a.txt'), songOf('b.txt')];
    const history = markPrinted(emptyHistory(), [songs[0]]);
    expect(selectForPrint(songs, history).toPrint.map(s => s.sourceFile)).toEqual(['b.txt']);
  });

  it('offers an edited song again only with includeChanged', () => {
    const before = songOf('a.txt', 'stary tekst');
    const history = markPrinted(emptyHistory(), [before]);
    const after = songOf('a.txt', 'nowy tekst');

    expect(selectForPrint([after], history).toPrint).toEqual([]);
    expect(selectForPrint([after], history, { includeChanged: true }).toPrint.length).toBe(1);
  });
});
