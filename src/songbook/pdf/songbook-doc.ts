import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Song } from '../model/song.model';
import { buildSongContent, buildStyles } from './song-content';
import { PdfOptions, resolvePdfOptions } from './pdf-options';

export interface SongbookDocOptions extends Partial<PdfOptions> {
  /** Cover page with the songbook title. Default: true. */
  cover?: boolean;
  /** Clickable table of contents with live page numbers. Default: true. */
  toc?: boolean;
  /** Page numbers in the footer. Default: true. */
  pageNumbers?: boolean;
  /** Shown on the cover, e.g. a generation date. */
  subtitle?: string;
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
    content.push(...buildCover(options, raw.subtitle, songs.length));
  }

  if (withToc) {
    content.push({
      toc: {
        title: { text: 'Spis treści', style: 'tocTitle' },
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
            text: `${currentPage} / ${pageCount}`,
            alignment: 'center',
            style: 'footer',
            margin: [0, 10, 0, 0],
          }),
        }
      : {}),
  };
}

function buildCover(options: PdfOptions, subtitle: string | undefined, count: number): Content[] {
  return [
    { text: '', margin: [0, options.pageSize === 'A5' ? 110 : 190, 0, 0] },
    { text: options.title, style: 'coverTitle' },
    {
      text: subtitle ?? `${count} ${pluralSongs(count)}`,
      style: 'coverSubtitle',
      margin: [0, 10, 0, 0],
    },
  ];
}

function pluralSongs(count: number): string {
  if (count === 1) {
    return 'piosenka';
  }
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 12 && lastTwo <= 14) {
    return 'piosenek';
  }
  return last >= 2 && last <= 4 ? 'piosenki' : 'piosenek';
}
