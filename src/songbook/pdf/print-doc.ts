import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Song } from '../model/song.model';
import { buildSongContent, buildStyles } from './song-content';
import { PdfOptions, resolvePdfOptions } from './pdf-options';

/**
 * The "to print" document: a loose set of song sheets for a binder.
 *
 * No cover, no table of contents and - deliberately - NO page numbers:
 * these sheets are printed in batches over time, so any numbering would be
 * wrong the moment the next batch is generated.
 */
export function buildPrintDoc(songs: Song[], raw: Partial<PdfOptions> = {}): TDocumentDefinitions {
  const options = resolvePdfOptions(raw);

  const content: Content[] = [];
  songs.forEach((song, index) => {
    content.push(
      ...buildSongContent(song, {
        ...options,
        tocItem: false,
        pageBreak: index === 0 ? false : options.songPerPage,
      })
    );
  });

  return {
    pageSize: options.pageSize,
    pageMargins: options.margins,
    info: { title: `${options.title} - print set`, author: 'NgSongBook' },
    content,
    styles: buildStyles(options),
    defaultStyle: { font: 'Roboto', fontSize: options.lyricsFontSize },
  };
}
