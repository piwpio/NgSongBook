export interface ISong {
  meta: Partial<ISongMeta>;
  verses: ISongVerse[];
  valid: boolean;
}

export interface ISongMeta {
  title: string;
  author?: string;
  extra?: string;
}

export interface ISongVerse {
  lyrics: string;
  chords: string;
}
