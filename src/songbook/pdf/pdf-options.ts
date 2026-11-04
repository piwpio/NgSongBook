import { ChordNotation } from '../parser/chord-tokenizer';

export type PageSize = 'A4' | 'A5';

/**
 * `above` - chord line printed directly above its lyrics line.
 * `right` - chords in a right hand column next to the lyrics (saves vertical space).
 * `none`  - lyrics only.
 */
export type ChordLayout = 'above' | 'right' | 'none';

export interface PdfOptions {
  pageSize: PageSize;
  chordLayout: ChordLayout;
  /** Split `AaDeD` into `A  a  D  e  D` instead of printing it verbatim. */
  splitChords: boolean;
  chordNotation: ChordNotation;
  lyricsFontSize: number;
  chordFontSize: number;
  titleFontSize: number;
  /** Print lyrics in bold - handy on A5 / when photocopying. */
  boldLyrics: boolean;
  lineHeight: number;
  /** [left, top, right, bottom] */
  margins: [number, number, number, number];
  /** Width (pt) of the chord column when `chordLayout` is `right`. */
  chordColumnWidth: number;
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
  chordLayout: 'above' as ChordLayout,
  splitChords: true,
  chordNotation: 'pl' as ChordNotation,
  boldLyrics: false,
  songPerPage: true,
  title: 'Śpiewnik',
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
        chordColumnWidth: 95,
        blockGap: 7,
        chorusIndent: 10,
      }
    : {
        lyricsFontSize: 11,
        chordFontSize: 9.5,
        titleFontSize: 18,
        lineHeight: 1.25,
        margins: [45, 40, 45, 42] as [number, number, number, number],
        chordColumnWidth: 130,
        blockGap: 9,
        chorusIndent: 14,
      };
}

export function resolvePdfOptions(overrides: Partial<PdfOptions> = {}): PdfOptions {
  const pageSize: PageSize = overrides.pageSize ?? BASE.pageSize;
  const defined = Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)) as Partial<PdfOptions>;

  return {
    ...BASE,
    ...pageDefaults(pageSize),
    ...defined,
    pageSize,
  };
}
