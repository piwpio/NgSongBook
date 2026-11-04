import { Content, ContentStack } from 'pdfmake/interfaces';
import { Song, SongBlock, SongLine } from '../model/song.model';
import { formatChords } from '../parser/chord-tokenizer';
import { PdfOptions } from './pdf-options';

export const SONG_STYLES = {
  songTitle: 'songTitle',
  songAuthor: 'songAuthor',
  songExtra: 'songExtra',
  lyrics: 'lyrics',
  chords: 'chords',
} as const;

export interface SongContentOptions extends PdfOptions {
  /** Add the song title to the generated table of contents. */
  tocItem?: boolean;
  /** Force a page break before this song (ignored for the very first song). */
  pageBreak?: boolean;
}

export function buildSongContent(song: Song, options: SongContentOptions): Content[] {
  const header = buildHeader(song, options);
  const blocks = song.blocks.map(block => buildBlock(block, options));
  return [...header, ...blocks];
}

function buildHeader(song: Song, options: SongContentOptions): Content[] {
  const title: Content = {
    text: song.meta.title,
    style: SONG_STYLES.songTitle,
    id: song.id,
    ...(options.tocItem ? { tocItem: true } : {}),
    ...(options.pageBreak ? { pageBreak: 'before' as const } : {}),
    margin: [0, 0, 0, song.meta.author || song.meta.extra ? 1 : 8],
  };

  const content: Content[] = [title];

  if (song.meta.author) {
    content.push({ text: song.meta.author, style: SONG_STYLES.songAuthor, margin: [0, 0, 0, 1] });
  }
  if (song.meta.extra) {
    content.push({ text: song.meta.extra, style: SONG_STYLES.songExtra });
  }
  if (song.meta.author || song.meta.extra) {
    content.push({ text: '', margin: [0, 0, 0, 6] });
  }

  return content;
}

/**
 * One verse / chorus. `unbreakable` keeps the whole block on a single page,
 * so a stanza is never torn in half across a page boundary.
 */
function buildBlock(block: SongBlock, options: PdfOptions): ContentStack {
  const indent = block.kind === 'chorus' ? options.chorusIndent : 0;
  const lines: Content[] = [];

  block.lines.forEach((line, index) => {
    const isChorusHead = block.kind === 'chorus' && index === 0;
    lines.push(...buildLine(line, options, isChorusHead ? block.label ?? 'Ref.' : undefined));
  });

  return {
    stack: lines,
    unbreakable: true,
    margin: [indent, 0, 0, options.blockGap],
  };
}

function buildLine(line: SongLine, options: PdfOptions, chorusLabel?: string): Content[] {
  const lyrics = buildLyricsText(line, chorusLabel);
  const chordText = renderChords(line, options);

  if (options.chordLayout === 'none' || !chordText) {
    return [{ text: lyrics, style: SONG_STYLES.lyrics }];
  }

  if (options.chordLayout === 'right') {
    return [
      {
        columns: [
          { text: lyrics, style: SONG_STYLES.lyrics, width: '*' },
          {
            text: chordText,
            style: SONG_STYLES.chords,
            width: options.chordColumnWidth,
            alignment: 'right',
            noWrap: false,
          },
        ],
        columnGap: 10,
      },
    ];
  }

  // 'above'
  return [
    { text: chordText, style: SONG_STYLES.chords },
    { text: lyrics, style: SONG_STYLES.lyrics },
  ];
}

function buildLyricsText(line: SongLine, chorusLabel?: string): Content {
  if (!chorusLabel) {
    return line.lyrics;
  }
  return [{ text: `${chorusLabel} `, bold: true }, { text: line.lyrics }] as unknown as Content;
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
      lineHeight: 1.1,
    },
    [SONG_STYLES.songAuthor]: {
      fontSize: options.lyricsFontSize - 1,
      italics: true,
      color: '#555555',
    },
    [SONG_STYLES.songExtra]: {
      fontSize: options.lyricsFontSize - 1.5,
      color: '#777777',
    },
    [SONG_STYLES.lyrics]: {
      fontSize: options.lyricsFontSize,
      bold: options.boldLyrics,
      lineHeight: options.lineHeight,
    },
    [SONG_STYLES.chords]: {
      fontSize: options.chordFontSize,
      bold: true,
      color: '#1a4f8a',
      lineHeight: 1,
    },
    tocTitle: { fontSize: options.titleFontSize, bold: true, margin: [0, 0, 0, 12] },
    tocEntry: { fontSize: options.lyricsFontSize, lineHeight: 1.45 },
    tocNumber: { fontSize: options.lyricsFontSize, lineHeight: 1.45 },
    coverTitle: { fontSize: options.titleFontSize + 14, bold: true, alignment: 'center' },
    coverSubtitle: { fontSize: options.lyricsFontSize + 1, color: '#555555', alignment: 'center' },
    coverDedication: {
      fontSize: options.lyricsFontSize - 1.5,
      italics: true,
      color: '#6b6b70',
      alignment: 'right',
      lineHeight: 1.3,
    },
    footer: { fontSize: 8.5, color: '#888888' },
  };
}
