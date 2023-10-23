export interface ISong {
  meta: ISongMeta;
  verses: ISongVerse[];
}

export interface ISongMeta {
  title?: string;
  author?: string;
  extra?: string;
}

export interface ISongVerse {
  lyrics: string;
  chords: string;
}
