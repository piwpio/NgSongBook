import { cloneDeep } from "lodash";
import { DEFAULT_SONG, MetaRegExp } from "../constants/song.constants";
import { ISongMeta, ISongVerse } from "../interfaces/song.interfaces";
import { Song } from "./song.class";

export class SongFactory {
  createSong(rawSong: string): Song {
    const { title, author, extra } = this.prepareMeta(rawSong);
    // console.log({ title, author, extra });
    const song = new Song()
      .setTitle(title)
      .setAuthor(author)
      .setExtra(extra);

    for (const verse of this.prepareVerse(rawSong)) {
      song.setVerse(verse);
    }

    return song;
  }

  private prepareMeta(rawSong: string): ISongMeta {
    const splitMetaVerse = rawSong.split('\n\n') as [meta?: string, verse?: string];
    const rawMeta = splitMetaVerse[0];
    const rawVerses = splitMetaVerse[1];
    const meta = cloneDeep(DEFAULT_SONG);

    if (rawMeta && rawVerses) {
      for (const [metaKey, regexp] of Object.entries(MetaRegExp)) {
        const regexpResults = regexp.exec(rawMeta)?.[1]
        if (regexpResults) {
          // @ts-ignore
          meta[metaKey] = regexpResults;
        }
      }
    }


    return meta;
  }

  private *prepareVerse(rawSong: string): Generator<ISongVerse> {
    const splitMetaVerse = rawSong.split('\n\n') as [meta?: string, verse?: string];
    const rawMeta = splitMetaVerse[0];
    let rawVerses = splitMetaVerse[1];

    if (!rawVerses) {
      rawVerses = rawMeta;
    }

    let lastChords = '';

    if (rawVerses) {
      const splitVerses = rawVerses.split('\n');
      for (const verse of splitVerses) {
        if (!verse) {
          continue;
        }

        const splitVerse = verse.split('|') as [lyrics: string, chords?: string];
        if (splitVerse?.[0]) {
          const lyrics = verse[0];
          const chords = verse[1];
          if (chords) {
            lastChords = verse[1];
          }
          yield {
            lyrics,
            chords: lastChords
          };
        }
      }
    }
  }
}
