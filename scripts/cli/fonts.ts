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
      throw new Error(`Nie znaleziono fontu ${name} w pdfmake/build/vfs_fonts.js`);
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
