import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { PrintHistory, Song, emptyHistory, markPrinted, parseHistory, serialiseHistory } from '../../songbook';

const BASELINE_URL = 'assets/print-history.json';
const STORAGE_KEY = 'ngsongbook.print-history';

/**
 * In the browser the repo file cannot be written, so the history is layered:
 *
 *   assets/print-history.json  (committed baseline, written by `npm run pdf:print`)
 *            +  localStorage   (what was generated from this browser since then)
 *
 * `download()` exports the merged result so it can replace the committed file.
 */
@Injectable({ providedIn: 'root' })
export class PrintHistoryService {
  private readonly httpClient = inject(HttpClient);

  private baseline: PrintHistory = emptyHistory();

  loadBaseline(): Observable<PrintHistory> {
    return this.httpClient.get(BASELINE_URL, { responseType: 'text' }).pipe(
      map(text => parseHistory(text)),
      catchError(() => of(emptyHistory())),
      map(history => {
        this.baseline = history;
        return this.current();
      })
    );
  }

  current(): PrintHistory {
    const local = parseHistory(this.readStorage());
    return { version: 1, entries: { ...this.baseline.entries, ...local.entries } };
  }

  markPrinted(songs: Song[]): PrintHistory {
    const updated = markPrinted(this.current(), songs);
    this.writeStorage(serialiseHistory(updated));
    return updated;
  }

  /** Forgets everything recorded in this browser (the committed baseline stays). */
  resetLocal(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable - nothing to clear */
    }
  }

  /** Downloads the merged history so it can be committed as assets/print-history.json. */
  download(): void {
    const blob = new Blob([serialiseHistory(this.current())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'print-history.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private readStorage(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private writeStorage(value: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* storage unavailable - the PDF was still generated */
    }
  }
}
