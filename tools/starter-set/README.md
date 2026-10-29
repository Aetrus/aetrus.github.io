# The starter set

Writes Aetheria's starter set, Lantern Quay, into the Archive as the files Aetheria itself would export, from Aetheria Experimental's source (`src/starter/`, `src/presets/storyteller.js`), through Aetheria's own code. Nothing asks a model.

```
cd tools/starter-set
npm install            (once)
node generate.mjs
```

`generate.mjs` looks for the source at `C:\Users\gjens\Documents\Antigravity creations\Aetheria Experiemental\src`; pass another path as its argument if it moves. It needs Node 20 or later and Python with Pillow (`pip install pillow`; set `PYTHON` if it is not on the path as `python`).

- `node generate.mjs --check` builds everything and reads it back, but writes nothing.
- `node generate.mjs --full-world` writes the world as the full built package (about 7 MB) instead of a recipe.

## What it writes

| File | What it is | Made the way Aetheria makes it |
| --- | --- | --- |
| `cards/dilys-pengelly.png`, `cards/ansel-truscott.png` | The two cards in their portraits (1024×1536): V2 in a `chara` chunk, V3 in `ccv3`, the Lantern Quay lorebook bound in as `character_book`, V3 dates in seconds | The card goes into its portrait and is read in as the app puts the set in (`portraits.js`, `extractCardFromImage`), then out as the app exports a character (`cardForExport`, `embedCardInImage`), carrying the book it is bound to. Aetheria has no writer for a card's book, so it is written the way this site's Lorebook builder binds one (`toCharacterBook`, SillyTavern's form), which Aetheria's importers read back whole. |
| `works/lantern-quay-lorebook.json` | The lorebook as World Info, with its picture | `normalizeLorebook`, then `stripLorebookMeta`, as the app exports a volume |
| `works/aetheria-storyteller.json` | The house preset, as a SillyTavern chat-completion preset, with its picture | `importSillyTavernPreset` and `validateAndFixPreset` as the app files it, then `exportSillyTavernPreset` |
| `works/lantern-quay.aetheria-age` | The world, as a recipe package (its book, document and picture; about 0.3 MB), which Aetheria and the World builder rebuild exactly | `agesBakeCompilerProposal` from its structure, `agesSetWorldCover`, then `agesExportWorld` (story history left out, as the app's export does by default) |
| `covers/*.webp` | 520×780 covers for the gallery, and each work's own picture as it is in the app (`*-large.webp`) | From `portraitData.js` and `coverData.js`; the world's small cover is the town at the middle of its 3:2 picture, as its card in the app shows it |
| `assets/js/builders/lorebook/lantern-quay.js` | The book the Lorebook builder opens with "Lantern Quay" | `STARTER_LOREBOOK` as it is |
| `data/cards.json`, `data/works.json` | The set's entries, by slug; `featured` and a card's `added` are kept, other entries are left alone | Taglines, tags and stats from the cards; the words for the works from `copy.mjs` |

## Before it writes

It reads every file back and stops, writing nothing, if any does not come back whole:

- each card with this site's reader (`assets/js/lib/card.js`, which reads `ccv3` first) and Aetheria's (`extractCardFromImage`, which reads `chara`), field by field, with the dates in seconds;
- each card's book as the phone files it (`normalizeLorebook`), as the desktop files it (`public/main/lorebooks.js`, `convertEmbeddedCharacterLorebook`) and as the Lorebook builder opens it, entry by entry against the starter book;
- the lorebook file in Aetheria and in the Lorebook builder;
- the preset, read in and written out again by Aetheria, coming back the same;
- the world, through the engine's own reader (checksum), a recipe rebuilding exactly the world a full build makes, and Aetheria's import taking it.

Dates are the dates of the source files' last commits (a file with changes not yet committed is dated by the file, with a warning), and the world's identity is fixed (`age_lantern_quay_starter`), so running it again on the same source writes the same bytes.

## The words

The taglines, descriptions and tags shown in Works are in `copy.mjs`, drawn from Aetheria's own: the cards' creator notes, the book's description, the preset's blocks and the guide's page on the set. Lists and numbers in them are read from the source. If the starter book stops doing what its description says (one entry always on, whole words, three replies), the run warns.

`.cache/` holds the bundle and the pictures between steps; it can be deleted.
