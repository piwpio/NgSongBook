import { Content, ContentStack } from 'pdfmake/interfaces';
import { Song, SongBlock, SongLine } from '../model/song.model';
import { ChordNotation } from '../parser/chord';
import { formatChords } from '../parser/chord-tokenizer';
import { PdfOptions, contentHeight, contentWidth, lineHeightOf, textColumnWidth } from './pdf-options';

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
  const source = song.meta.notation;

  if (options.layout === 'columns') {
    const width = textColumnWidth(options);
    const blocks = song.blocks.map(block => ({
      node: buildBlock(block, options, width, source) as Content,
      height: estimateBlockHeight(block, options, source, width),
    }));
    const pages = layOutColumns(blocks, options, estimateHeaderHeight(song, options), width);
    return { content: [...header, ...pages], titleNode: header[0] };
  }

  const lyricsWidth = lyricsColumnWidth(song, options);
  const blocks = song.blocks.map(block => buildBlock(block, options, lyricsWidth, source));
  return { content: [...header, ...blocks], titleNode: header[0] };
}

/** How much of a column is left once the safety margin is taken off. */
const COLUMN_FILL = 0.98;

interface MeasuredBlock {
  node: Content;
  height: number;
}

/**
 * Hands each verse to a column.
 *
 * pdfmake's `columns` is a fixed side-by-side layout - it does not pour text
 * from one column into the next - so the blocks are dealt out here instead. A
 * verse goes in whole or not at all, which is the point: it can never be torn
 * between two columns or two pages. The only exception is a verse taller than a
 * whole column, which has nowhere else to go.
 */
function layOutColumns(blocks: MeasuredBlock[], options: PdfOptions, headerHeight: number, columnWidth: number): Content[] {
  const count = Math.max(1, options.columnCount);
  const full = contentHeight(options);
  // The header sits above the columns, so it eats into the first page only.
  const limitFor = (pageIndex: number) => (pageIndex === 0 ? full - headerHeight : full) * COLUMN_FILL;

  const pages = fill(blocks, count, limitFor);

  // A song that fits on one page is balanced across its columns: filling the
  // left one to the brim and leaving the right half empty is correct but looks
  // lopsided. Over several pages the columns are filled to the top instead, so
  // the song takes as few pages as it can.
  //
  // Balancing is only kept if it still fits on that one page. An even split can
  // land just under a verse's height and push the leftovers onto a second page,
  // which is a worse outcome than a lopsided but single page.
  const laidOut = balanceIfItStillFits(blocks, count, pages, limitFor(0));

  return laidOut.map((columns, index) => ({
    columns: columns.map(stack => ({ width: columnWidth, stack })),
    columnGap: options.textColumnGap,
    ...(index > 0 ? { pageBreak: 'before' as const } : {}),
  })) as Content[];
}

function emptyColumns(count: number): Content[][] {
  return Array.from({ length: count }, () => [] as Content[]);
}

/** Deals the blocks into columns, starting a new page when the last one is full. */
function fill(blocks: MeasuredBlock[], count: number, limitFor: (pageIndex: number) => number): Content[][][] {
  const pages: Content[][][] = [];
  let current = emptyColumns(count);
  let column = 0;
  let used = 0;

  for (const block of blocks) {
    if (current[column].length > 0 && used + block.height > limitFor(pages.length)) {
      column += 1;
      used = 0;
      if (column >= count) {
        pages.push(current);
        current = emptyColumns(count);
        column = 0;
      }
    }
    current[column].push(block.node);
    used += block.height;
  }

  pages.push(current);
  return pages;
}

/**
 * Spreads the blocks evenly over the columns - but only if that still leaves
 * the song on one page.
 */
function balanceIfItStillFits(blocks: MeasuredBlock[], count: number, sequential: Content[][][], limit: number): Content[][][] {
  if (sequential.length !== 1) {
    return sequential;
  }

  // Start from a perfectly even share and let the columns grow until the song
  // fits on one page again. The last step is the sequential layout itself, so
  // the search always ends - at worst with what it started from.
  const total = blocks.reduce((sum, block) => sum + block.height, 0);
  const even = total / count;
  const steps = 12;

  for (let step = 0; step <= steps; step++) {
    const target = even + ((limit - even) * step) / steps;
    const balanced = fill(blocks, count, () => target);
    if (balanced.length === 1) {
      return balanced;
    }
  }

  return sequential;
}

/**
 * How tall a verse will be once set in a column of the given width. Uses the
 * same text the renderer will use, so the guess cannot drift from the result.
 */
function estimateBlockHeight(block: SongBlock, options: PdfOptions, source: ChordNotation, columnWidth: number): number {
  const indent = block.kind === 'chorus' ? options.chorusIndent : 0;
  const width = Math.max(10, columnWidth - indent);
  let height = options.blockGap;

  block.lines.forEach((line, index) => {
    const chordText = renderChords(line, options, source);

    if (line.chordsOnly) {
      height +=
        wrappedLines(chordText, width, options.chordFontSize, true, options, CHORD_SPACING) *
        lineHeightOf(options, options.chordFontSize, 1);
      return;
    }

    if (options.chordLayout === 'above' && chordText) {
      height +=
        wrappedLines(chordText, width, options.chordFontSize, true, options, CHORD_SPACING) *
        lineHeightOf(options, options.chordFontSize, 1);
    }

    const opening = index === 0 && options.capitalizeBlocks;
    const lyrics = opening ? capitalizeFirst(line.lyrics) : line.lyrics;
    height +=
      wrappedLines(lyrics || ' ', width, options.lyricsFontSize, options.boldLyrics, options, 0) *
      lineHeightOf(options, options.lyricsFontSize, options.lineHeight);
  });

  return height;
}

/** The chord style is letterspaced; the measurer does not know that. */
const CHORD_SPACING = 0.6;

function estimateHeaderHeight(song: Song, options: PdfOptions): number {
  const width = contentWidth(options);
  let height =
    lineHeightOf(options, options.titleFontSize, 1.05) * wrappedLines(song.meta.title, width, options.titleFontSize, true, options, 0);
  height += 2;

  if (song.meta.author || song.meta.extra) {
    height += lineHeightOf(options, options.lyricsFontSize - 2.5, 1);
  }

  // The rule under the header, with its margins.
  height += 6 + 0.6 + 10;
  return height;
}

/** How many lines the text takes once wrapped to the given width. */
function wrappedLines(text: string, width: number, fontSize: number, bold: boolean, options: PdfOptions, spacingPerChar: number): number {
  if (!text) {
    return 0;
  }

  const measure = (value: string) =>
    (options.measureText ? options.measureText(value, fontSize, bold) : value.length * fontSize * 0.5) + value.length * spacingPerChar;

  if (measure(text) <= width) {
    return 1;
  }

  let lines = 1;
  let current = '';
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= width) {
      current = candidate;
    } else {
      lines += 1;
      current = word;
    }
  }
  return lines;
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
      if (!line.lyrics || line.chordsOnly) {
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
function buildBlock(block: SongBlock, options: PdfOptions, lyricsWidth: number, source: ChordNotation): ContentStack {
  const indent = block.kind === 'chorus' ? options.chorusIndent : 0;
  const lines: Content[] = [];

  // The block opens on its first line that actually carries words - a verse
  // may well start with a {chords} passage.
  const openingLine = options.capitalizeBlocks ? block.lines.findIndex(line => !line.chordsOnly && line.lyrics !== '') : -1;

  block.lines.forEach((line, index) => {
    const opening = index === openingLine;
    lines.push(...buildLine(line, options, lyricsWidth, indent, source, opening));
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

function buildLine(
  line: SongLine,
  options: PdfOptions,
  lyricsWidth: number,
  indent: number,
  source: ChordNotation,
  opening = false
): Content[] {
  const chordText = renderChords(line, options, source);
  const lyrics = opening ? capitalizeFirst(line.lyrics) : line.lyrics;
  const margin: [number, number, number, number] = [indent, 0, 0, 0];

  // A `{chords}` passage has no lyrics to sit beside, so it goes where the
  // words would be rather than out in the chord column.
  if (line.chordsOnly) {
    return chordText ? [{ text: chordText, style: SONG_STYLES.chords, margin }] : [];
  }

  if (options.chordLayout === 'none') {
    return [{ text: lyrics, style: SONG_STYLES.lyrics, margin }];
  }

  // A line with no chords still keeps the two column shape, so the words stay
  // in the lyrics column instead of running out under the chords of the lines
  // above and below it.
  if (options.chordLayout === 'right') {
    return [
      {
        columns: [
          { text: lyrics, style: SONG_STYLES.lyrics, width: lyricsWidth, margin },
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

  // 'above' - with no chords to show there is simply no line above the words.
  if (!chordText) {
    return [{ text: lyrics, style: SONG_STYLES.lyrics, margin }];
  }

  return [
    { text: chordText, style: SONG_STYLES.chords, margin },
    { text: lyrics, style: SONG_STYLES.lyrics, margin },
  ];
}

/** Upper-cases the opening letter, leaving anything that is not a letter alone. */
function capitalizeFirst(text: string): string {
  if (!text) {
    return text;
  }
  const first = text[0];
  const upper = first.toLocaleUpperCase('pl-PL');
  return upper === first ? text : upper + text.slice(1);
}

function renderChords(line: SongLine, options: PdfOptions, source: ChordNotation): string {
  if (!line.rawChords) {
    return '';
  }

  const target = options.chordNotation;

  // `--no-split-chords` means "print it as written" - but only while written and
  // printed are the same notation. Once the chords are being translated there is
  // no verbatim form to keep, so they are spaced out like any other.
  if (!options.splitChords) {
    return source === target ? line.rawChords : formatChords(line.chords, target, ' ');
  }

  return formatChords(line.chords, target);
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
