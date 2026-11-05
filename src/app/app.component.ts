import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import {
  ChordLayout,
  ChordNotation,
  PageSize,
  PrintHistory,
  PrintStatus,
  Song,
  SongLine,
  emptyHistory,
  formatChords,
  statusOf,
} from '../songbook';
import { PdfService } from './services/pdf.service';
import { PrintHistoryService } from './services/print-history.service';
import { SongService } from './services/song.service';
import { FormsModule } from '@angular/forms';

interface SongRow {
  song: Song;
  status: PrintStatus;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class AppComponent implements OnInit {
  private readonly songService = inject(SongService);
  private readonly printHistory = inject(PrintHistoryService);
  private readonly pdf = inject(PdfService);
  private readonly cdr = inject(ChangeDetectorRef);

  songs: Song[] = [];
  rows: SongRow[] = [];
  history: PrintHistory = emptyHistory();
  loading = true;
  error = '';

  pageSize: PageSize = 'A4';
  chordLayout: ChordLayout = 'right';
  boldLyrics = false;
  splitChords = true;
  bookTitle = 'Śpiewnik Złotego';
  chordNotation: ChordNotation = 'pl';

  readonly statusLabel: Record<PrintStatus, string> = {
    new: 'new',
    changed: 'changed',
    printed: 'printed',
  };

  ngOnInit(): void {
    this.printHistory.load().subscribe(history => {
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

  async generateSongbook(): Promise<void> {
    await this.pdf.openSongbook(this.songs, { ...this.pdfOptions(), title: this.bookTitle });
  }

  /** The chord line as it will be printed, translated to the chosen notation. */
  chordsOf(line: SongLine): string {
    if (!line.rawChords) {
      return '';
    }
    return this.splitChords ? formatChords(line.chords, this.chordNotation) : formatChords(line.chords, this.chordNotation, ' ');
  }

  trackBySong(_index: number, row: SongRow): string {
    return row.song.id;
  }

  private pdfOptions() {
    return {
      pageSize: this.pageSize,
      chordLayout: this.chordLayout,
      chordNotation: this.chordNotation,
      boldLyrics: this.boldLyrics,
      splitChords: this.splitChords,
    };
  }

  private refreshRows(): void {
    this.rows = this.songs.map(song => ({ song, status: statusOf(song, this.history) }));
    this.cdr.markForCheck();
  }
}
