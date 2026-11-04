import { Content, ContentStack } from 'pdfmake/interfaces';
import { Song, SongBlock, SongLine } from '../model/song.model';
import { formatChords } from '../parser/chord-tokenizer';
import { PdfOptions, contentWidth } from './pdf-options';

export const SONG_STYLES = {
  songTitle: 'songTitle',
  songAuthor: 'songAuthor',
  songExtra: 'songExtra',
  lyrics: 'lyrics',
  chords: 'chords',
} as const;

export interface SongContentOptions extends PdfOptions {
  /** Force a page break before this song (ignored for the very first song). */
  pageBreak?: boolean;
}

export interface SongContent {
  content: Content[];
  /**
   * The title node itself. The table of contents points at this object to have
   * pdfmake fill in the page the song actually landed on.
   */
  titleNode: Content;
}

export function buildSongContent(song: Song, options: SongContentOptions): SongContent {
  const header = buildHeader(song, options);
  const lyricsWidth = lyricsColumnWidth(song, options);
  const blocks = song.blocks.map(block => buildBlock(block, options, lyricsWidth));
  return { content: [...header, ...blocks], titleNode: header[0] };
}

/**
 * How wide the lyrics column is in the `right` layout.
 *
 * With a text measurer the column ends just past the song's longest line, so
 * the chords sit right next to the words instead of hugging the page edge -
 * and because it is one width for the whole song, they still line up in a
 * single straight column. Without a measurer it falls back to a fixed share
 * of the page.
 */
function lyricsColumnWidth(song: Song, options: PdfOptions): number {
  const available = contentWidth(options);
  const fallback = available * options.lyricsColumnRatio;

  if (options.chordLayout !== 'right') {
    return available;
  }
  if (!options.measureText) {
    return fallback;
  }

  let longest = 0;
  for (const block of song.blocks) {
    const indent = block.kind === 'chorus' ? options.chorusIndent : 0;
    for (const line of block.lines) {
      if (!line.lyrics) {
        continue;
      }
      const width = indent + options.measureText(line.lyrics, options.lyricsFontSize, options.boldLyrics);
      longest = Math.max(longest, width);
    }
  }

  if (longest === 0) {
    return fallback;
  }

  // A line is allowed to run to 78% of the page before the chords are pushed
  // off; past that the column is capped and the longest lines simply wrap.
  const maxWidth = available * 0.78;
  const minWidth = available * 0.25;
  return Math.min(Math.max(longest + 2, minWidth), maxWidth);
}

function buildHeader(song: Song, options: SongContentOptions): Content[] {
  const title: Content = {
    text: song.meta.title,
    style: SONG_STYLES.songTitle,
    id: song.id,
    ...(options.pageBreak ? { pageBreak: 'before' as const } : {}),
    margin: [0, 0, 0, 2],
  };

  const content: Content[] = [title];

  // Author and capo on one line, set small and letterspaced so they read as a
  // caption rather than competing with the title.
  const caption: Content[] = [];
  if (song.meta.author) {
    caption.push({ text: song.meta.author.toUpperCase(), style: SONG_STYLES.songAuthor });
  }
  if (song.meta.extra) {
    if (caption.length > 0) {
      caption.push({ text: '   ', style: SONG_STYLES.songExtra });
    }
    caption.push({ text: song.meta.extra, style: SONG_STYLES.songExtra });
  }
  if (caption.length > 0) {
    content.push({ text: caption, margin: [0, 0, 0, 0] });
  }

  // Hairline under the header - the one bit of ornament, and it survives
  // black and white photocopying.
  content.push({
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: contentWidth(options),
        y2: 0,
        lineWidth: 0.6,
        lineColor: '#000000',
      },
    ],
    margin: [0, 6, 0, 10],
  });

  return content;
}

/**
 * One verse / chorus. `unbreakable` keeps the whole block on a single page,
 * so a stanza is never torn in half across a page boundary.
 */
function buildBlock(block: SongBlock, options: PdfOptions, lyricsWidth: number): ContentStack {
  const indent = block.kind === 'chorus' ? options.chorusIndent : 0;
  const lines: Content[] = [];

  block.lines.forEach(line => {
    lines.push(...buildLine(line, options, lyricsWidth, indent));
  });

  return {
    stack: lines,
    unbreakable: true,
    // The chorus indent is applied to the lyrics themselves, never to the whole
    // block - otherwise the chord column would shift right along with it and
    // stop lining up with the verses.
    margin: [0, 0, 0, options.blockGap],
  };
}

function buildLine(line: SongLine, options: PdfOptions, lyricsWidth: number, indent: number): Content[] {
  const chordText = renderChords(line, options);
  const margin: [number, number, number, number] = [indent, 0, 0, 0];

  if (options.chordLayout === 'none' || !chordText) {
    return [{ text: line.lyrics, style: SONG_STYLES.lyrics, margin }];
  }

  if (options.chordLayout === 'right') {
    return [
      {
        columns: [
          { text: line.lyrics, style: SONG_STYLES.lyrics, width: lyricsWidth, margin },
          {
            // Left aligned so the chords form one straight vertical column
            // the eye can run down, instead of a ragged right edge.
            text: chordText,
            style: SONG_STYLES.chords,
            width: '*',
            alignment: 'left',
            noWrap: false,
          },
        ],
        columnGap: options.chordColumnGap,
      },
    ];
  }

  // 'above'
  return [
    { text: chordText, style: SONG_STYLES.chords, margin },
    { text: line.lyrics, style: SONG_STYLES.lyrics, margin },
  ];
}

function renderChords(line: SongLine, options: PdfOptions): string {
  if (!line.rawChords) {
    return '';
  }
  return options.splitChords ? formatChords(line.chords) : line.rawChords;
}

export function buildStyles(options: PdfOptions): Record<string, Record<string, unknown>> {
  return {
    [SONG_STYLES.songTitle]: {
      fontSize: options.titleFontSize,
      bold: true,
      lineHeight: 1.05,
    },
    [SONG_STYLES.songAuthor]: {
      fontSize: options.lyricsFontSize - 2.5,
      bold: true,
      characterSpacing: 0.9,
      color: '#000000',
    },
    [SONG_STYLES.songExtra]: {
      fontSize: options.lyricsFontSize - 2.5,
      italics: true,
      characterSpacing: 0.3,
      color: '#444444',
    },
    [SONG_STYLES.lyrics]: {
      fontSize: options.lyricsFontSize,
      bold: options.boldLyrics,
      lineHeight: options.lineHeight,
      color: '#000000',
    },
    // Bold and letterspaced rather than coloured - the songbook is printed
    // in black and white, so weight has to do all the work.
    [SONG_STYLES.chords]: {
      fontSize: options.chordFontSize,
      bold: true,
      characterSpacing: 0.6,
      color: '#000000',
      lineHeight: 1,
    },
    tocTitle: { fontSize: options.titleFontSize, bold: true, margin: [0, 0, 0, 12] },
    tocEntry: { fontSize: options.lyricsFontSize, lineHeight: 1.45 },
    tocNumber: { fontSize: options.lyricsFontSize, lineHeight: 1.45 },
    coverTitle: { fontSize: options.titleFontSize + 14, bold: true, alignment: 'center' },
    coverSubtitle: { fontSize: options.lyricsFontSize + 1, color: '#555555', alignment: 'center' },
    coverDedication: {
      fontSize: options.lyricsFontSize + 0.5,
      italics: true,
      color: '#333333',
      alignment: 'right',
      lineHeight: 1.3,
    },
    footer: { fontSize: 8.5, color: '#555555' },
  };
}
