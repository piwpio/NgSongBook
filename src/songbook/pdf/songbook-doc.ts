import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Song } from '../model/song.model';
import { buildSongContent, buildStyles } from './song-content';
import { MISC_SECTION, groupSongs } from '../model/grouping';
import { PdfOptions, contentWidth, resolvePdfOptions } from './pdf-options';
import { CoverOptions, buildCover, buildSectionPage } from './cover';

export interface SongbookDocOptions extends Partial<PdfOptions>, CoverOptions {
  /** Cover page with the songbook title. Default: true. */
  cover?: boolean;
  /** Clickable table of contents with live page numbers. Default: true. */
  toc?: boolean;
  /** Page numbers in the footer. Default: true. */
  pageNumbers?: boolean;
  /** Heading above the table of contents. Default: 'Spis treści'. */
  tocTitle?: string;
}

/**
 * The full songbook: cover, clickable table of contents with page numbers,
 * and every song starting on its own page. Page numbers and the TOC are
 * recomputed on every generation, so they always match the current content.
 */
export function buildSongbookDoc(songs: Song[], raw: SongbookDocOptions = {}): TDocumentDefinitions {
  const options = resolvePdfOptions(raw);
  const withCover = raw.cover !== false;
  const withToc = raw.toc !== false;
  const withPageNumbers = raw.pageNumbers !== false;

  const content: Content[] = [];

  if (withCover) {
    content.push(...buildCover(options, raw));
  }

  const firstSongBreaksPage = withCover || withToc;
  const songContent: Content[] = [];
  const tocGroups: TocGroup[] = [];
  let placed = 0;

  // Each artist with enough songs opens their own section; everyone else is
  // gathered at the end. The book and its contents run in the same order, so
  // the page numbers climb as the reader turns pages.
  const grouped = groupSongs(songs, options.sectionThreshold);
  const parts: { heading: string | null; songs: Song[] }[] = [
    ...grouped.sections.map(section => ({ heading: section.name, songs: section.songs })),
    ...(grouped.misc.length > 0 ? [{ heading: grouped.sections.length > 0 ? MISC_SECTION : null, songs: grouped.misc }] : []),
  ];

  for (const part of parts) {
    if (part.heading && grouped.sections.length > 0) {
      songContent.push(...buildSectionPage(options, part.heading));
    }

    const entries: TocEntry[] = [];
    for (const song of part.songs) {
      // After a section page the first song starts a new page too, so the
      // divider stands alone with nothing but the artist's name on it.
      const first = entries.length === 0;
      const pageBreak = part.heading ? first || options.songPerPage : placed === 0 ? firstSongBreaksPage : options.songPerPage;

      const built = buildSongContent(song, { ...options, pageBreak });
      songContent.push(...built.content);
      entries.push({ title: song.meta.title, destination: song.id, node: built.titleNode });
      placed += 1;
    }
    tocGroups.push({ heading: part.heading, entries });
  }

  if (withToc) {
    content.push({
      text: raw.tocTitle ?? 'Spis treści',
      style: 'tocTitle',
      ...(withCover ? { pageBreak: 'before' as const } : {}),
    });
    content.push(buildToc(tocGroups, options));
  }

  content.push(...songContent);

  return {
    pageSize: options.pageSize,
    pageMargins: options.margins,
    info: { title: options.title, author: 'NgSongBook' },
    content,
    styles: buildStyles(options),
    defaultStyle: { font: 'Roboto', fontSize: options.lyricsFontSize },
    ...(withPageNumbers
      ? {
          footer: (currentPage: number, pageCount: number) => ({
            // The cover carries no number, but it still counts - so the numbers
            // printed here always match the ones in the table of contents.
            text: withCover && currentPage === 1 ? '' : `${currentPage} / ${pageCount}`,
            alignment: 'center',
            style: 'footer',
            margin: [0, 10, 0, 0],
          }),
        }
      : {}),
  };
}

interface TocEntry {
  title: string;
  /** Anchor id set on the song title, used for the clickable link. */
  destination: string;
  /** The song title node - pdfmake reads the page it landed on from it. */
  node: Content;
}

/**
 * Table of contents with dot leaders.
 *
 * pdfmake's built-in `toc` node is a fixed two column table, so there is no
 * room for leaders between the title and the page number. This builds the same
 * table by hand with a third column in the middle, and hands pdfmake the song
 * title node through `_tocItemRef` - the very hook the built-in TOC uses - so
 * the page numbers are still filled in after the whole document is laid out.
 */
interface TocGroup {
  /** The artist, or `Różne`; null when the book has no sections at all. */
  heading: string | null;
  entries: TocEntry[];
}

function buildToc(groups: TocGroup[], options: PdfOptions): Content {
  const entries = groups.flatMap(group => group.entries);
  // pdfmake fills the page number into the FIRST line of the cell only, so the
  // '00000' placeholder must never wrap - a wrapped one leaves '00' behind on a
  // second line. The column is sized for the widest page number this book can
  // plausibly reach, and noWrap keeps anything longer on one line anyway.
  const digits = Math.max(2, String(entries.length * 3 + 2).length);
  const size = options.lyricsFontSize;
  const measure = (text: string) => (options.measureText ? options.measureText(text, size, false) : text.length * size * 0.5);

  const numberWidth = measure('0'.repeat(digits));
  const available = contentWidth(options) - numberWidth;

  const row = (entry: TocEntry): Content =>
    ({
      columns: [
        {
          // Title and leader are ONE text node, so the link annotation covers
          // the whole run instead of just the words - the dots are clickable too.
          text: `${entry.title} ${leaderDots(entry.title, available, measure)}`,
          style: 'tocEntry',
          width: '*',
          noWrap: true,
          linkToDestination: entry.destination,
        },
        {
          text: '00000',
          style: 'tocNumber',
          width: numberWidth,
          alignment: 'right',
          noWrap: true,
          linkToDestination: entry.destination,
          _tocItemRef: entry.node,
        },
      ],
      columnGap: 0,
    }) as unknown as Content;

  return {
    stack: groups.flatMap(group => [...(group.heading ? [{ text: group.heading, style: 'tocSection' }] : []), ...group.entries.map(row)]),
  } as unknown as Content;
}

/**
 * The run of dots between a title and its page number, as real text rather
 * than a drawn rule - that is what makes the gap part of the link. The count
 * is measured in the document font, so the dots stop just short of the number
 * however long the title is.
 */
function leaderDots(title: string, available: number, measure: (text: string) => number): string {
  const unit = measure(' .');
  if (unit <= 0) {
    return '';
  }
  const gap = available - measure(`${title} `);
  const count = Math.floor(gap / unit) - 1;
  return count > 0 ? ' .'.repeat(count).trimStart() : '';
}
