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
