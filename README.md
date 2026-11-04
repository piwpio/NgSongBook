# NgSongBook

Śpiewnik: pliki tekstowe z piosenkami → PDF.

Dwa tryby generowania:

|              | Cały śpiewnik                  | Do druku                                                     |
| ------------ | ------------------------------ | ------------------------------------------------------------ |
| zawartość    | wszystkie piosenki             | tylko te jeszcze niedrukowane                                |
| okładka      | tak                            | **tak, za każdym razem**                                     |
| spis treści  | tak, klikalny (linki do stron) | nie                                                          |
| numery stron | tak, przeliczane od nowa       | **nie** (kartki trafiają do segregatora w różnej kolejności) |
| komenda      | `npm run pdf:book`             | `npm run pdf:print`                                          |

Wszystko kręci się wokół jednego rdzenia w [`src/songbook/`](src/songbook) — parser, model i
budowanie dokumentu pdfmake nie zależą ani od Angulara, ani od Node'a, więc aplikacja w
przeglądarce i CLI dają identyczny PDF.

---

## Format pliku piosenki

Prawdziwe piosenki trzymasz w `songs/`. Wrzucasz plik `.txt` i tyle — nie ma żadnej
listy do utrzymywania. Generator czyta cały katalog, razem z podkatalogami, a śpiewnik
układa **alfabetycznie po tytule**. Podkatalogi na razie niczego nie grupują, służą
tylko Tobie do porządku.

Pliki do testowania formatu leżą osobno, w `test-songs/`, żeby nie mieszały się z Twoim
śpiewnikiem — generujesz z nich przez `npm run pdf:test`.

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

Każda zwrotka i każdy refren zaczynają się w druku **wielką literą**, niezależnie od tego,
jak zapisałeś je w pliku. Zmieniana jest tylko pierwsza linia bloku, która ma tekst — nigdy
akordy, bo w notacji polskiej mała litera to moll i `a` zamienione na `A` byłoby już innym
akordem. Wyłącza to `--no-capitalize`.

**Refren** — blok zaczynający się od `{ref}`:

- `{ref} tekst refrenu` — tu refren jest zapisany. Marker nie trafia do druku,
  blok dostaje wcięcie.
- samo `{ref}` w osobnej linii — w tym miejscu refren jest powtarzany w całości,
  razem z akordami. Nie trzeba go przepisywać.

Jeśli piosenka ma **więcej niż jeden refren**, numerujesz je: `{ref1}`, `{ref2}`, `{ref5}` —
numery nie muszą iść po kolei, liczy się tylko to, że dany numer oznacza zawsze ten sam
refren. Marker z tekstem zapisuje go, sam marker przywołuje z powrotem, i możesz wracać
do wcześniejszego numeru po tym, jak zapiszesz kolejny:

```
{ref1}pierwszy refren|G

zwrotka

{ref1}

{ref2}inny refren na koniec zwrotki|a

{ref1}
```

`{ref}` bez numeru to **osobny** refren, nie synonim `{ref1}` — jeśli w jednej piosence
użyjesz obu, parser to zgłosi zamiast po cichu je sklejać.

Walidacja refrenów:

| sytuacja                                  | reakcja                                   |
| ----------------------------------------- | ----------------------------------------- |
| przywołanie numeru, którego nie zapisałeś | **błąd** — piosenka nie trafia do PDF-a   |
| ten sam numer zapisany dwa razy           | **błąd** — refren wolno zapisać tylko raz |
| `{ref007}` i `{ref7}`                     | ten sam refren                            |

Akordy powtórzonego refrenu nie wpływają na to, co dziedziczą kolejne zwrotki —
po powtórce obowiązują nadal akordy sprzed refrenu.

**Nawiasy kwadratowe** działają dla każdego tagu — `[title]`, `[author]`, `[extra]`,
`[chords]`, `[ref1]` — ale parser wypisuje na to jedno ostrzeżenie na piosenkę.
Klamry są formą właściwą. Refren zapisany słowem (`ref.`, `refren`, `chorus`) też
jeszcze działa, z osobnym ostrzeżeniem.

**Akordy** — po znaku `|` na końcu linii. Kluczowa zasada:

> Akordy podane raz obowiązują w każdej kolejnej linii, aż do następnego `|`.
> Dotyczy to również przejścia między zwrotkami.

W przykładzie wyżej linie 1–3 mają `AaDeD`, a linie 4–8 mają `abDeGEGE`.

Zbity zapis akordów jest rozbijany na pojedyncze akordy: `AaDeD` → `A a D e D`,
`abDeGEGE` → `a b D e G E G E`. Sufiksy zostają przy swoim dźwięku (`Amaj7`, `Dsus4`,
`F#`, `C/G`). Domyślnie obowiązuje **notacja polska** — `b` to osobny akord (b-moll),
nie bemol; `--notation intl` przełącza na międzynarodową, gdzie `Ab` to As-dur.

---

## CLI

```bash
npm run pdf:book          # cały śpiewnik -> output/zloty_songbook_RRRR-MM-DD.pdf
npm run pdf:print         # tylko nowe piosenki -> output/printN.pdf
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

Tylko `print`: `--no-cover` (bez strony tytułowej), `--all` (ignoruj historię),
`--include-changed` (dołącz zmienione),
`--dry-run` (pokaż, nie generuj), `--no-mark` (nie zapisuj do historii),
`--prune` (usuń z historii nieistniejące piosenki).

### Historia wydruków

Zestaw do druku zaczyna się stroną tytułową i jest ona drukowana **zawsze**, choćby
partia liczyła jedną piosenkę — dzięki temu zniszczoną okładkę w segregatorze wymieniasz
na świeżą bez generowania całego śpiewnika. `--no-cover` ją pomija.

Partie do druku są **numerowane**, nie datowane: pierwszy wydruk to `print1.pdf`, drugi
`print2.pdf` i tak dalej. Numer w nazwie pliku to **dokładnie ten sam numer**, który siedzi
w `data/print-history.json` — pole `batches` mówi, ile partii poszło, a każda piosenka ma
przy sobie `batch` z numerem swojej partii. Dzięki temu z samej nazwy pliku wiesz, co
w nim jest, i odwrotnie.

Licznik żyje w historii, a nie jest zgadywany z plików w `output/` — ten katalog jest
odtwarzalny i możesz go skasować, kiedy chcesz. Wydruk zrobiony z `--no-mark` nie zapisuje
się w historii, więc nie zajmuje numeru i dostaje nazwę `printN_preview.pdf`.

Jeśli plik historii jest **uszkodzony** albo zapisany przez nowszą wersję śpiewnika,
CLI przerywa z błędem i niczego nie nadpisuje. Potraktowanie go jako pustego oznaczałoby,
że wszystkie piosenki wyglądają na niedrukowane, a następny wydruk skasowałby jedyny
zapis tego, co już masz w segregatorze. Brak pliku to co innego — to normalny start.

`data/print-history.json` — komitowany plik z zapisem, co i kiedy poszło do druku.
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

Przeglądarka nie potrafi wylistować katalogu po HTTP, więc aplikacja czyta indeks
`src/assets/songs-index.json`. Jest generowany z `songs/` automatycznie przez
`prestart` i `prebuild` (albo ręcznie: `npm run songs:index`), leży w `.gitignore`
i nie dotykasz go. CLI z niego nie korzysta — czyta katalog wprost.

Aplikacja **czyta** historię wydruków z `data/print-history.json`, ale nigdy jej nie
zapisuje — drukowanie to zadanie CLI. Wcześniej trzymała własną kopię w localStorage
przeglądarki, co rozjeżdżało się z plikiem w repo i zależało od maszyny.

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
songs/                   Twoje piosenki .txt (także w podkatalogach)
data/                    print-history.json — historia wydruków (w repo)
src/assets/              wygenerowany songs-index.json (poza repo)
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
