import { DEFAULT_SONG } from "../constants/song.constants";
import { ISong, ISongMeta, ISongVerse } from "../interfaces/song.interfaces";

export class Song implements ISong {
  meta: ISongMeta = DEFAULT_SONG;
  verses: ISongVerse[] = []

  setTitle(title: string): Song {
    this.meta.title = title
    return this;
  }

  setAuthor(author: string): Song {
    this.meta.author = author;
    return this;
  }

  setExtra(extra: string): Song {
    this.meta.extra = extra;
    return this;
  }

  setVerse(verse: ISongVerse ): Song {
    this.verses.push(verse);
    return this;
  }
}
