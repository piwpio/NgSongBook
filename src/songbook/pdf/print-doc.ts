import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Song } from '../model/song.model';
import { MISC_SECTION, groupSongs } from '../model/grouping';
import { CoverOptions, buildCover, buildSectionPage } from './cover';
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

  // The batch is grouped the same way the songbook is, so a sheet filed under
  // an artist's divider in the binder matches the book it came from.
  const grouped = groupSongs(songs, options.sectionThreshold);
  const parts: { heading: string | null; songs: Song[] }[] = [
    ...grouped.sections.map(section => ({ heading: section.name, songs: section.songs })),
    ...(grouped.misc.length > 0 ? [{ heading: grouped.sections.length > 0 ? MISC_SECTION : null, songs: grouped.misc }] : []),
  ];

  let placed = 0;
  for (const part of parts) {
    if (part.heading) {
      content.push(...buildSectionPage(options, part.heading));
    }

    part.songs.forEach((song, index) => {
      const pageBreak = part.heading ? index === 0 || options.songPerPage : placed === 0 ? withCover : options.songPerPage;
      content.push(...buildSongContent(song, { ...options, pageBreak }).content);
      placed += 1;
    });
  }

  return {
    pageSize: options.pageSize,
    pageMargins: options.margins,
    info: { title: `${options.title} - do druku`, author: 'NgSongBook' },
    content,
    styles: buildStyles(options),
    defaultStyle: { font: 'Roboto', fontSize: options.lyricsFontSize },
  };
}
