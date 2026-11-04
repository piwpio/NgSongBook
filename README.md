# NgSongBook

Śpiewnik: pliki tekstowe z piosenkami → PDF.

Dwa tryby generowania:

|              | Cały śpiewnik                  | Do druku                                                     |
| ------------ | ------------------------------ | ------------------------------------------------------------ |
| zawartość    | wszystkie piosenki             | tylko te jeszcze niedrukowane                                |
| okładka      | tak                            | nie                                                          |
| spis treści  | tak, klikalny (linki do stron) | nie                                                          |
| numery stron | tak, przeliczane od nowa       | **nie** (kartki trafiają do segregatora w różnej kolejności) |
| komenda      | `npm run pdf:book`             | `npm run pdf:print`                                          |

Wszystko kręci się wokół jednego rdzenia w [`src/songbook/`](src/songbook) — parser, model i
budowanie dokumentu pdfmake nie zależą ani od Angulara, ani od Node'a, więc aplikacja w
przeglądarce i CLI dają identyczny PDF.

---

## Format pliku piosenki

Piosenki to pliki `.txt` w `src/assets/`. Przykład:

```
{title}Tytuł piosenki
{author}Wykonawca piosenki
{extra}capo 2

to jest linia 1|AaDeD
to jest linia 2
to jest linia 3|AaDeD
to jest linia 4|abDeGEGE

to jest linia 5
to jest linia 6

ref. to jest linia 7
to jest linia 8
```

**Nagłówek** — linie `{klucz}wartość` na początku pliku. Wszystkie są opcjonalne; bez
`{title}` tytuł brany jest z nazwy pliku. Obsługiwane klucze: `title`, `author`, `extra`.
Liczba pustych linii między nagłówkiem a tekstem nie ma znaczenia.

**Zwrotki** — oddzielone pustą linią. Zwrotka nigdy nie jest rozrywana między stronami.

**Refren** — zwrotka, której pierwsza linia zaczyna się od `ref.`, `ref:`, `refren`
lub `chorus`. Marker jest wycinany z tekstu, a blok dostaje wcięcie i pogrubioną etykietę.

**Akordy** — po znaku `|` na końcu linii. Kluczowa zasada:

> Akordy podane raz obowiązują w każdej kolejnej linii, aż do następnego `|`.
> Dotyczy to również przejścia między zwrotkami.

W przykładzie wyżej linie 1–3 mają `AaDeD`, a linie 4–8 mają `abDeGEGE`.

Zbity zapis akordów jest rozbijany na pojedyncze akordy: `AaDeD` → `A a D e D`,
`abDeGEGE` → `a b D e G E G E`. Sufiksy zostają przy swoim dźwięku (`Amaj7`, `Dsus4`,
`F#`, `C/G`). Domyślnie obowiązuje **notacja polska** — `b` to osobny akord (b-moll),
nie bemol; `--notation intl` przełącza na międzynarodową, gdzie `Ab` to As-dur.

**Lista piosenek** — `src/assets/__songs__.txt` ustala kolejność. Po dodaniu pliku:

```bash
npm run generate-song-list
```

---

## CLI

```bash
npm run pdf:book          # cały śpiewnik -> output/spiewnik-RRRR-MM-DD.pdf
npm run pdf:print         # tylko nowe piosenki -> output/do-druku-RRRR-MM-DD.pdf
npm run pdf:history       # co jest wydrukowane, a co czeka
npm run pdf -- help       # pełna lista opcji
```

Opcje podaje się po `--`, np.:

```bash
npm run pdf:print -- --page-size A5 --bold --chords right
```

| Opcja                                           | Znaczenie                                               |
| ----------------------------------------------- | ------------------------------------------------------- |
| `--page-size A4\|A5`                            | format strony (A5 ma automatycznie większą czcionkę)    |
| `--chords above\|right\|none`                   | akordy nad tekstem / w kolumnie po prawej / bez akordów |
| `--no-split-chords`                             | drukuj akordy dosłownie (`AaDeD`)                       |
| `--notation pl\|intl`                           | notacja akordów                                         |
| `--font-size` / `--chord-size` / `--title-size` | rozmiary czcionek                                       |
| `--bold`                                        | pogrubiony tekst piosenek                               |
| `--line-height`                                 | interlinia                                              |
| `--title "..."`                                 | tytuł dokumentu i okładki                               |
| `--songs a.txt,b.txt`                           | ogranicz do wybranych plików                            |
| `--out plik.pdf`                                | plik wyjściowy                                          |

Tylko `book`: `--no-cover`, `--no-toc`, `--no-page-numbers`.

Tylko `print`: `--all` (ignoruj historię), `--include-changed` (dołącz zmienione),
`--dry-run` (pokaż, nie generuj), `--no-mark` (nie zapisuj do historii),
`--prune` (usuń z historii nieistniejące piosenki).

### Historia wydruków

`src/assets/print-history.json` — komitowany plik z zapisem, co i kiedy poszło do druku.
Dla każdej piosenki trzyma hash treści, więc po edycji tekstu `npm run pdf:history`
pokaże ją jako `ZMIENIONA`, a `npm run pdf:print -- --include-changed` wydrukuje ponownie.

---

## Aplikacja (Angular)

```bash
npm start     # http://localhost:4200
```

Podgląd wszystkich piosenek z akordami plus te same dwa przyciski generowania.
pdfmake (~2 MB z fontami) ładuje się leniwie, dopiero przy pierwszym PDF-ie.

Przeglądarka nie zapisze pliku w repo, więc historia działa warstwowo:
komitowany `assets/print-history.json` + to, co wygenerowano w tej przeglądarce
(localStorage). Przycisk **Pobierz print-history.json** eksportuje scaloną historię —
wystarczy podmienić nią plik w `src/assets/`.

---

## Struktura

```
src/songbook/            rdzeń - bez Angulara i bez Node'a
  model/song.model.ts    Song / SongBlock / SongLine
  parser/                chord-tokenizer.ts, song-parser.ts
  pdf/                   pdf-options.ts, song-content.ts, songbook-doc.ts, print-doc.ts
  history/               print-history.ts (wybór niedrukowanych, hash treści)
scripts/cli/             CLI (tsc -> dist/cli, uruchamiane przez npm run pdf:*)
src/app/                 aplikacja Angular
src/assets/              piosenki .txt, __songs__.txt, print-history.json
output/                  wygenerowane PDF-y (gitignore)
```

## Testy

```bash
npm test
npm run lint
```
