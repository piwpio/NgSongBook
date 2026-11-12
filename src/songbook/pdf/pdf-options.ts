import { ChordNotation } from '../parser/chord-tokenizer';

/**
 * Everything that gets PRINTED is Polish - it is the content of a Polish
 * songbook. English is for the code: CLI output, the app UI and warnings.
 */

export type PageSize = 'A4' | 'A5';

/**
 * `above` - chord line printed directly above its lyrics line.
 * `right` - chords in a right hand column next to the lyrics (saves vertical space).
 * `none`  - lyrics only.
 */
export type ChordLayout = 'above' | 'right' | 'none';

/**
 * `single` - one column of lyrics down the page.
 * `columns` - the song set in two columns, chords above the words. Verses and
 *             choruses are distributed by hand so none is ever torn between
 *             the columns: pdfmake's `columns` is a fixed side-by-side layout
 *             and does not flow text from one into the next by itself.
 */
export type PageLayout = 'single' | 'columns';

export interface PdfOptions {
  pageSize: PageSize;
  layout: PageLayout;
  /** How many columns `layout: 'columns'` uses. */
  columnCount: number;
  /** Gap (pt) between the text columns. */
  textColumnGap: number;
  chordLayout: ChordLayout;
  /** Split `AaDeD` into `A  a  D  e  D` instead of printing it verbatim. */
  splitChords: boolean;
  /**
   * The notation the chords are PRINTED in. Each song declares (or betrays)
   * the one it was written in; this is what it gets translated to.
   */
  chordNotation: ChordNotation;
  lyricsFontSize: number;
  chordFontSize: number;
  titleFontSize: number;
  /** Print lyrics in bold - handy on A5 / when photocopying. */
  boldLyrics: boolean;
  /**
   * Start every verse and chorus with a capital letter, whatever the source
   * file does. Only the first line of the block that HAS lyrics is touched -
   * never the chords, where a lowercase letter means a minor chord.
   */
  capitalizeBlocks: boolean;
  lineHeight: number;
  /** [left, top, right, bottom] */
  margins: [number, number, number, number];
  /**
   * Fallback width of the lyrics column, as a fraction of the content width,
   * used when no `measureText` is available to find the real longest line.
   */
  lyricsColumnRatio: number;
  /** Gap (pt) between the lyrics and the chord column. */
  chordColumnGap: number;
  /**
   * Measures a string in the document font, in points. When provided, the chord
   * column is placed just past the song's longest lyrics line instead of at a
   * fixed fraction of the page. The Node CLI supplies this via pdfkit.
   */
  measureText?: (text: string, fontSize: number, bold: boolean) => number;
  /**
   * The natural height of one line at a given size, before the style's
   * `lineHeight` multiplier. Needed to work out how much of a column a verse
   * will take. Falls back to a Roboto-shaped constant when absent.
   */
  measureLineHeight?: (fontSize: number) => number;
  /** Vertical gap (pt) between blocks (verses / choruses). */
  blockGap: number;
  /** Indentation (pt) of a chorus block. */
  chorusIndent: number;
  /** Start every song on a fresh page. */
  songPerPage: boolean;
  title: string;
  subtitle?: string;
}

const BASE = {
  pageSize: 'A4' as PageSize,
  layout: 'single' as PageLayout,
  columnCount: 2,
  chordLayout: 'right' as ChordLayout,
  splitChords: true,
  chordNotation: 'pl' as ChordNotation,
  lyricsColumnRatio: 0.5,
  boldLyrics: false,
  capitalizeBlocks: true,
  songPerPage: true,
  title: 'Śpiewnik Złotego',
};

function pageDefaults(pageSize: PageSize) {
  // A5 is half the width of A4, so the same point size reads much bigger there.
  // Font sizes below are chosen so both formats feel comparable in the hand.
  return pageSize === 'A5'
    ? {
        lyricsFontSize: 12,
        chordFontSize: 10.5,
        titleFontSize: 16,
        lineHeight: 1.18,
        margins: [30, 26, 30, 30] as [number, number, number, number],
        chordColumnGap: 14,
        textColumnGap: 16,
        blockGap: 7,
        chorusIndent: 10,
      }
    : {
        lyricsFontSize: 11,
        chordFontSize: 9.5,
        titleFontSize: 18,
        lineHeight: 1.25,
        margins: [45, 40, 45, 42] as [number, number, number, number],
        chordColumnGap: 18,
        textColumnGap: 22,
        blockGap: 9,
        chorusIndent: 14,
      };
}

export function resolvePdfOptions(overrides: Partial<PdfOptions> = {}): PdfOptions {
  const pageSize: PageSize = overrides.pageSize ?? BASE.pageSize;
  // A chord column beside the words has no room in a narrow text column, so the
  // two-column layout puts the chords above the line unless told otherwise.
  const layout = overrides.layout ?? BASE.layout;
  const chordLayout = overrides.chordLayout ?? (layout === 'columns' ? 'above' : BASE.chordLayout);
  const defined = Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)) as Partial<PdfOptions>;

  return {
    ...BASE,
    ...pageDefaults(pageSize),
    ...defined,
    pageSize,
    layout,
    chordLayout,
  };
}

/** Page dimensions in points - pdfmake's own values. */
export const PAGE_POINTS: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 419.53, height: 595.28 },
};

/** Usable width between the left and right margins. */
export function contentWidth(options: PdfOptions): number {
  return PAGE_POINTS[options.pageSize].width - options.margins[0] - options.margins[2];
}

/** Usable height between the top and bottom margins. */
export function contentHeight(options: PdfOptions): number {
  return PAGE_POINTS[options.pageSize].height - options.margins[1] - options.margins[3];
}

/**
 * Width of one text column. With `layout: 'single'` that is the whole content
 * width; with `columns` it is a share of it, minus the gaps.
 */
export function textColumnWidth(options: PdfOptions): number {
  if (options.layout !== 'columns') {
    return contentWidth(options);
  }
  const count = Math.max(1, options.columnCount);
  const gaps = options.textColumnGap * (count - 1);
  return (contentWidth(options) - gaps) / count;
}

/**
 * Roboto's line box is about 1.17 times the font size. Used only when no
 * measurer is available - the CLI measures the real font instead.
 */
export const FALLBACK_LINE_RATIO = 1.172;

export function lineHeightOf(options: PdfOptions, fontSize: number, lineHeight: number): number {
  const natural = options.measureLineHeight ? options.measureLineHeight(fontSize) : fontSize * FALLBACK_LINE_RATIO;
  return natural * lineHeight;
}
