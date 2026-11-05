import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { ChordNotation, Song, parseSong, sortSongsByTitle } from '../../songbook';

/**
 * A browser cannot list a directory, so the app reads a generated index of the
 * `songs/` folder. `npm run songs:index` writes it, and prestart / prebuild run
 * that automatically - nobody maintains it by hand. The CLI does not use it at
 * all; it walks the directory itself.
 */
const SONGS_INDEX = 'assets/songs-index.json';
const SONGS_PATH = 'songs';

interface SongsIndex {
  songs: string[];
}

@Injectable({ providedIn: 'root' })
export class SongService {
  private readonly httpClient = inject(HttpClient);

  /** Every song in `songs/`, alphabetically by title. */
  loadSongs(defaultNotation: ChordNotation = 'pl'): Observable<Song[]> {
    return this.httpClient.get<SongsIndex>(SONGS_INDEX).pipe(
      map(index => index?.songs ?? []),
      switchMap(fileNames =>
        fileNames.length === 0
          ? of([] as { name: string; content: string }[])
          : forkJoin(
              fileNames.map(name =>
                this.httpClient.get(`${SONGS_PATH}/${name}`, { responseType: 'text' }).pipe(map(content => ({ name, content })))
              )
            )
      ),
      map(files => sortSongsByTitle(files.map(file => parseSong(file.content, file.name, { defaultNotation })).filter(song => song.valid)))
    );
  }
}
