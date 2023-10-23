import { ISong, ISongMeta, ISongVerse } from "../interfaces/song.interfaces";

export class Song implements ISong {
  meta: ISongMeta = {};
  verses: ISongVerse[] = []

  setTitle(title: string | undefined): Song {
    this.meta.title = title
    return this;
  }

  setAuthor(author: string | undefined): Song {
    this.meta.author = author;
    return this;
  }

  setExtra(extra: string | undefined): Song {
    this.meta.extra = extra;
    return this;
  }

  setVerse(verse: ISongVerse ): Song {
    this.verses.push(verse);
    return this;
  }
}
