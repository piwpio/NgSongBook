import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { PrintHistory, emptyHistory, parseHistory } from '../../songbook';

const HISTORY_URL = 'data/print-history.json';

/**
 * Reads the committed print history so the song list can show what has already
 * been printed.
 *
 * READ ONLY, deliberately. The history is written by the CLI into
 * `data/print-history.json`, which is committed - that is what makes it the
 * same on every machine. The app used to keep its own copy in localStorage,
 * which lived in one browser and quietly drifted from the file in the repo.
 */
@Injectable({ providedIn: 'root' })
export class PrintHistoryService {
  private readonly httpClient = inject(HttpClient);

  load(): Observable<PrintHistory> {
    return this.httpClient.get(HISTORY_URL, { responseType: 'text' }).pipe(
      map(text => parseHistory(text)),
      catchError(() => of(emptyHistory()))
    );
  }
}
