import { Injectable } from '@angular/core';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { PdfOptions, Song, SongbookDocOptions, buildPrintDoc, buildSongbookDoc } from '../../songbook';

type PdfMake = typeof import('pdfmake/build/pdfmake');

@Injectable({ providedIn: 'root' })
export class PdfService {
  /**
   * pdfmake + the embedded Roboto fonts weigh ~2 MB, so they are loaded on
   * demand: the app itself stays small, the fonts arrive with the first PDF.
   */
  private pdfMakePromise?: Promise<PdfMake>;

  /** Full songbook: cover, clickable table of contents, live page numbers. */
  async openSongbook(songs: Song[], options: SongbookDocOptions = {}, fileName?: string): Promise<void> {
    await this.download(buildSongbookDoc(songs, options), fileName ?? this.name('spiewnik'));
  }

  /** Loose sheets for the binder: no table of contents, no page numbers. */
  async openPrintSet(songs: Song[], options: Partial<PdfOptions> = {}, fileName?: string): Promise<void> {
    await this.download(buildPrintDoc(songs, options), fileName ?? this.name('do-druku'));
  }

  private async download(doc: TDocumentDefinitions, fileName: string): Promise<void> {
    const pdfMake = await this.loadPdfMake();
    pdfMake.createPdf(doc).download(fileName);
  }

  private loadPdfMake(): Promise<PdfMake> {
    this.pdfMakePromise ??= Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]).then(
      ([pdfMakeModule, fontsModule]) => {
        const pdfMake = (pdfMakeModule as unknown as { default?: PdfMake }).default ?? pdfMakeModule;
        const fonts = fontsModule as unknown as Record<string, unknown>;
        const container = (fonts['pdfMake'] ?? fonts['default'] ?? fonts) as Record<string, unknown>;
        (pdfMake as unknown as Record<string, unknown>)['vfs'] = container['vfs'] ?? container;
        return pdfMake;
      }
    );
    return this.pdfMakePromise;
  }

  private name(prefix: string): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${prefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.pdf`;
  }
}
