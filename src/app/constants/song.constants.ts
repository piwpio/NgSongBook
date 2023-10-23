export const DEFAULT_SONG_NAME = 'No name';
export const DEFAULT_SONG_AUTHOR = 'Unknown Author';
export const DEFAULT_SONG_EXTRA = '';

export const DEFAULT_SONG = {
  title: DEFAULT_SONG_NAME,
  author: DEFAULT_SONG_AUTHOR,
  extra: DEFAULT_SONG_EXTRA
};

export const MetaRegExp = {
  title: /\{title}(.+)/,
  author: /\{author}(.+)/,
  extra: /\{extra}(.+)/,
} as const
