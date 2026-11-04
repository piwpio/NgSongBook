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

Prawdziwe piosenki trzymasz w `src/assets/`. Pliki do testowania formatu leżą
osobno, w `test-songs/`, żeby nie mieszały się z Twoim śpiewnikiem — generujesz
z nich przez `npm run pdf:test`.

Piosenka to plik `.txt`. Przykład:

```
{title}Tytuł piosenki
{author}Wykonawca piosenki
{extra}capo 2

{chords}eCGD

to jest linia 1|AaDeD
to jest linia 2
to jest linia 3|AaDeD
to jest linia 4|abDeGEGE

to jest linia 5
to jest linia 6

{ref} to jest linia 7
to jest linia 8

to jest linia 9
to jest linia 10

{ref}
```

**Nagłówek** — linie `{klucz}wartość` na początku pliku. Obsługiwane klucze:

| klucz      | wymagany | znaczenie             |
| ---------- | -------- | --------------------- |
| `{title}`  | tak      | tytuł piosenki        |
| `{author}` | tak      | wykonawca             |
| `{extra}`  | nie      | dopisek, np. `capo 2` |

Piosenka bez tytułu albo bez wykonawcy jest **nieprawidłowa** — nie trafia do PDF-a,
a CLI wypisuje, czego brakuje. To samo dotyczy pliku bez tekstu.

`{ref}` i `{chords}` nie są kluczami nagłówka — jeśli piosenka zaczyna się od refrenu
albo od intra, parser poprawnie potraktuje je jako treść. Liczba pustych linii między
nagłówkiem a tekstem nie ma znaczenia.

**Pasaże instrumentalne** — linia `{chords}eCGD` to fragment bez tekstu: intro, bridge,
przejście. Drukuje się w kolumnie tekstu, nie w kolumnie akordów, i bez żadnego prefiksu —
nie ma obok czego stać. Może wystąpić w dowolnym miejscu piosenki, nie tylko na początku.

Taka linia **nie zmienia** akordów dziedziczonych przez tekst: po bridge'u kolejne wersy
nadal mają akordy sprzed niego.

**Zwrotki** — oddzielone pustą linią. Zwrotka nigdy nie jest rozrywana między stronami.

**Refren** — blok zaczynający się od `{ref}`:

- `{ref} tekst refrenu` — tu refren jest zapisany. Marker nie trafia do druku,
  blok dostaje wcięcie.
- samo `{ref}` w osobnej linii — w tym miejscu refren jest powtarzany w całości,
  razem z akordami. Nie trzeba go przepisywać.

Akordy powtórzonego refrenu nie wpływają na to, co dziedziczą kolejne zwrotki —
po powtórce obowiązują nadal akordy sprzed refrenu.

Stary zapis (`ref.`, `refren`, `chorus`, `[ref]`) wciąż działa jako definicja refrenu, ale
parser wypisuje ostrzeżenie — przestaw pliki na `{ref}`.

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

a dla plików testowych:

```bash
npm run generate-song-list test-songs
```

---

## CLI

```bash
npm run pdf:book          # cały śpiewnik -> output/spiewnik-RRRR-MM-DD.pdf
npm run pdf:print         # tylko nowe piosenki -> output/do-druku-RRRR-MM-DD.pdf
npm run pdf:history       # co jest wydrukowane, a co czeka
npm run pdf:test          # śpiewnik z plików testowych w test-songs/
npm run pdf -- help       # pełna lista opcji
```

Opcje podaje się po `--`, np.:

```bash
npm run pdf:print -- --page-size A5 --bold --chords right
```

| Opcja                                           | Znaczenie                                                 |
| ----------------------------------------------- | --------------------------------------------------------- |
| `--page-size A4\|A5`                            | format strony (A5 ma automatycznie większą czcionkę)      |
| `--chords right\|above\|none`                   | kolumna po prawej (domyślnie) / nad tekstem / bez akordów |
| `--no-split-chords`                             | drukuj akordy dosłownie (`AaDeD`)                         |
| `--notation pl\|intl`                           | notacja akordów                                           |
| `--font-size` / `--chord-size` / `--title-size` | rozmiary czcionek                                         |
| `--bold`                                        | pogrubiony tekst piosenek                                 |
| `--line-height`                                 | interlinia                                                |
| `--title "..."`                                 | tytuł dokumentu i okładki                                 |
| `--songs a.txt,b.txt`                           | ogranicz do wybranych plików                              |
| `--out plik.pdf`                                | plik wyjściowy                                            |

Tylko `book`: `--no-cover`, `--no-toc`, `--no-page-numbers`,
`--toc-title "Spis treści"`, `--subtitle "..."` (linia pod tytułem na okładce),
`--dedication "..."` / `--no-dedication`.

Tylko `print`: `--all` (ignoruj historię), `--include-changed` (dołącz zmienione),
`--dry-run` (pokaż, nie generuj), `--no-mark` (nie zapisuj do historii),
`--prune` (usuń z historii nieistniejące piosenki).

### Historia wydruków

`src/assets/print-history.json` — komitowany plik z zapisem, co i kiedy poszło do druku.
Dla każdej piosenki trzyma hash treści, więc po edycji tekstu `npm run pdf:history`
pokaże ją jako `ZMIENIONA`, a `npm run pdf:print -- --include-changed` wydrukuje ponownie.

---

### Strona tytułowa

Na środku tytuł (`--title`, domyślnie **Śpiewnik Złotego**), a przy dolnej krawędzi po prawej,
jak przypis, dedykacja:

> _Dla Irminy i Astrid, moich najwierniejszych fanek na dobre i złe_

Zmienia ją `--dedication "..."`, zdejmuje `--no-dedication`. Okładka nie ma numeru strony,
ale liczy się do numeracji, więc numery w spisie treści zgadzają się z tymi na stronach.

Domyślnie akordy idą w kolumnie obok tekstu. CLI mierzy tekst w tym samym foncie,
który trafia do PDF-a (pdfkit + Roboto), i ustawia kolumnę tuż za najdłuższą linią
**danej piosenki** — akordy są blisko słów, a mimo to tworzą równy pion. Gdy linia
przekracza 78% szerokości kolumny, szerokość jest przycinana i najdłuższe linie się
zawijają. `--chords above` daje wariant nad tekstem.

Bez pomiaru (czyli w przeglądarce) kolumna wypada na stałym ułamku szerokości strony —
`lyricsColumnRatio`, domyślnie 0.5.

Komunikaty aplikacji i CLI są po angielsku; polskie zostają tylko tam, gdzie są treścią
śpiewnika (tytuł okładki, dedykacja, teksty piosenek).

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
src/assets/              Twoje piosenki .txt, __songs__.txt, print-history.json
test-songs/              pliki testowe formatu, osobno od prawdziwych piosenek
output/                  wygenerowane PDF-y (gitignore)
```

## Testy

```bash
npm test
npm run lint
```

Testy chodzą na Jeście (`jest-preset-angular`), nie przez `ng test` — własny builder
Angulara obsługuje tylko Karmę i Vitest, więc Jest jest odpalany wprost.
