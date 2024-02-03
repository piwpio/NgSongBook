import { ISong, ISongMeta, ISongVerse } from "../interfaces/song.interfaces";

export class InvalidSong implements ISong {
  meta: Partial<ISongMeta> = {};
  verses: ISongVerse[] = []
  valid: boolean = false;
}
