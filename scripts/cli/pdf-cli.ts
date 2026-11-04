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
import { robotoFonts } from './fonts';
import { HISTORY_FILE, ensureDir, findProjectRoot, loadSongs, timestampSlug } from './workspace';

const USAGE = `
Śpiewnik - generator PDF

  npm run pdf:book            cały śpiewnik: okładka + klikalny spis treści + numery stron
  npm run pdf:print           TYLKO piosenki jeszcze nie drukowane (bez spisu, bez numerów stron)
  npm run pdf:history         co jest już wydrukowane, a co czeka

Wspólne opcje:
  --page-size A4|A5           format strony (domyślnie A4)
  --chords above|right|none   akordy nad tekstem / w kolumnie po prawej / bez akordów
  --no-split-chords           drukuj akordy dokładnie jak w pliku (AaDeD zamiast A  a  D  e  D)
  --notation pl|intl          'pl' (domyślnie): b to osobny akord; 'intl': b po dźwięku to bemol
  --font-size N               wielkość tekstu (A4: 11, A5: 12)
  --chord-size N              wielkość akordów (A4: 9.5, A5: 10.5)
  --title-size N              wielkość tytułu piosenki
  --bold                      pogrubiony tekst piosenek (przydatne na A5)
  --line-height N             interlinia (A4: 1.25, A5: 1.18)
  --title "Mój śpiewnik"      tytuł dokumentu / okładki
  --songs a.txt,b.txt         ogranicz do wybranych plików
  --out ścieżka.pdf           plik wyjściowy
  --assets katalog            katalog z piosenkami (domyślnie src/assets)
  --history plik.json         plik historii wydruków (domyślnie src/assets/print-history.json)

Tylko 'book':
  --no-cover                  bez strony tytułowej
  --no-toc                    bez spisu treści
  --no-page-numbers           bez numerów stron

Tylko 'print':
  --all                       wygeneruj wszystko, ignorując historię
  --include-changed           dołącz też piosenki zmienione od ostatniego druku
  --dry-run                   pokaż co by poszło do druku, nie generuj i nie zapisuj historii
  --no-mark                   wygeneruj PDF, ale NIE zapisuj do historii
  --prune                     usuń z historii wpisy piosenek, których już nie ma
`;

function pdfOptionsFrom(flags: ParsedArgs['flags']): Partial<PdfOptions> {
  const chords = str(flags, 'chords') as ChordLayout | undefined;
  const pageSize = str(flags, 'page-size')?.toUpperCase() as PageSize | undefined;

  if (pageSize && pageSize !== 'A4' && pageSize !== 'A5') {
    throw new Error(`Nieobsługiwany format strony: ${pageSize} (dozwolone: A4, A5)`);
  }
  if (chords && !['above', 'right', 'none'].includes(chords)) {
    throw new Error(`Nieobsługiwany układ akordów: ${chords} (dozwolone: above, right, none)`);
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
    lineHeight: num(flags, 'line-height'),
    title: str(flags, 'title'),
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
    console.error('Brak piosenek do wygenerowania.');
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
  });

  await writePdf(doc, outPath);
  reportWarnings(songs);
  console.log(`\n  Śpiewnik (${songs.length} piosenek) -> ${path.relative(ctx.root, outPath)}`);
  console.log('  Spis treści i numery stron przeliczone od nowa.\n');
}

async function commandPrint(args: ParsedArgs, ctx: Context): Promise<void> {
  const history = readHistory(ctx.historyPath);
  const { toPrint, statuses } = selectForPrint(ctx.songs, history, {
    all: bool(args.flags, 'all') === true,
    includeChanged: bool(args.flags, 'include-changed') === true,
    only: list(args.flags, 'songs'),
  });

  if (toPrint.length === 0) {
    console.log('\n  Nic nowego do druku - wszystkie piosenki były już generowane.');
    console.log('  (--include-changed dołączy zmienione, --all wygeneruje wszystko.)\n');
    printStatusTable(statuses);
    return;
  }

  console.log(`\n  Do druku (${toPrint.length}):`);
  for (const song of toPrint) {
    console.log(`    + ${song.meta.title}  [${song.sourceFile}]`);
  }

  if (bool(args.flags, 'dry-run') === true) {
    console.log('\n  --dry-run: nic nie wygenerowano, historia nietknięta.\n');
    return;
  }

  const outPath = str(args.flags, 'out') ?? path.join(ctx.outputDir, `do-druku-${timestampSlug()}.pdf`);

  const doc = buildPrintDoc(toPrint, pdfOptionsFrom(args.flags));
  await writePdf(doc, outPath);
  reportWarnings(toPrint);
  console.log(`\n  PDF -> ${path.relative(ctx.root, outPath)}  (bez numerów stron, bez spisu)`);

  if (bool(args.flags, 'mark') === false) {
    console.log('  --no-mark: historia NIE została zaktualizowana.\n');
    return;
  }

  let updated = markPrinted(history, toPrint);
  if (bool(args.flags, 'prune') === true) {
    updated = pruneHistory(updated, ctx.songs);
  }
  ensureDir(path.dirname(ctx.historyPath));
  fs.writeFileSync(ctx.historyPath, serialiseHistory(updated), 'utf8');
  console.log(`  Historia zapisana -> ${path.relative(ctx.root, ctx.historyPath)}\n`);
}

function commandHistory(_args: ParsedArgs, ctx: Context): void {
  const history = readHistory(ctx.historyPath);
  const { statuses } = selectForPrint(ctx.songs, history, {});
  console.log(`\n  Historia: ${path.relative(ctx.root, ctx.historyPath)}`);
  printStatusTable(statuses);
}

function printStatusTable(statuses: { song: Song; status: string }[]): void {
  const label: Record<string, string> = {
    new: 'NOWA        ',
    changed: 'ZMIENIONA   ',
    printed: 'wydrukowana ',
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
    `\n    razem ${statuses.length} | nowe ${counts['new'] ?? 0} | zmienione ${counts['changed'] ?? 0} | wydrukowane ${
      counts['printed'] ?? 0
    }\n`
  );
}

interface Context {
  root: string;
  assetsDir: string;
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
  const assetsDir = path.resolve(root, str(args.flags, 'assets') ?? 'src/assets');
  const historyPath = path.resolve(root, str(args.flags, 'history') ?? path.join(assetsDir, HISTORY_FILE));
  const outputDir = path.resolve(root, 'output');

  if (!fs.existsSync(assetsDir)) {
    throw new Error(`Nie ma katalogu z piosenkami: ${assetsDir}`);
  }

  const notation = (str(args.flags, 'notation') as ChordNotation | undefined) ?? 'pl';
  const allSongs = loadSongs(assetsDir, notation);
  const songs = allSongs.filter(song => song.valid);
  const skipped = allSongs.filter(song => !song.valid);

  for (const song of skipped) {
    console.warn(`  ! pominięto ${song.sourceFile}: ${song.warnings.join('; ')}`);
  }

  const ctx: Context = { root, assetsDir, historyPath, outputDir, songs };

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
      console.error(`Nieznana komenda: ${args.command}`);
      console.log(USAGE);
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`\n  Błąd: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
