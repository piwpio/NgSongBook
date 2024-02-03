import { DefaultSong } from "./default-song.class";
import { Song } from "./song.class";

export class SongFactory {
  createSong(rawSong: string): Song {
    return new DefaultSong(rawSong);
  }
}
