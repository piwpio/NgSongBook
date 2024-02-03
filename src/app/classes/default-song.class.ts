import { SongConfig } from "../configs/song.config";
import { ISongMeta, ISongVerse } from "../interfaces/song.interfaces";
import { Song } from "./song.class";

const DEFAULT_SONG_META_VERSES_SPLITTER = '\n\n\n';
const DEFAULT_SONG_LINE_SPLITTER = '\n';

export class DefaultSong extends Song {
  constructor(rawSong: string) {
    super();

    const {rawMeta, rawVerses} = this.prepareRawSong(rawSong);
    if (!rawMeta || !rawVerses ) {
      return;
    }

    this.valid = true;
    const { title, author, extra } = this.prepareMeta(rawMeta);

    this.setTitle(title);
    author && this.setAuthor(author);
    extra && this.setExtra(extra);

    for (const verse of this.prepareVersesAndRefrain(rawVerses)) {
      this.setVerse(verse);
    }
  }

  validate(rawSong: string): boolean {
    const {rawMeta, rawVerses} = this.prepareRawSong(rawSong)

    if (!rawMeta || !rawVerses) {
      return false;
    }

    if (!SongConfig.regexp.meta.title.exec(rawMeta)?.[1]) {
      return false
    }

    this.valid = true;
    return true
  }

  setTitle(title: string): void {
    this.meta.title = title
  }

  setAuthor(author: string): void {
    this.meta.author = author;
  }

  setExtra(extra: string): void {
    this.meta.extra = extra;
  }

  setVerse(verse: ISongVerse ): void {
    this.verses.push(verse);
  }

  private prepareRawSong(rawSong: string): {rawMeta: string, rawVerses: string} {
    const [rawMeta, rawVerses] = rawSong.trim().split(DEFAULT_SONG_META_VERSES_SPLITTER);
    return { rawMeta, rawVerses };
  }

  private prepareMeta(rawMeta: string): Partial<ISongMeta> & Pick<ISongMeta, 'title'> {
    const meta = {title: SongConfig.defaultValues.title};
    for (const [metaKey, regexp] of Object.entries(SongConfig.regexp.meta)) {
      const regexpResults = regexp.exec(rawMeta)?.[1]
      if (regexpResults) {
        // @ts-ignore
        meta[metaKey] = regexpResults;
      }
    }
    return meta;
  }

  private *prepareVersesAndRefrain(rawVerses: string): Generator<ISongVerse> {
    const verseLines = rawVerses.split(DEFAULT_SONG_LINE_SPLITTER);
    let lastChords = '';

    for (const verse of verseLines) {
      if (!verse) {
        continue;
      }

      const splitVerse = verse.split('|') as [lyrics: string, chords?: string];
      if (splitVerse?.[0]) {
        const lyrics = splitVerse[0];
        const chords = splitVerse?.[1];
        if (chords) {
          lastChords = chords;
        }
        yield {
          lyrics,
          chords: lastChords
        };
      }
    }
  }
}
