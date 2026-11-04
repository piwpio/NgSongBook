import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Song } from '../model/song.model';
import { buildSongContent, buildStyles } from './song-content';
import { PdfOptions, contentWidth, resolvePdfOptions } from './pdf-options';
import { CoverOptions, buildCover } from './cover';

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
  const tocEntries: TocEntry[] = [];

  songs.forEach((song, index) => {
    const built = buildSongContent(song, {
      ...options,
      pageBreak: index === 0 ? firstSongBreaksPage : options.songPerPage,
    });
    songContent.push(...built.content);
    tocEntries.push({ title: song.meta.title, destination: song.id, node: built.titleNode });
  });

  if (withToc) {
    content.push({
      text: raw.tocTitle ?? 'Spis treści',
      style: 'tocTitle',
      ...(withCover ? { pageBreak: 'before' as const } : {}),
    });
    content.push(buildToc(tocEntries, options));
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
function buildToc(entries: TocEntry[], options: PdfOptions): Content {
  // pdfmake fills the page number into the FIRST line of the cell only, so the
  // '00000' placeholder must never wrap - a wrapped one leaves '00' behind on a
  // second line. The column is sized for the widest page number this book can
  // plausibly reach, and noWrap keeps anything longer on one line anyway.
  const digits = Math.max(2, String(entries.length * 3 + 2).length);
  const size = options.lyricsFontSize;
  const measure = (text: string) => (options.measureText ? options.measureText(text, size, false) : text.length * size * 0.5);

  const numberWidth = measure('0'.repeat(digits));
  const available = contentWidth(options) - numberWidth;

  return {
    stack: entries.map(entry => ({
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
    })),
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
