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
    '{ref} linia 7',
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

  it('strips the {ref} marker from the lyrics', () => {
    const chorus = parseSong(song, 'test1.txt').blocks[2];
    expect(chorus.kind).toEqual('chorus');
    expect(chorus.isRepeat).toBeFalsy();
    expect(chorus.lines[0].lyrics).toEqual('linia 7');
  });

  it('a bare {ref} prints the chorus again', () => {
    const withRepeat = parseSong(`${song}\n\n{ref}`, 'test1.txt');
    const last = withRepeat.blocks[withRepeat.blocks.length - 1];
    expect(last.kind).toEqual('chorus');
    expect(last.isRepeat).toBe(true);
    expect(last.lines.map(line => line.lyrics)).toEqual(['linia 7', 'linia 8']);
    expect(last.lines[0].rawChords).toEqual('abDeGEGE');
  });

  it('rejects a {ref} used before it is written out', () => {
    const parsed = parseSong('{title}T\n{author}A\n\n{ref}\n\nlinia', 'x.txt');
    expect(parsed.valid).toBe(false);
    expect(parsed.errors).toEqual(['{ref} is used before it is written out.']);
  });

  describe('numbered choruses', () => {
    const song = [
      '{title}T',
      '{author}A',
      '',
      'zwrotka 1|C',
      '',
      '{ref1}pierwszy refren|G',
      '',
      'zwrotka 2',
      '',
      '{ref1}',
      '',
      '{ref2}drugi refren|a',
      '',
      '{ref1}',
    ].join('\n');

    it('keeps each numbered chorus and brings the right one back', () => {
      const parsed = parseSong(song, 'x.txt');
      expect(parsed.valid).toBe(true);
      expect(parsed.blocks.map(b => `${b.kind}${b.chorusKey ?? ''}${b.isRepeat ? '*' : ''}`)).toEqual([
        'verse',
        'chorus1',
        'verse',
        'chorus1*',
        'chorus2',
        'chorus1*',
      ]);
    });

    it('repeats the text of the chorus it was given', () => {
      const parsed = parseSong(song, 'x.txt');
      expect(parsed.blocks[3].lines[0].lyrics).toEqual('pierwszy refren');
      expect(parsed.blocks[4].lines[0].lyrics).toEqual('drugi refren');
      expect(parsed.blocks[5].lines[0].lyrics).toEqual('pierwszy refren');
    });

    it('keeps {ref} separate from {ref1} instead of aliasing them', () => {
      const parsed = parseSong('{title}T\n{author}A\n\n{ref}jeden|C\n\n{ref1}', 'x.txt');
      expect(parsed.valid).toBe(false);
      expect(parsed.errors).toEqual(['{ref1} is used before it is written out.']);
    });

    it('accepts numbers that do not run in order', () => {
      const parsed = parseSong('{title}T\n{author}A\n\n{ref1}pierwszy|C\n\n{ref5}piąty|G\n\n{ref1}\n\n{ref5}', 'x.txt');
      expect(parsed.valid).toBe(true);
      expect(parsed.blocks.map(b => b.chorusKey)).toEqual(['1', '5', '1', '5']);
      expect(parsed.blocks[2].lines[0].lyrics).toEqual('pierwszy');
      expect(parsed.blocks[3].lines[0].lyrics).toEqual('piąty');
    });

    it('treats {ref007} and {ref7} as the same chorus', () => {
      const parsed = parseSong('{title}T\n{author}A\n\n{ref007}jeden|C\n\n{ref7}', 'x.txt');
      expect(parsed.valid).toBe(true);
      expect(parsed.blocks[1].lines[0].lyrics).toEqual('jeden');
    });

    it('rejects a number that was never written out', () => {
      const parsed = parseSong('{title}T\n{author}A\n\n{ref1}jeden|C\n\n{ref2}', 'x.txt');
      expect(parsed.valid).toBe(false);
      expect(parsed.errors).toEqual(['{ref2} is used before it is written out.']);
    });

    it('rejects a chorus written out twice under the same number', () => {
      const parsed = parseSong('{title}T\n{author}A\n\n{ref1}jeden|C\n\n{ref1}znowu|G', 'x.txt');
      expect(parsed.valid).toBe(false);
      expect(parsed.errors).toEqual(['{ref1} is written out twice - a chorus may only be written out once.']);
    });

    it('rejects the unnumbered chorus written out twice as well', () => {
      const parsed = parseSong('{title}T\n{author}A\n\n{ref}jeden|C\n\n{ref}znowu|G', 'x.txt');
      expect(parsed.valid).toBe(false);
      expect(parsed.errors[0]).toContain('{ref} is written out twice');
    });

    it('accepts the bracket spelling, and says it once however often it appears', () => {
      const parsed = parseSong('{title}T\n{author}A\n\n[ref1]jeden|C\n\n[ref1]\n\n[ref1]', 'x.txt');
      expect(parsed.valid).toBe(true);
      expect(parsed.warnings.filter(w => w.includes('square brackets')).length).toBe(1);
      expect(parsed.blocks.map(b => b.isRepeat ?? false)).toEqual([false, true, true]);
    });

    it('does not mistake {ref2} in the header for a meta key', () => {
      const parsed = parseSong('{title}T\n{author}A\n{ref2}od razu refren|C', 'x.txt');
      expect(parsed.meta).toEqual({ title: 'T', author: 'A' });
      expect(parsed.blocks[0].chorusKey).toEqual('2');
    });
  });

  it('still accepts the old ref. spelling, but says so', () => {
    const parsed = parseSong('{title}T\n{author}A\n\nref. linia', 'x.txt');
    expect(parsed.blocks[0].kind).toEqual('chorus');
    expect(parsed.blocks[0].lines[0].lyrics).toEqual('linia');
    expect(parsed.warnings.some(w => w.includes('bare word'))).toBe(true);
  });

  describe('square brackets', () => {
    it('accepts every tag in square brackets and warns once', () => {
      const parsed = parseSong('[title]T\n[author]A\n[extra]capo 2\n\n[chords]C G\n\n[ref]refren|C\n\n[ref]', 'x.txt');
      expect(parsed.valid).toBe(true);
      expect(parsed.meta).toEqual({ title: 'T', author: 'A', extra: 'capo 2' });
      expect(parsed.blocks[0].lines[0].chordsOnly).toBe(true);
      expect(parsed.blocks.map(b => b.kind)).toEqual(['verse', 'chorus', 'chorus']);
      expect(parsed.warnings.filter(w => w.includes('square brackets')).length).toBe(1);
    });

    it('lets braces and brackets name the same chorus', () => {
      const parsed = parseSong('{title}T\n{author}A\n\n[ref]refren|C\n\n{ref}', 'x.txt');
      expect(parsed.valid).toBe(true);
      expect(parsed.blocks[1].isRepeat).toBe(true);
    });

    it('says nothing when everything is written with braces', () => {
      const parsed = parseSong('{title}T\n{author}A\n\n{chords}C\n\n{ref}r|C\n\n{ref}', 'x.txt');
      expect(parsed.warnings).toEqual([]);
    });
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

  it('rejects a song with no meta block at all', () => {
    const parsed = parseSong('linia pierwsza|AaDeD\nlinia druga', 'test5.txt');
    expect(parsed.valid).toBe(false);
    expect(parsed.errors).toEqual(['Missing {title}.', 'Missing {author}.']);
  });

  it('rejects a song without {title}', () => {
    const parsed = parseSong('{author}Ktoś\n\n\nlinia', 'moja-piosenka.txt');
    expect(parsed.valid).toBe(false);
    expect(parsed.errors).toEqual(['Missing {title}.']);
    // The title still falls back to the file name, for error messages and lists.
    expect(parsed.meta.title).toEqual('Moja piosenka');
  });

  it('rejects a song without {author}', () => {
    const parsed = parseSong('{title}T\n\nlinia', 'x.txt');
    expect(parsed.valid).toBe(false);
    expect(parsed.errors).toEqual(['Missing {author}.']);
  });

  it('rejects a song with meta but no lyrics', () => {
    const parsed = parseSong('{title}T\n{author}A\n', 'x.txt');
    expect(parsed.valid).toBe(false);
    expect(parsed.errors).toEqual(['The song has no lyrics.']);
  });

  it('reads a {chords} line as an instrumental passage', () => {
    const parsed = parseSong('{title}T\n{author}A\n\n{chords}eCGD\n\nlinia|C', 'x.txt');
    expect(parsed.valid).toBe(true);
    const passage = parsed.blocks[0].lines[0];
    expect(passage.chordsOnly).toBe(true);
    expect(passage.lyrics).toEqual('');
    expect(passage.chords).toEqual(['e', 'C', 'G', 'D']);
  });

  it('a {chords} line does not change the chords the lyrics inherit', () => {
    const parsed = parseSong('{title}T\n{author}A\n\nlinia 1|C\n{chords}aFCG\nlinia 2', 'x.txt');
    const [first, passage, second] = parsed.blocks[0].lines;
    expect(first.rawChords).toEqual('C');
    expect(passage.chordsOnly).toBe(true);
    expect(second.rawChords).toEqual('C');
    expect(second.chordsOnly).toBeFalsy();
  });

  it('accepts {chords} as the very first line, after the meta block', () => {
    const parsed = parseSong('{title}T\n{author}A\n{chords}eCGD\n\nlinia', 'x.txt');
    expect(parsed.meta).toEqual({ title: 'T', author: 'A' });
    expect(parsed.blocks[0].lines[0].chordsOnly).toBe(true);
  });

  it('warns about a {chords} line with nothing after it', () => {
    const parsed = parseSong('{title}T\n{author}A\n\n{chords}\n\nlinia', 'x.txt');
    expect(parsed.warnings.some(w => w.includes('{chords}'))).toBe(true);
  });

  it('accepts a song without {extra} - only title and author are required', () => {
    const parsed = parseSong('{title}T\n{author}A\n\nlinia|C', 'x.txt');
    expect(parsed.valid).toBe(true);
    expect(parsed.errors).toEqual([]);
    expect(parsed.meta.extra).toBeUndefined();
  });

  it('handles windows line endings', () => {
    const parsed = parseSong('{title}T\r\n{author}A\r\n\r\nlinia 1|C\r\nlinia 2', 'w.txt');
    expect(parsed.blocks[0].lines.map(l => l.lyrics)).toEqual(['linia 1', 'linia 2']);
  });
});
