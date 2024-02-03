import { ISong, ISongMeta, ISongVerse } from "../interfaces/song.interfaces";

 export abstract class Song implements ISong {
   meta: Partial<ISongMeta> = {};
   verses: ISongVerse[] = []
   valid: boolean = false;
}
