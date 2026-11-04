import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Song } from '../model/song.model';
import { CoverOptions, buildCover } from './cover';
import { buildSongContent, buildStyles } from './song-content';
import { PdfOptions, resolvePdfOptions } from './pdf-options';

export interface PrintDocOptions extends Partial<PdfOptions>, CoverOptions {
  /** Title page at the front. Default: true. */
  cover?: boolean;
}

/**
 * The "to print" document: loose song sheets for the binder.
 *
 * It opens with the title page and then the songs, and that is all. No table
 * of contents and - deliberately - NO page numbers: the binder grows batch by
 * batch, so any numbering would be wrong the moment the next batch comes out.
 *
 * The cover is printed EVERY time, however few songs the batch holds, so a
 * cover worn out in the binder can simply be swapped for the fresh one.
 */
export function buildPrintDoc(songs: Song[], raw: PrintDocOptions = {}): TDocumentDefinitions {
  const options = resolvePdfOptions(raw);
  const withCover = raw.cover !== false;

  const content: Content[] = [];

  if (withCover) {
    content.push(...buildCover(options, raw));
  }

  songs.forEach((song, index) => {
    content.push(
      ...buildSongContent(song, {
        ...options,
        pageBreak: index === 0 ? withCover : options.songPerPage,
      }).content
    );
  });

  return {
    pageSize: options.pageSize,
    pageMargins: options.margins,
    info: { title: `${options.title} - do druku`, author: 'NgSongBook' },
    content,
    styles: buildStyles(options),
    defaultStyle: { font: 'Roboto', fontSize: options.lyricsFontSize },
  };
}
