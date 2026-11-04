import { TFontDictionary } from 'pdfmake/interfaces';

/**
 * pdfmake ships Roboto as base64 inside `build/vfs_fonts.js` for the browser.
 * Node's PdfPrinter accepts Buffers, so we decode those instead of requiring
 * separate .ttf files in the repo. Roboto covers Polish diacritics; the PDF
 * standard-14 fonts do not (WinAnsi has no ą/ę/ł/ś/ż/ź/ć/ń).
 */
export function robotoFonts(): TFontDictionary {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const vfsModule = require('pdfmake/build/vfs_fonts.js') as Record<string, unknown>;
  /* eslint-enable @typescript-eslint/no-var-requires */

  const container = (vfsModule['pdfMake'] ?? vfsModule) as Record<string, unknown>;
  const vfs = (container['vfs'] ?? container) as Record<string, string>;

  const load = (name: string): Buffer => {
    const base64 = vfs[name];
    if (!base64) {
      throw new Error(`Font ${name} not found in pdfmake/build/vfs_fonts.js`);
    }
    return Buffer.from(base64, 'base64');
  };

  return {
    Roboto: {
      normal: load('Roboto-Regular.ttf'),
      bold: load('Roboto-Medium.ttf'),
      italics: load('Roboto-Italic.ttf'),
      bolditalics: load('Roboto-MediumItalic.ttf'),
    },
  };
}

/**
 * Measures a string in Roboto, in points, using the very font that ends up in
 * the PDF. Lets the layout place the chord column just past the longest line
 * instead of guessing a fraction of the page.
 */
export function measureRoboto(): (text: string, fontSize: number, bold: boolean) => number {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const PDFDocument = require('@foliojs-fork/pdfkit') as new (options: object) => {
    registerFont: (name: string, src: Buffer) => void;
    font: (name: string) => { fontSize: (size: number) => { widthOfString: (t: string) => number } };
  };
  /* eslint-enable @typescript-eslint/no-var-requires */

  const fonts = robotoFonts()['Roboto'];
  const doc = new PDFDocument({ autoFirstPage: false });
  doc.registerFont('normal', fonts.normal as Buffer);
  doc.registerFont('bold', fonts.bold as Buffer);

  return (text, fontSize, bold) =>
    doc
      .font(bold ? 'bold' : 'normal')
      .fontSize(fontSize)
      .widthOfString(text);
}
