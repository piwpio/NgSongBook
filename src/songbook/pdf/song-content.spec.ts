import { parseSong } from '../parser/song-parser';
import { resolvePdfOptions } from './pdf-options';
import { buildSongContent } from './song-content';

/** Pulls every rendered string out of the nested pdfmake content tree. */
function textsOf(node: unknown, found: string[] = []): string[] {
  if (typeof node === 'string') {
    found.push(node);
  } else if (Array.isArray(node)) {
    node.forEach(child => textsOf(child, found));
  } else if (node && typeof node === 'object') {
    Object.values(node as Record<string, unknown>).forEach(child => textsOf(child, found));
  }
  return found;
}

describe('buildSongContent capitalisation', () => {
  const song = parseSong(
    ['{title}T', '{author}A', '', '{chords}a e', 'pierwsza linia|a', 'druga linia', '', '{ref}ref|e', '', '{ref}'].join('\n'),
    'x.txt'
  );

  it('opens every verse and chorus with a capital letter', () => {
    const texts = textsOf(buildSongContent(song, resolvePdfOptions()).content);
    expect(texts).toContain('Pierwsza linia');
    expect(texts).toContain('Ref');
    expect(texts).not.toContain('pierwsza linia');
  });

  it('leaves the lines after the first one alone', () => {
    const texts = textsOf(buildSongContent(song, resolvePdfOptions()).content);
    expect(texts).toContain('druga linia');
  });

  it('never touches the chords - a lowercase chord is a minor chord', () => {
    const texts = textsOf(buildSongContent(song, resolvePdfOptions()).content);
    expect(texts).toContain('a  e');
    expect(texts).not.toContain('A  e');
  });

  it('leaves the source as written when capitalizeBlocks is off', () => {
    const texts = textsOf(buildSongContent(song, resolvePdfOptions({ capitalizeBlocks: false })).content);
    expect(texts).toContain('pierwsza linia');
  });
});

interface ColumnsNode {
  columns: { stack: unknown[] }[];
  pageBreak?: string;
}

function columnNodes(content: unknown[]): ColumnsNode[] {
  return content.filter((node): node is ColumnsNode => !!node && typeof node === 'object' && Array.isArray((node as ColumnsNode).columns));
}

/** A song of `count` verses, each four lines long. */
function songOfVerses(count: number) {
  const verses = Array.from({ length: count }, (_, v) => [`zwrotka ${v + 1} wiersz 1|C G`, 'wiersz 2', 'wiersz 3', 'wiersz 4'].join('\n'));
  return parseSong(['{title}T', '{author}A', '', verses.join('\n\n')].join('\n'), 'x.txt');
}

describe('two column layout', () => {
  it('leaves the single column layout alone', () => {
    const content = buildSongContent(songOfVerses(3), resolvePdfOptions({ layout: 'single' })).content;
    expect(columnNodes(content).length).toBe(0);
  });

  it('sets a song in two columns by default', () => {
    const content = buildSongContent(songOfVerses(6), resolvePdfOptions()).content;
    expect(columnNodes(content).length).toBe(1);
  });

  it('puts the chords above the words, since a chord column has no room', () => {
    expect(resolvePdfOptions({ layout: 'columns' }).chordLayout).toBe('above');
    expect(resolvePdfOptions({ layout: 'columns', chordLayout: 'right' }).chordLayout).toBe('right');
  });

  it('sets the song in two columns', () => {
    const content = buildSongContent(songOfVerses(6), resolvePdfOptions({ layout: 'columns' })).content;
    const pages = columnNodes(content);
    expect(pages.length).toBe(1);
    expect(pages[0].columns.length).toBe(2);
  });

  it('keeps every verse whole - a block lands in exactly one column', () => {
    const song = songOfVerses(9);
    const content = buildSongContent(song, resolvePdfOptions({ layout: 'columns' })).content;
    const placed = columnNodes(content).flatMap(page => page.columns.flatMap(column => column.stack));
    expect(placed.length).toBe(song.blocks.length);
  });

  it('balances the columns when the song fits on one page', () => {
    const content = buildSongContent(songOfVerses(6), resolvePdfOptions({ layout: 'columns' })).content;
    const [left, right] = columnNodes(content)[0].columns;
    expect(Math.abs(left.stack.length - right.stack.length)).toBeLessThanOrEqual(1);
  });

  it('starts a new page when the columns are full, breaking before it', () => {
    const content = buildSongContent(songOfVerses(40), resolvePdfOptions({ layout: 'columns' })).content;
    const pages = columnNodes(content);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0].pageBreak).toBeUndefined();
    expect(pages.slice(1).every(page => page.pageBreak === 'before')).toBe(true);
  });

  it('fills the earlier pages rather than spreading the song thin', () => {
    const song = songOfVerses(40);
    const pages = columnNodes(buildSongContent(song, resolvePdfOptions({ layout: 'columns' })).content);
    const perPage = pages.map(page => page.columns.reduce((sum, c) => sum + c.stack.length, 0));
    expect(perPage[0]).toBeGreaterThanOrEqual(perPage[perPage.length - 1]);
  });
});

/** A stand-in for the real measurer: every glyph is half the font size wide. */
const fakeMetrics = {
  measureText: (text: string, fontSize: number) => text.length * fontSize * 0.5,
  measureLineHeight: (fontSize: number) => fontSize * 1.172,
};

function songWithLine(line: string) {
  return parseSong(`{title}T\n{author}A\n\n${line}|C G\nkrotka linia`, 'x.txt');
}

/** Every explicit fontSize in the tree, which is what carries the scaling. */
function fontSizes(node: unknown, found: number[] = []): number[] {
  if (Array.isArray(node)) {
    node.forEach(child => fontSizes(child, found));
  } else if (node && typeof node === 'object') {
    const size = (node as { fontSize?: unknown }).fontSize;
    if (typeof size === 'number') {
      found.push(size);
    }
    Object.values(node as Record<string, unknown>).forEach(child => fontSizes(child, found));
  }
  return found;
}

describe('fitting long lines', () => {
  const base = { layout: 'columns' as const, ...fakeMetrics };

  it('leaves a song that already fits at full size', () => {
    const song = songWithLine('krotka linia ktora sie miesci');
    const content = buildSongContent(song, resolvePdfOptions(base)).content;
    expect(Math.max(...fontSizes(content))).toBe(11);
  });

  it('shrinks a song just enough for its longest line, keeping two columns', () => {
    const song = songWithLine('x'.repeat(48));
    const options = resolvePdfOptions(base);
    const content = buildSongContent(song, options).content;

    expect(columnNodes(content).length).toBe(1);
    const lyricSizes = fontSizes(content).filter(size => size < 11 && size > 9);
    expect(lyricSizes.length).toBeGreaterThan(0);
  });

  it('gives a song one wide column rather than shrink it out of legibility', () => {
    const song = songWithLine('x'.repeat(70));
    const content = buildSongContent(song, resolvePdfOptions(base)).content;

    expect(columnNodes(content).length).toBe(0);
    expect(Math.max(...fontSizes(content))).toBe(11);
  });

  it('honours the minimum scale when deciding to fall back', () => {
    const song = songWithLine('x'.repeat(70));
    const generous = resolvePdfOptions({ ...base, minFontScale: 0.3 });
    expect(columnNodes(buildSongContent(song, generous).content).length).toBe(1);
  });

  it('leaves the lines to wrap when fitting is turned off', () => {
    const song = songWithLine('x'.repeat(70));
    const content = buildSongContent(song, resolvePdfOptions({ ...base, fitLines: false })).content;

    expect(columnNodes(content).length).toBe(1);
    expect(Math.max(...fontSizes(content))).toBe(11);
  });

  it('counts the chorus indent, which does not shrink with the type', () => {
    const wide = parseSong(`{title}T\n{author}A\n\n{ref}${'x'.repeat(44)}|C`, 'x.txt');
    const options = resolvePdfOptions(base);
    const sizes = fontSizes(buildSongContent(wide, options).content);
    // 44 glyphs fit the bare column, but not once the indent is taken off it.
    expect(Math.max(...sizes.filter(size => size <= 11))).toBeLessThan(11);
  });
});

/** The chord line is a columns node when the chords are spread along the line. */
function chordRows(content: unknown[]): { width: number; text: string }[][] {
  const rows: { width: number; text: string }[][] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') {
      return;
    }
    const columns = (node as { columns?: unknown }).columns;
    if (Array.isArray(columns) && columns.every(c => typeof (c as { text?: unknown }).text === 'string')) {
      rows.push(columns.map(c => c as { width: number; text: string }));
    }
    Object.values(node as Record<string, unknown>).forEach(walk);
  };
  walk(content);
  return rows;
}

describe('spreading the chords along the line', () => {
  const base = { chordLayout: 'above' as const, ...fakeMetrics };
  // 'abcdefghij' is 10 glyphs, so 55pt wide at 11pt in the fake metrics.
  const song = parseSong('{title}T\n{author}A\n\nabcdefghij|C G', 'x.txt');

  it('gives each chord an equal slice of the line', () => {
    const rows = chordRows(buildSongContent(song, resolvePdfOptions(base)).content);
    expect(rows.length).toBe(1);
    expect(rows[0].map(c => c.text)).toEqual(['C', 'G']);
    expect(rows[0].map(c => c.width)).toEqual([27.5, 27.5]);
  });

  it('starts the line with a chord and never ends it with one', () => {
    const rows = chordRows(buildSongContent(song, resolvePdfOptions(base)).content);
    const total = rows[0].reduce((sum, c) => sum + c.width, 0);
    // The slots cover the words, so the last chord starts before the line ends.
    expect(total).toBe(55);
  });

  it('leaves a single chord alone - it is already at the start', () => {
    const one = parseSong('{title}T\n{author}A\n\nabcdefghij|C', 'x.txt');
    expect(chordRows(buildSongContent(one, resolvePdfOptions(base)).content).length).toBe(0);
  });

  it('runs the chords together rather than overlap them on a short line', () => {
    const crowded = parseSong('{title}T\n{author}A\n\nab|C G a F e D', 'x.txt');
    expect(chordRows(buildSongContent(crowded, resolvePdfOptions(base)).content).length).toBe(0);
  });

  it('can be turned off', () => {
    const options = resolvePdfOptions({ ...base, spreadChords: false });
    expect(chordRows(buildSongContent(song, options).content).length).toBe(0);
  });

  it('leaves a {chords} passage as one run - it has no line to spread along', () => {
    const passage = parseSong('{title}T\n{author}A\n\n{chords}C G a F\nabcdefghij|C G', 'x.txt');
    const rows = chordRows(buildSongContent(passage, resolvePdfOptions(base)).content);
    expect(rows.length).toBe(1);
    expect(rows[0].map(c => c.text)).toEqual(['C', 'G']);
  });
});
