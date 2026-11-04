import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ChordLayout, PageSize, PrintHistory, PrintStatus, Song, emptyHistory, selectForPrint, statusOf } from '../songbook';
import { PdfService } from './services/pdf.service';
import { PrintHistoryService } from './services/print-history.service';
import { SongService } from './services/song.service';

interface SongRow {
  song: Song;
  status: PrintStatus;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  songs: Song[] = [];
  rows: SongRow[] = [];
  history: PrintHistory = emptyHistory();
  loading = true;
  error = '';

  pageSize: PageSize = 'A4';
  chordLayout: ChordLayout = 'above';
  boldLyrics = false;
  splitChords = true;
  includeChanged = false;
  bookTitle = 'Śpiewnik Złotego';

  readonly statusLabel: Record<PrintStatus, string> = {
    new: 'new',
    changed: 'changed',
    printed: 'printed',
  };

  constructor(
    private readonly songService: SongService,
    private readonly printHistory: PrintHistoryService,
    private readonly pdf: PdfService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.printHistory.loadBaseline().subscribe(history => {
      this.history = history;
      this.refreshRows();
    });

    this.songService.loadSongs().subscribe({
      next: songs => {
        this.songs = songs;
        this.loading = false;
        this.refreshRows();
      },
      error: (err: unknown) => {
        this.error = err instanceof Error ? err.message : 'Could not load the songs.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  get pending(): Song[] {
    return selectForPrint(this.songs, this.history, { includeChanged: this.includeChanged }).toPrint;
  }

  async generateSongbook(): Promise<void> {
    await this.pdf.openSongbook(this.songs, { ...this.pdfOptions(), title: this.bookTitle });
  }

  async generatePrintSet(): Promise<void> {
    const toPrint = this.pending;
    if (toPrint.length === 0) {
      return;
    }
    // History is only updated once the PDF really exists.
    await this.pdf.openPrintSet(toPrint, this.pdfOptions());
    this.history = this.printHistory.markPrinted(toPrint);
    this.refreshRows();
  }

  downloadHistory(): void {
    this.printHistory.download();
  }

  resetLocalHistory(): void {
    this.printHistory.resetLocal();
    this.history = this.printHistory.current();
    this.refreshRows();
  }

  trackBySong(_index: number, row: SongRow): string {
    return row.song.id;
  }

  private pdfOptions() {
    return {
      pageSize: this.pageSize,
      chordLayout: this.chordLayout,
      boldLyrics: this.boldLyrics,
      splitChords: this.splitChords,
    };
  }

  private refreshRows(): void {
    this.rows = this.songs.map(song => ({ song, status: statusOf(song, this.history) }));
    this.cdr.markForCheck();
  }
}
