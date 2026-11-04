# NgSongBook

Piotr's personal songbook. Plain-text song files in, PDF out.

**The PDF generator is the product.** It lives in `src/songbook/` (the core) and
`scripts/cli/` (the command line). That is where the work goes.

The Angular app is **not** a GUI for the generator, despite having buttons that
look like one. It is meant to become a mobile songbook in Cordova, for reading
on a phone. That part is on hold — keep it compiling and its tests green, but do
not grow it without being asked.

## Working agreements

- **Commit straight to `master`.** No side branches. One author, no review, so
  branching is pure overhead. Push only when asked.
- **Code is English, print is Polish.** UI labels, CLI output and help, error
  messages, parser warnings, comments and commit messages: English. Anything that
  lands on paper — cover title, dedication, `Spis treści`, the fallback song title
  `Bez tytułu`, PDF metadata — Polish. The test: _will a reader see it on the
  page?_ Then Polish. _Only someone looking at a terminal or the code?_ English.
- **Talk to Piotr in Polish.** He writes in Polish; that says nothing about the code.
- **Generate the PDF and show it before asking about committing.** He judges the
  result by looking at it. `npm run pdf:book`, then send the file.
- `README.md` is in Polish and documents the song format for him. Keep it in step
  with the parser — it has drifted twice already when a string replacement silently
  missed after Prettier reflowed a paragraph. Verify the result of edits to it.

## Commands

```bash
npm run pdf:book      # full songbook -> output/zloty_songbook_YYYY-MM-DD.pdf
npm run pdf:print     # next batch for the binder -> output/printN.pdf
npm run pdf:history   # what has been printed, what is waiting
npm run pdf:test      # songbook built from test-songs/
npm run pdf -- help   # every flag

npm test              # Jest - NOT `ng test`, there is no test target
npm run lint
npm start             # dev server; prestart regenerates the songs index
```

## Layout

```
songs/                   real songs (.txt), subdirectories allowed   [committed]
data/print-history.json  what has been printed - the only state      [committed]
test-songs/              fixtures for the format, kept away from real songs
src/songbook/            the core - no Angular, no Node
  model/song.model.ts      Song / SongBlock / SongLine, sortSongsByTitle
  parser/                  chord-tokenizer.ts, song-parser.ts
  pdf/                     pdf-options, song-content, cover, songbook-doc, print-doc
  history/print-history.ts selecting unprinted songs, content hashing
scripts/cli/             the CLI (tsc -> dist/cli)
src/app/                 Angular app (future Cordova reader)
src/assets/              generated songs-index.json (gitignored, derived from songs/)
output/                  generated PDFs (gitignored)
```

## The song format

See `README.md` for the full description. In short: `{title}` and `{author}` are
required, `{extra}` is not; `{chords}` is an instrumental passage; `{ref}`,
`{ref1}`, `{ref5}` are choruses; chords follow `|` at the end of a lyrics line.

## Decisions worth not relitigating

Each of these was deliberate. Changing one is fine — doing it by accident is not.

**Chords carry forward.** Chords given once apply to every following line, across
blocks, until the next `|`. This is the single most important rule of the format.

**A `{chords}` passage does not change the inherited chords.** After a bridge the
next verse still carries the chords from before it.

**Capitalisation never touches chord text.** In Polish notation a lowercase letter
means a minor chord, so `a` turned into `A` would be a different chord. The block
capitalisation applies to the first line that _has lyrics_, nothing else. There is
a test guarding this.

**Verses are `unbreakable`** so a stanza is never torn across a page boundary.

**The chord column is measured, not guessed.** The CLI measures lyrics with pdfkit
and the same Roboto buffers that go into the PDF, then puts the chord column just
past the longest line _of that song_ — close to the words, still one straight
column. Without a measurer it falls back to `lyricsColumnRatio`. The chorus indent
is applied to the lyrics, not the block, or the column would shift with it.

**The table of contents is hand-built, not pdfmake's `toc` node.** pdfmake's own
TOC is a fixed two-column table with no room for leaders. Ours passes the song
title node through `_tocItemRef` — the same private hook the built-in TOC uses —
so page numbers are still filled in after layout. Two traps live here: the
`'00000'` placeholder must never wrap, because pdfmake fills the number into the
first line of the cell only and a wrapped placeholder leaves an orphan `00`; and
the dot leader is _text_, not a drawn rule, because pdfmake wraps each word in its
own link annotation and a graphical leader left the middle of the row unclickable.

**An unreadable history stops the run.** `parseHistory` throws on a file that is
present but corrupt, or written by a newer `HISTORY_VERSION`. Treating it as empty
would make every song look unprinted and the next batch would overwrite the only
record of what is already in the binder. An absent or empty file is still a normal
start. `version` exists for exactly this refusal - additive changes are handled by
defaulting a missing field, not by the version.

**Print batches are numbered, not dated** - print1.pdf, print2.pdf. The number in
the file name IS the number in data/print-history.json: `batches` counts the runs,
each entry carries the `batch` it went out in. The counter lives in the committed
history, never derived from whatever happens to be sitting in output/. A run that
does not record itself (--no-mark) cannot claim a number, so it is written as
printN_preview.pdf instead.

**The print set has no page numbers** and never will: the binder grows batch by
batch, so numbering would be wrong the moment the next batch is generated. It does
print the **cover every time**, so a worn-out title page can be swapped.

**The cover carries no page number** but still counts, so the numbers printed in
the book match the ones in the contents.

**Fonts come from pdfmake's own base64 vfs**, decoded to Buffers for Node. The
PDF standard-14 fonts have no Polish diacritics.

**Errors vs warnings.** Something that would silently drop content from the print
is an error and keeps the song out of the PDF: missing `{title}`/`{author}`, no
lyrics, a `{ref}` recalled before it was written out, the same chorus number
written out twice. Everything else is a warning, de-duplicated so one mistake
repeated five times is said once.

**`{ref}` is a chorus of its own, not an alias for `{ref1}`.** Aliasing them made
mixing the two forms silently drop a text.

**`tsconfig.spec.json` must not override `module` or `moduleResolution`.** ts-jest
forces CommonJS output itself, while Angular needs `bundler` resolution to find its
`exports` maps. Setting `node` there breaks every Angular spec.

**Jest runs outside the Angular CLI.** `@angular/build:unit-test` only knows karma
and vitest, so `npm test` calls `jest` directly and `angular.json` has no test
target.

**All state lives in the repo.** `songs/` and `data/print-history.json` are
committed, so a fresh clone on any machine knows the songbook and what has already
been printed. Everything else - `output/`, `dist/`, `src/assets/songs-index.json`,
`.angular/` - is derived and gitignored. The Angular app reads the history but never
writes it: it used to keep a copy in localStorage, which lived in one browser and
drifted from the file in the repo. Printing is the CLI's job.

**The browser cannot list a directory**, which is why `src/assets/songs-index.json`
exists. It is generated from `songs/` by `prestart`/`prebuild`, gitignored, and
never edited by hand. The CLI ignores it and walks the directory itself.
