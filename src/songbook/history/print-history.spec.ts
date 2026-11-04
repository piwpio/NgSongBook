import { Song } from '../model/song.model';
import {
  HISTORY_VERSION,
  emptyHistory,
  markPrinted,
  nextBatchNumber,
  parseHistory,
  selectForPrint,
  serialiseHistory,
} from './print-history';

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

  it('reads an absent or empty file as nothing printed yet', () => {
    expect(parseHistory(null).entries).toEqual({});
    expect(parseHistory('').entries).toEqual({});
    expect(parseHistory('   ').entries).toEqual({});
  });
});

describe('print history refuses to be mistaken for empty', () => {
  it('throws on a file that is not valid JSON', () => {
    expect(() => parseHistory('{ zepsute')).toThrow(/not valid JSON/);
  });

  it('throws on JSON that is not a history', () => {
    expect(() => parseHistory('{"version":1}')).toThrow(/no entries/);
  });

  it('throws on a file written by a newer build', () => {
    const future = JSON.stringify({ version: HISTORY_VERSION + 1, batches: 3, entries: {} });
    expect(() => parseHistory(future)).toThrow(/understands/);
  });

  it('accepts a file without a version as the current one', () => {
    expect(parseHistory('{"entries":{}}').version).toBe(HISTORY_VERSION);
  });
});
