import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { forkJoin, map, switchMap } from 'rxjs';
import { Song } from "../classes/song.class";
import { SongFactory } from "../classes/song.factory";

@Injectable({
  providedIn: 'root',
})
export class SongService {
  constructor(private readonly httpClient: HttpClient) {}
  songs: Song[] = [];

  getSongs() {
    const songFactory = new SongFactory();
    return this.httpClient
      .get('/assets/_songs_.txt', { responseType: 'text' })
      .pipe(
        map(text => text.split('\n').map(songName => this.httpClient.get(`/assets/${songName}`, { responseType: 'text' }))),
        switchMap(songCalls => forkJoin(songCalls)),
        map(songs => songs.map(rawSong => songFactory.createSong(rawSong)))
      )
      .subscribe(songs => {
        console.log(songs);
        this.songs = songs;
      });
  }
}
