import { tokenizeChords } from './chord-tokenizer';
import { parseSong } from './song-parser';

describe('tokenizeChords', () => {
  it('splits a compact chord string (notacja polska)', () => {
    expect(tokenizeChords('AaDeD')).toEqual(['A', 'a', 'D', 'e', 'D']);
    expect(tokenizeChords('abDeGEGE')).toEqual(['a', 'b', 'D', 'e', 'G', 'E', 'G', 'E']);
  });

  it('keeps suffixes attached to their root', () => {
    expect(tokenizeChords('C7Amaj7Dsus4e')).toEqual(['C7', 'Amaj7', 'Dsus4', 'e']);
    expect(tokenizeChords('F#C#m')).toEqual(['F#', 'C#m']);
    expect(tokenizeChords('C/G')).toEqual(['C/G']);
  });

  it('treats b as a flat only in international notation', () => {
    expect(tokenizeChords('Ab')).toEqual(['A', 'b']);
    expect(tokenizeChords('Ab', 'intl')).toEqual(['Ab']);
  });
});

describe('parseSong', () => {
  const song = [
    '{title}Tytuł piosenki',
    '{author}Wykonawca piosenki',
    '{extra}capo 2',
    '',
    '',
    'linia 1|AaDeD',
    'linia 2',
    'linia 3|AaDeD',
    'linia 4|abDeGEGE',
    '',
    'linia 5',
    'linia 6',
    '',
    'ref. linia 7',
    'linia 8',
  ].join('\n');

  it('reads the meta block', () => {
    const parsed = parseSong(song, 'test1.txt');
    expect(parsed.meta).toEqual({
      title: 'Tytuł piosenki',
      author: 'Wykonawca piosenki',
      extra: 'capo 2',
    });
    expect(parsed.valid).toBe(true);
    expect(parsed.warnings).toEqual([]);
  });

  it('splits lyrics into blocks on blank lines', () => {
    const parsed = parseSong(song, 'test1.txt');
    expect(parsed.blocks.map(block => block.lines.length)).toEqual([4, 2, 2]);
    expect(parsed.blocks.map(block => block.kind)).toEqual(['verse', 'verse', 'chorus']);
  });

  it('strips the ref. marker but remembers it', () => {
    const chorus = parseSong(song, 'test1.txt').blocks[2];
    expect(chorus.label).toEqual('ref.');
    expect(chorus.lines[0].lyrics).toEqual('linia 7');
  });

  it('repeats the last given chords on every following line, also across blocks', () => {
    const lines = parseSong(song, 'test1.txt').blocks.flatMap(block => block.lines);
    expect(lines.map(line => line.rawChords)).toEqual([
      'AaDeD',
      'AaDeD',
      'AaDeD',
      'abDeGEGE',
      'abDeGEGE',
      'abDeGEGE',
      'abDeGEGE',
      'abDeGEGE',
    ]);
    expect(lines.map(line => line.chordsExplicit)).toEqual([true, false, true, true, false, false, false, false]);
  });

  it('accepts a song with no meta block at all', () => {
    const parsed = parseSong('linia pierwsza|AaDeD\nlinia druga', 'test5.txt');
    expect(parsed.valid).toBe(true);
    expect(parsed.meta.title).toEqual('Test5');
    expect(parsed.warnings.length).toBe(1);
  });

  it('accepts a song with meta but no {title}', () => {
    const parsed = parseSong('{author}Ktoś\n\n\nlinia', 'moja-piosenka.txt');
    expect(parsed.meta.title).toEqual('Moja piosenka');
    expect(parsed.meta.author).toEqual('Ktoś');
  });

  it('handles windows line endings', () => {
    const parsed = parseSong('{title}T\r\n\r\nlinia 1|C\r\nlinia 2', 'w.txt');
    expect(parsed.blocks[0].lines.map(l => l.lyrics)).toEqual(['linia 1', 'linia 2']);
  });
});
