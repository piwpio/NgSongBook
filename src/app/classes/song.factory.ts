import { DEFAULT_SONG } from "../constants/song.constants";
import { ISongVerse } from "../interfaces/song.interfaces";
import { Song } from "./song.class";

export type SplitMetaVerse = [meta?: string, verse?: string];
export type SplitMeta = [title?: string, author?: string, extra?: string];
export type SplitVerses = [verse?: string];
export type SplitVerse = [lyrics?: string, chords?: string];

export class SongFactory {
  createSong(rawSong: string): Song {
    const [ title, author, extra ] = this.prepareMeta(rawSong);
    const song = new Song()
      .setTitle(title)
      .setAuthor(author)
      .setExtra(extra);

    for (const verse of this.prepareVerse(rawSong)) {
      song.setVerse(verse);
    }

    return song;
  }

  private prepareMeta(rawSong: string): SplitMeta {
    const results: SplitMeta = Array.from(DEFAULT_SONG) as SplitMeta;

    const splitMetaVerse = rawSong.split('\n\n') as SplitMetaVerse;
    if (splitMetaVerse?.[1]) {
      const splitMeta = splitMetaVerse[1].split('\n') as SplitMeta;
      for (let i = 0; i < splitMeta.length; i++) {
        if (splitMeta[i] !== undefined) {
          results[i] = splitMeta[i];
        } else {
          break;
        }
      }
    }

    return results
  }

  private *prepareVerse(rawSong: string): Generator<ISongVerse> {
    const splitMetaVerse = rawSong.split('\n\n') as SplitMetaVerse;
    let lastChords: SplitVerse[1] = '';

    if (splitMetaVerse?.[1]) {
      const splitVerses = splitMetaVerse[1].split('\n') as SplitVerses;
      for (const verse of splitVerses) {
        if (!verse) {
          continue;
        }
        const splitVerse = verse.split('|');
        if (splitVerse?.[0]) {
          if (verse[1]) {
            lastChords = verse[1];
          }
          yield {
            lyrics: splitVerse[0],
            chords: lastChords
          };
        }
      }
    }
  }
}
