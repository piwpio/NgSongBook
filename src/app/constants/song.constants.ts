import { SplitMeta } from "../classes/song.factory";

export const DEFAULT_SONG_NAME = 'No name' as const;
export const DEFAULT_SONG_AUTHOR = 'Unknown Author' as const;
export const DEFAULT_SONG_EXTRA = '' as const;

export const DEFAULT_SONG: SplitMeta = [DEFAULT_SONG_NAME, DEFAULT_SONG_AUTHOR, DEFAULT_SONG_EXTRA];
