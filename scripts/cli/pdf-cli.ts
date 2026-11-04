import * as fs from 'fs';
import * as path from 'path';
import PdfPrinter = require('pdfmake');
import { TDocumentDefinitions } from 'pdfmake/interfaces';

import {
  ChordLayout,
  PageSize,
  PdfOptions,
  PrintHistory,
  Song,
  buildPrintDoc,
  buildSongbookDoc,
  emptyHistory,
  markPrinted,
  parseHistory,
  pruneHistory,
  selectForPrint,
  serialiseHistory,
} from '../../src/songbook';
import { ChordNotation } from '../../src/songbook/parser/chord-tokenizer';
import { ParsedArgs, bool, list, num, parseArgs, str } from './args';
import { measureRoboto, robotoFonts } from './fonts';
import { HISTORY_FILE, SONGS_DIR, ensureDir, findProjectRoot, loadSongs, timestampSlug } from './workspace';

const USAGE = `
Songbook - PDF generator

  npm run pdf:book            full songbook: cover + clickable table of contents + page numbers
  npm run pdf:print           ONLY songs not printed yet (no contents, no page numbers)
  npm run pdf:history         what has been printed and what is still waiting

Common options:
  --page-size A4|A5           page format (default A4)
  --chords right|above|none   right hand column (default) / above the lyrics / no chords
  --no-split-chords           print chords exactly as written (AaDeD instead of A  a  D  e  D)
  --notation pl|intl          'pl' (default): b is its own chord; 'intl': b after a root is a flat
  --font-size N               lyrics size (A4: 11, A5: 12)
  --chord-size N              chord size (A4: 9.5, A5: 10.5)
  --title-size N              song title size
  --bold                      bold lyrics (useful on A5)
  --no-capitalize             leave the opening letter of each verse as written
  --line-height N             line height (A4: 1.25, A5: 1.18)
  --title "My songbook"       document / cover title
  --songs a.txt,b.txt         limit to the given files
  --out path.pdf              output file
  --songs-dir dir             songs directory (default songs/, read recursively)
  --history file.json         print history file (default src/assets/print-history.json)

'book' only:
  --no-cover                  no cover page
  --no-toc                    no table of contents
  --no-page-numbers           no page numbers
  --toc-title "..."           heading above the table of contents (default "Spis treści")
  --subtitle "..."            line under the cover title
  --dedication "..."          dedication at the bottom right of the cover
  --no-dedication             no dedication on the cover

'print' only:
  --all                       generate everything, ignoring the history
  --include-changed           also include songs edited since they were last printed
  --dry-run                   list what would be printed, generate nothing, touch nothing
  --no-mark                   generate the PDF but do NOT record it in the history
  --prune                     drop history entries for songs that no longer exist
`;

function pdfOptionsFrom(flags: ParsedArgs['flags']): Partial<PdfOptions> {
  const chords = str(flags, 'chords') as ChordLayout | undefined;
  const pageSize = str(flags, 'page-size')?.toUpperCase() as PageSize | undefined;

  if (pageSize && pageSize !== 'A4' && pageSize !== 'A5') {
    throw new Error(`Unsupported page size: ${pageSize} (allowed: A4, A5)`);
  }
  if (chords && !['above', 'right', 'none'].includes(chords)) {
    throw new Error(`Unsupported chord layout: ${chords} (allowed: above, right, none)`);
  }

  return {
    pageSize,
    chordLayout: chords,
    splitChords: bool(flags, 'split-chords'),
    chordNotation: str(flags, 'notation') as ChordNotation | undefined,
    lyricsFontSize: num(flags, 'font-size'),
    chordFontSize: num(flags, 'chord-size'),
    titleFontSize: num(flags, 'title-size'),
    boldLyrics: bool(flags, 'bold'),
    capitalizeBlocks: bool(flags, 'capitalize'),
    lineHeight: num(flags, 'line-height'),
    title: str(flags, 'title'),
    // Real glyph widths, so the chord column can sit right next to the lyrics.
    measureText: measureRoboto(),
  };
}

function writePdf(doc: TDocumentDefinitions, outPath: string): Promise<void> {
  ensureDir(path.dirname(outPath));
  const printer = new PdfPrinter(robotoFonts());
  const pdf = printer.createPdfKitDocument(doc);

  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(outPath);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    pdf.on('error', reject);
    pdf.pipe(stream);
    pdf.end();
  });
}

function readHistory(historyPath: string): PrintHistory {
  if (!fs.existsSync(historyPath)) {
    return emptyHistory();
  }
  return parseHistory(fs.readFileSync(historyPath, 'utf8'));
}

function reportWarnings(songs: Song[]): void {
  for (const song of songs) {
    for (const warning of song.warnings) {
      console.warn(`  ! ${song.sourceFile}: ${warning}`);
    }
  }
}

async function commandBook(args: ParsedArgs, ctx: Context): Promise<void> {
  const only = list(args.flags, 'songs');
  const songs = ctx.songs.filter(song => !only || only.includes(song.sourceFile));

  if (songs.length === 0) {
    console.error('No songs to generate.');
    process.exitCode = 1;
    return;
  }

  const outPath = str(args.flags, 'out') ?? path.join(ctx.outputDir, `spiewnik-${timestampSlug()}.pdf`);

  const doc = buildSongbookDoc(songs, {
    ...pdfOptionsFrom(args.flags),
    cover: bool(args.flags, 'cover'),
    toc: bool(args.flags, 'toc'),
    pageNumbers: bool(args.flags, 'page-numbers'),
    subtitle: str(args.flags, 'subtitle'),
    tocTitle: str(args.flags, 'toc-title'),
    dedication: bool(args.flags, 'dedication') === false ? null : str(args.flags, 'dedication'),
  });

  await writePdf(doc, outPath);
  reportWarnings(songs);
  console.log(`\n  Songbook (${songs.length} songs) -> ${path.relative(ctx.root, outPath)}`);
  console.log('  Table of contents and page numbers recalculated from scratch.\n');
}

async function commandPrint(args: ParsedArgs, ctx: Context): Promise<void> {
  const history = readHistory(ctx.historyPath);
  const { toPrint, statuses } = selectForPrint(ctx.songs, history, {
    all: bool(args.flags, 'all') === true,
    includeChanged: bool(args.flags, 'include-changed') === true,
    only: list(args.flags, 'songs'),
  });

  if (toPrint.length === 0) {
    console.log('\n  Nothing new to print - every song has been generated before.');
    console.log('  (--include-changed adds edited ones, --all regenerates everything.)\n');
    printStatusTable(statuses);
    return;
  }

  console.log(`\n  To print (${toPrint.length}):`);
  for (const song of toPrint) {
    console.log(`    + ${song.meta.title}  [${song.sourceFile}]`);
  }

  if (bool(args.flags, 'dry-run') === true) {
    console.log('\n  --dry-run: nothing generated, history untouched.\n');
    return;
  }

  const outPath = str(args.flags, 'out') ?? path.join(ctx.outputDir, `do-druku-${timestampSlug()}.pdf`);

  const doc = buildPrintDoc(toPrint, pdfOptionsFrom(args.flags));
  await writePdf(doc, outPath);
  reportWarnings(toPrint);
  console.log(`\n  PDF -> ${path.relative(ctx.root, outPath)}  (no page numbers, no contents)`);

  if (bool(args.flags, 'mark') === false) {
    console.log('  --no-mark: the history was NOT updated.\n');
    return;
  }

  let updated = markPrinted(history, toPrint);
  if (bool(args.flags, 'prune') === true) {
    updated = pruneHistory(updated, ctx.songs);
  }
  ensureDir(path.dirname(ctx.historyPath));
  fs.writeFileSync(ctx.historyPath, serialiseHistory(updated), 'utf8');
  console.log(`  History saved -> ${path.relative(ctx.root, ctx.historyPath)}\n`);
}

function commandHistory(_args: ParsedArgs, ctx: Context): void {
  const history = readHistory(ctx.historyPath);
  const { statuses } = selectForPrint(ctx.songs, history, {});
  console.log(`\n  History: ${path.relative(ctx.root, ctx.historyPath)}`);
  printStatusTable(statuses);
}

function printStatusTable(statuses: { song: Song; status: string }[]): void {
  const label: Record<string, string> = {
    new: 'NEW      ',
    changed: 'CHANGED  ',
    printed: 'printed  ',
  };
  console.log('');
  for (const { song, status } of statuses) {
    console.log(`    ${label[status] ?? status} ${song.meta.title}  [${song.sourceFile}]`);
  }
  const counts = statuses.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `\n    total ${statuses.length} | new ${counts['new'] ?? 0} | changed ${counts['changed'] ?? 0} | printed ${counts['printed'] ?? 0}\n`
  );
}

interface Context {
  root: string;
  songsDir: string;
  historyPath: string;
  outputDir: string;
  songs: Song[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'help' || bool(args.flags, 'help') === true) {
    console.log(USAGE);
    return;
  }

  const root = findProjectRoot(__dirname);
  const songsDir = path.resolve(root, str(args.flags, 'songs-dir') ?? SONGS_DIR);
  const historyPath = path.resolve(root, str(args.flags, 'history') ?? HISTORY_FILE);
  const outputDir = path.resolve(root, 'output');

  if (!fs.existsSync(songsDir)) {
    throw new Error(`Songs directory not found: ${songsDir}`);
  }

  const notation = (str(args.flags, 'notation') as ChordNotation | undefined) ?? 'pl';
  const allSongs = loadSongs(songsDir, notation);
  const songs = allSongs.filter(song => song.valid);
  const skipped = allSongs.filter(song => !song.valid);

  for (const song of skipped) {
    console.error(`  x skipped ${song.sourceFile}: ${song.errors.join(' ')}`);
  }
  if (skipped.length > 0) {
    console.error('');
  }

  const ctx: Context = { root, songsDir, historyPath, outputDir, songs };

  switch (args.command) {
    case 'book':
      await commandBook(args, ctx);
      break;
    case 'print':
      await commandPrint(args, ctx);
      break;
    case 'history':
      commandHistory(args, ctx);
      break;
    default:
      console.error(`Unknown command: ${args.command}`);
      console.log(USAGE);
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`\n  Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
