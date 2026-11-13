import { Song, sortSongsByTitle } from './song.model';

/**
 * Artists with enough songs get a section of their own in the songbook; the
 * rest are gathered at the end under this heading.
 */
export const MISC_SECTION = 'Różne';

export interface SongSection {
  /** The artist, spelled the way most of their files spell it. */
  name: string;
  songs: Song[];
}

export interface GroupedSongs {
  /** Artists with a section of their own, alphabetically. */
  sections: SongSection[];
  /** Everyone else, by title. */
  misc: Song[];
}

/**
 * The key two spellings of the same artist have to share.
 *
 * Case is ignored and accents are stripped, so "Zespół Reprezentacyjny" and
 * "Zespol reprezentacyjny" are one artist. Typing the name slightly differently
 * from one file to the next should not scatter a band across the book.
 */
export function normalizeAuthor(name: string): string {
  return (
    name
      .normalize('NFD')
      // Strip the combining marks NFD just separated out.
      .replace(/[̀-ͯ]/g, '')
      // Ł has no decomposition of its own.
      .replace(/ł/g, 'l')
      .replace(/Ł/g, 'L')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * The spelling to print for a group: whichever its files use most often. A tie
 * is broken alphabetically, so the same songs always produce the same name.
 */
function preferredSpelling(songs: Song[]): string {
  const counts = new Map<string, number>();
  for (const song of songs) {
    const name = song.meta.author?.trim();
    if (name) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  let best = '';
  let bestCount = 0;
  for (const [name, count] of [...counts].sort((a, b) => a[0].localeCompare(b[0], 'pl'))) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Splits the songs into sections by artist. An artist needs at least
 * `threshold` songs to get one; below that they go to `misc`.
 */
export function groupSongs(songs: Song[], threshold: number): GroupedSongs {
  // A threshold of zero means "no sections", not "a section for everyone".
  const needed = threshold > 0 ? threshold : Number.POSITIVE_INFINITY;
  const byAuthor = new Map<string, Song[]>();
  for (const song of songs) {
    const key = normalizeAuthor(song.meta.author ?? '');
    if (!key) {
      continue;
    }
    const group = byAuthor.get(key);
    if (group) {
      group.push(song);
    } else {
      byAuthor.set(key, [song]);
    }
  }

  const sections: SongSection[] = [];
  const misc: Song[] = [];

  for (const song of songs) {
    if (!normalizeAuthor(song.meta.author ?? '')) {
      misc.push(song);
    }
  }

  for (const group of byAuthor.values()) {
    if (group.length >= needed) {
      sections.push({ name: preferredSpelling(group), songs: sortSongsByTitle(group) });
    } else {
      misc.push(...group);
    }
  }

  sections.sort((a, b) => a.name.localeCompare(b.name, 'pl', { sensitivity: 'base' }));
  return { sections, misc: sortSongsByTitle(misc) };
}
