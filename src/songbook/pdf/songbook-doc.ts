import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Song } from '../model/song.model';
import { buildSongContent, buildStyles } from './song-content';
import { PageSize, PdfOptions, resolvePdfOptions } from './pdf-options';

export interface SongbookDocOptions extends Partial<PdfOptions> {
  /** Cover page with the songbook title. Default: true. */
  cover?: boolean;
  /** Clickable table of contents with live page numbers. Default: true. */
  toc?: boolean;
  /** Page numbers in the footer. Default: true. */
  pageNumbers?: boolean;
  /** Shown on the cover, e.g. a generation date. */
  subtitle?: string;
  /** Heading above the table of contents. Default: 'Contents'. */
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

  if (withToc) {
    content.push({
      toc: {
        title: { text: raw.tocTitle ?? 'Contents', style: 'tocTitle' },
        textStyle: 'tocEntry',
        numberStyle: 'tocNumber',
      },
      ...(withCover ? { pageBreak: 'before' as const } : {}),
    });
  }

  const firstSongBreaksPage = withCover || withToc;
  songs.forEach((song, index) => {
    content.push(
      ...buildSongContent(song, {
        ...options,
        tocItem: withToc,
        pageBreak: index === 0 ? firstSongBreaksPage : options.songPerPage,
      })
    );
  });

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

/** Page size in points - pdfmake's own values, needed to pin the dedication. */
const PAGE_POINTS: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 419.53, height: 595.28 },
};

export const DEFAULT_DEDICATION = 'Dla Irminy i Astrid, moich najwierniejszych fanek na dobre i złe';

function buildCover(options: PdfOptions, raw: SongbookDocOptions): Content[] {
  const content: Content[] = [
    { text: '', margin: [0, options.pageSize === 'A5' ? 110 : 190, 0, 0] },
    { text: options.title, style: 'coverTitle' },
  ];

  if (raw.subtitle) {
    content.push({ text: raw.subtitle, style: 'coverSubtitle', margin: [0, 10, 0, 0] });
  }

  const dedication = raw.dedication === undefined ? DEFAULT_DEDICATION : raw.dedication;
  if (dedication) {
    const page = PAGE_POINTS[options.pageSize];
    const [left, , right, bottom] = options.margins;
    const textWidth = (page.width - left - right) * 0.6;

    content.push({
      // Pinned to the bottom right of the cover, the way a footnote sits.
      absolutePosition: { x: page.width - right - textWidth, y: page.height - bottom - 34 },
      columns: [{ text: dedication, style: 'coverDedication', width: textWidth }],
    });
  }

  return content;
}
