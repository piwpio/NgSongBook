import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Song } from '../model/song.model';
import { buildSongContent, buildStyles } from './song-content';
import { PAGE_POINTS, PdfOptions, resolvePdfOptions } from './pdf-options';

export interface SongbookDocOptions extends Partial<PdfOptions> {
  /** Cover page with the songbook title. Default: true. */
  cover?: boolean;
  /** Clickable table of contents with live page numbers. Default: true. */
  toc?: boolean;
  /** Page numbers in the footer. Default: true. */
  pageNumbers?: boolean;
  /** Shown on the cover, e.g. a generation date. */
  subtitle?: string;
  /** Heading above the table of contents. Default: 'Spis treści'. */
  tocTitle?: string;
  /** Dedication pinned to the bottom right of the cover. `null` removes it. */
  dedication?: string | null;
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
  const sample = '0'.repeat(digits);
  const numberWidth = options.measureText
    ? options.measureText(sample, options.lyricsFontSize, false)
    : options.lyricsFontSize * 0.62 * digits;

  return {
    stack: entries.map(entry => ({
      columns: [
        {
          // 'auto' is resolved per row, so the leader starts where THIS title
          // ends - not where the longest title in the list ends.
          text: entry.title,
          style: 'tocEntry',
          width: 'auto',
          linkToDestination: entry.destination,
        },
        dotLeader(options),
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
 * The run of dots between a title and its page number. A one cell table whose
 * only visible edge is a dashed bottom border - it stretches across whatever
 * space is left, which a fixed string of dots could never do.
 */
function dotLeader(options: PdfOptions): Content {
  return {
    width: '*',
    table: { widths: ['*'], heights: [0], body: [[{ text: '' }]] },
    layout: {
      hLineWidth: (index: number, node: { table: { body: unknown[] } }) => (index === node.table.body.length ? 0.8 : 0),
      vLineWidth: () => 0,
      hLineStyle: () => ({ dash: { length: 0.8, space: 2.6 } }),
      hLineColor: () => '#666666',
      paddingLeft: () => 4,
      paddingRight: () => 3,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, options.lyricsFontSize * 0.92, 0, 0],
  } as unknown as Content;
}

export const DEFAULT_DEDICATION = 'Dla Irminy i Astrid, moich najwierniejszych fanek na dobre i złe';

function buildCover(options: PdfOptions, raw: SongbookDocOptions): Content[] {
  const page = PAGE_POINTS[options.pageSize];
  const [left, , right, bottom] = options.margins;
  const titleSize = options.titleFontSize + 14;

  // Pinned to the middle of the sheet rather than pushed down by a margin, so
  // the title sits optically centred whatever the page size.
  const titleBlock: Content = {
    absolutePosition: { x: left, y: page.height / 2 - titleSize * 0.72 },
    columns: [
      {
        width: page.width - left - right,
        stack: [
          { text: options.title, style: 'coverTitle' },
          ...(raw.subtitle ? [{ text: raw.subtitle, style: 'coverSubtitle', margin: [0, 12, 0, 0] }] : []),
        ],
      },
    ],
  } as unknown as Content;

  // A page needs something in the normal flow or pdfmake drops it entirely.
  const content: Content[] = [{ text: '', margin: [0, 0, 0, 0] }, titleBlock];

  const dedication = raw.dedication === undefined ? DEFAULT_DEDICATION : raw.dedication;
  if (dedication) {
    const textWidth = (page.width - left - right) * 0.6;

    content.push({
      // Pinned to the bottom right of the cover, the way a footnote sits.
      absolutePosition: { x: page.width - right - textWidth, y: page.height - bottom - 34 },
      columns: [{ text: dedication, style: 'coverDedication', width: textWidth }],
    });
  }

  return content;
}
