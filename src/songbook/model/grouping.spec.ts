import { MISC_SECTION, groupSongs, normalizeAuthor } from './grouping';
import { Song } from './song.model';

function songOf(title: string, author: string): Song {
  return {
    id: title,
    sourceFile: `${title}.txt`,
    meta: { title, author, notation: 'pl', notationGuessed: true },
    blocks: [],
    raw: title,
    valid: true,
    errors: [],
    warnings: [],
  };
}

function manyBy(author: string, count: number): Song[] {
  return Array.from({ length: count }, (_, i) => songOf(`Piosenka ${i + 1}`, author));
}

describe('normalizeAuthor', () => {
  it('ignores case', () => {
    expect(normalizeAuthor('Zespół Reprezentacyjny')).toBe(normalizeAuthor('zespół reprezentacyjny'));
  });

  it('strips Polish accents, including the ł that has no decomposition', () => {
    expect(normalizeAuthor('Zespół')).toBe('zespol');
    expect(normalizeAuthor('ĄĆĘŁŃÓŚŹŻ')).toBe('acelnoszz');
  });

  it('collapses stray whitespace', () => {
    expect(normalizeAuthor('  El   Dupa ')).toBe('el dupa');
  });
});

describe('groupSongs', () => {
  it('gives an artist a section once they reach the threshold', () => {
    const grouped = groupSongs([...manyBy('Kortez', 6), songOf('Co innego', 'Ktoś')], 6);
    expect(grouped.sections.map(s => s.name)).toEqual(['Kortez']);
    expect(grouped.misc.map(s => s.meta.title)).toEqual(['Co innego']);
  });

  it('leaves an artist one song short in the rest', () => {
    const grouped = groupSongs(manyBy('Kortez', 5), 6);
    expect(grouped.sections).toEqual([]);
    expect(grouped.misc.length).toBe(5);
  });

  it('counts spellings that differ only by case or accent as one artist', () => {
    const songs = [...manyBy('Zespół Reprezentacyjny', 3), ...manyBy('Zespol reprezentacyjny', 3).map(s => ({ ...s, id: `b-${s.id}` }))];
    const grouped = groupSongs(songs, 6);
    expect(grouped.sections.length).toBe(1);
    expect(grouped.sections[0].songs.length).toBe(6);
  });

  it('prints the spelling most of the files use', () => {
    const songs = [...manyBy('Zespół Reprezentacyjny', 5), { ...songOf('Inna', 'zespol reprezentacyjny'), id: 'inna' }];
    expect(groupSongs(songs, 6).sections[0].name).toBe('Zespół Reprezentacyjny');
  });

  it('orders the sections alphabetically and the songs inside them by title', () => {
    const songs = [...manyBy('Żubry', 6), ...manyBy('Arka', 6).map(s => ({ ...s, id: `a-${s.id}` }))];
    const grouped = groupSongs(songs, 6);
    expect(grouped.sections.map(s => s.name)).toEqual(['Arka', 'Żubry']);
    expect(grouped.sections[0].songs.map(s => s.meta.title)).toEqual([
      'Piosenka 1',
      'Piosenka 2',
      'Piosenka 3',
      'Piosenka 4',
      'Piosenka 5',
      'Piosenka 6',
    ]);
  });

  it('sorts the rest by title, whoever they are by', () => {
    const grouped = groupSongs([songOf('Zet', 'A'), songOf('Alfa', 'B')], 6);
    expect(grouped.misc.map(s => s.meta.title)).toEqual(['Alfa', 'Zet']);
  });

  it('puts a song with no author among the rest', () => {
    const grouped = groupSongs(
      [{ ...songOf('Sierota', ''), meta: { title: 'Sierota', notation: 'pl' as const, notationGuessed: true } }],
      6
    );
    expect(grouped.misc.map(s => s.meta.title)).toEqual(['Sierota']);
  });

  it('makes no sections at all when the threshold is 0', () => {
    const grouped = groupSongs(manyBy('Kortez', 6), 0);
    expect(grouped.sections).toEqual([]);
    expect(grouped.misc.length).toBe(6);
  });

  it('names the leftover group', () => {
    expect(MISC_SECTION).toBe('Różne');
  });
});
