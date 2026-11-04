import { Song } from '../model/song.model';

export interface PrintHistoryEntry {
  /** Source file name, e.g. 'test1.txt'. */
  file: string;
  title: string;
  /** Hash of the file content at the time it was printed - detects later edits. */
  hash: string;
  firstPrintedAt: string;
  lastPrintedAt: string;
  printCount: number;
  /** Which batch the song last went out in - the N in printN.pdf. */
  batch: number;
}

/**
 * Schema version of the history file. Additive changes do not need it - a
 * missing field is simply defaulted - but a breaking one would, and an older
 * build must refuse a file it cannot read rather than mistake it for an empty
 * one and overwrite it.
 */
export const HISTORY_VERSION = 1;

export interface PrintHistory {
  version: number;
  /**
   * How many batches have been printed. The counter lives here, in the
   * committed history, rather than being guessed from the files in output/ -
   * that folder is derived and may be deleted at any time.
   */
  batches: number;
  entries: Record<string, PrintHistoryEntry>;
}

export type PrintStatus = 'new' | 'changed' | 'printed';

export interface PrintSelection {
  toPrint: Song[];
  statuses: { song: Song; status: PrintStatus }[];
}

export function emptyHistory(): PrintHistory {
  return { version: HISTORY_VERSION, batches: 0, entries: {} };
}

/** The number the next batch will carry, printed or not. */
export function nextBatchNumber(history: PrintHistory): number {
  return (history.batches ?? 0) + 1;
}

/**
 * FNV-1a, 32 bit, hex. Deliberately dependency-free so the exact same hash is
 * produced in Node and in the browser. Only used for change detection.
 */
export function hashContent(content: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function songKey(song: Song): string {
  return song.sourceFile || song.id;
}

export function statusOf(song: Song, history: PrintHistory): PrintStatus {
  const entry = history.entries[songKey(song)];
  if (!entry) {
    return 'new';
  }
  return entry.hash === hashContent(song.raw) ? 'printed' : 'changed';
}

/**
 * Picks the songs that still need printing: never printed, and - when
 * `includeChanged` is set - the ones whose text changed since the last print.
 */
export function selectForPrint(
  songs: Song[],
  history: PrintHistory,
  options: { includeChanged?: boolean; all?: boolean; only?: string[] } = {}
): PrintSelection {
  const statuses = songs.map(song => ({ song, status: statusOf(song, history) }));
  const only = options.only?.length ? new Set(options.only) : null;

  const toPrint = statuses
    .filter(({ song, status }) => {
      if (only && !only.has(songKey(song))) {
        return false;
      }
      if (options.all) {
        return true;
      }
      if (status === 'new') {
        return true;
      }
      return status === 'changed' && !!options.includeChanged;
    })
    .map(({ song }) => song);

  return { toPrint, statuses };
}

/** Returns a NEW history with the given songs recorded as printed. */
export function markPrinted(history: PrintHistory, songs: Song[], now: Date = new Date()): PrintHistory {
  const timestamp = now.toISOString();
  const batch = nextBatchNumber(history);
  const entries: Record<string, PrintHistoryEntry> = { ...history.entries };

  for (const song of songs) {
    const key = songKey(song);
    const previous = entries[key];
    entries[key] = {
      file: key,
      title: song.meta.title,
      hash: hashContent(song.raw),
      firstPrintedAt: previous?.firstPrintedAt ?? timestamp,
      lastPrintedAt: timestamp,
      printCount: (previous?.printCount ?? 0) + 1,
      batch,
    };
  }

  return { version: HISTORY_VERSION, batches: batch, entries };
}

/** Drops entries for songs that no longer exist. */
export function pruneHistory(history: PrintHistory, songs: Song[]): PrintHistory {
  const known = new Set(songs.map(songKey));
  const entries: Record<string, PrintHistoryEntry> = {};
  for (const [key, entry] of Object.entries(history.entries)) {
    if (known.has(key)) {
      entries[key] = entry;
    }
  }
  return { version: HISTORY_VERSION, batches: history.batches ?? 0, entries };
}

/**
 * Reads the history file.
 *
 * An absent or empty file means "nothing printed yet" - that is a normal start.
 * A file that is present but unreadable THROWS, and deliberately so: treating
 * it as empty would make every song look unprinted, and the next batch would
 * overwrite the only record of what is already in the binder.
 */
export function parseHistory(json: string | null | undefined): PrintHistory {
  if (!json || json.trim() === '') {
    return emptyHistory();
  }

  let parsed: Partial<PrintHistory>;
  try {
    parsed = JSON.parse(json) as Partial<PrintHistory>;
  } catch {
    throw new Error('The print history is not valid JSON - refusing to treat it as empty.');
  }

  if (!parsed || typeof parsed !== 'object' || typeof parsed.entries !== 'object' || parsed.entries === null) {
    throw new Error('The print history has no entries - refusing to treat it as empty.');
  }

  const version = parsed.version ?? HISTORY_VERSION;
  if (version > HISTORY_VERSION) {
    throw new Error(
      `The print history is version ${version}, this build understands ${HISTORY_VERSION}. Update the songbook before printing.`
    );
  }

  return { version: HISTORY_VERSION, batches: parsed.batches ?? 0, entries: parsed.entries };
}

export function serialiseHistory(history: PrintHistory): string {
  const sortedKeys = Object.keys(history.entries).sort();
  const entries: Record<string, PrintHistoryEntry> = {};
  for (const key of sortedKeys) {
    entries[key] = history.entries[key];
  }
  return `${JSON.stringify({ version: HISTORY_VERSION, batches: history.batches ?? 0, entries }, null, 2)}\n`;
}
