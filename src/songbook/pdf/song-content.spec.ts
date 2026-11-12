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
    const content = buildSongContent(songOfVerses(3), resolvePdfOptions()).content;
    expect(columnNodes(content).length).toBe(0);
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
