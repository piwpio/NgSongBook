import { Content } from 'pdfmake/interfaces';
import { PAGE_POINTS, PdfOptions } from './pdf-options';

export const DEFAULT_DEDICATION = 'Dla Irminy i Astrid, moich najwierniejszych fanek na dobre i złe';

export interface CoverOptions {
  /** Shown under the title, e.g. a generation date. */
  subtitle?: string;
  /** Dedication pinned to the bottom right. `null` removes it. */
  dedication?: string | null;
}

/**
 * The title page. Both documents use it: the full songbook opens with it, and
 * the print set repeats it every time, so a cover worn out in the binder can
 * simply be swapped for the fresh one.
 */
export function buildCover(options: PdfOptions, raw: CoverOptions = {}): Content[] {
  const page = PAGE_POINTS[options.pageSize];
  const [left, , right, bottom] = options.margins;
  const titleSize = options.titleFontSize + 14;

  // Pinned to the middle of the sheet rather than pushed down by a margin, so
  // the title sits optically centred whatever the page size.
  const titleBlock: Content = {
    absolutePosition: { x: left, y: page.height / 2 - titleSize * 0.72 },
    columns: [
      {
        width: page.width - left - right,
        stack: [
          { text: options.title, style: 'coverTitle' },
          ...(raw.subtitle ? [{ text: raw.subtitle, style: 'coverSubtitle', margin: [0, 12, 0, 0] }] : []),
        ],
      },
    ],
  } as unknown as Content;

  // A page needs something in the normal flow or pdfmake drops it entirely.
  const content: Content[] = [{ text: '', margin: [0, 0, 0, 0] }, titleBlock];

  const dedication = raw.dedication === undefined ? DEFAULT_DEDICATION : raw.dedication;
  if (dedication) {
    const textWidth = (page.width - left - right) * 0.75;

    content.push({
      // Pinned to the bottom right of the cover, the way a footnote sits.
      absolutePosition: { x: page.width - right - textWidth, y: page.height - bottom - 34 },
      columns: [{ text: dedication, style: 'coverDedication', width: textWidth }],
    });
  }

  return content;
}
