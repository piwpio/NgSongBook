import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { forkJoin, map, switchMap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SongService {
  constructor(private readonly httpClient: HttpClient) {}

  getSongs() {
    return this.httpClient
      .get('/assets/_songs_.txt', { responseType: 'text' })
      .pipe(
        map(text =>
          text.split('\n').map(songName => this.httpClient.get(`/assets/${songName}`, { responseType: 'text' }))
        ),
        switchMap(songCalls => forkJoin(songCalls))
      )
      .subscribe(songs => {
        console.log(songs);
      });
  }
}
