import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { ChordNotation, Song, parseSong } from '../../songbook';

const SONG_LIST = 'assets/__songs__.txt';

@Injectable({ providedIn: 'root' })
export class SongService {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * Loads every song listed in `assets/__songs__.txt`.
   * Returns an observable - the caller decides when to subscribe.
   */
  loadSongs(chordNotation: ChordNotation = 'pl'): Observable<Song[]> {
    return this.httpClient.get(SONG_LIST, { responseType: 'text' }).pipe(
      map(text =>
        text
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.endsWith('.txt') && !line.startsWith('__'))
      ),
      switchMap(fileNames =>
        fileNames.length === 0
          ? of([] as { name: string; content: string }[])
          : forkJoin(
              fileNames.map(name =>
                this.httpClient.get(`assets/${name}`, { responseType: 'text' }).pipe(map(content => ({ name, content })))
              )
            )
      ),
      map(files => files.map(file => parseSong(file.content, file.name, { chordNotation })).filter(song => song.valid))
    );
  }
}
