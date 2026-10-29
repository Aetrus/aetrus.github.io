# Aetheria Archive

The public wing of Aetheria: a gallery of works, the community Preset Archive, a star chart of kindred creators, Aetheria's own builders running in the browser, and the downloads and boards for the app.

Live at **https://aetrus.github.io** once Pages is on. Plain HTML, CSS and ES modules: no build step, no framework, no server.

```
index.html            the shell (header, footer, mobile dock)
404.html              sends stray paths home
data/site.json        tagline, footer links, release repo, board connection
data/cards.json       card manifest (the Cards shelf of Works)
data/works.json       everything else you post: lorebooks, presets, themes, guides
data/presets.json     the community Preset Archive
data/creators.json    Kindred (creators) and Lodestars (open card libraries, specs)
works/                files for works.json entries
cards/                card PNGs (chara + ccv3 chunks inside)
covers/               small thumbnails for the gallery (optional)
assets/css/archive.css   the Bindings and every style
assets/css/builders/  the shared builder sheet, plus one stylesheet per builder
assets/js/            app shell, router, views, and the format libraries
  builders/           the shared sheet (sheet.js) and each builder's modules
  vendor/aetheria/    Aetheria's own logic, bundled (see tools/aetheria-core)
  lib/png.js          PNG tEXt chunk read/write (never re-encodes the image)
  lib/card.js         V1/V2/V3 reading, V2+V3 writing, token anatomy, craft checks
  lib/lorebook.js     World Info <-> character_book (port of the Grimoire's LorebookCodec)
  lib/macros.js       SillyTavern macro catalogue (port of Macros.kt)
  lib/blueprints.js   [[slot]] blueprints (port of BlueprintSlots.kt)
tools/aetheria-core/  rebuilds the vendor/aetheria bundles from Aetheria Experimental's source
```

## Add a card to Works

1. Drop the card PNG into `cards/`.
2. Open the site's **Workshop → Card Lens**, drop the same PNG in, and press **Copy gallery entry**.
3. Paste that entry into the `cards` list in `data/cards.json`. Edit `featured`, `tagline` or `world` if you like.
4. Optional but faster on phones: save a small cover (about 520×780, `.webp` or `.jpg`) in `covers/` and set `"thumb"` to it.
5. Commit and push. Pages updates in a minute or two.

The shortest entry that works is `{ "file": "cards/name.png" }`. The gallery then reads name, tags and stats out of the PNG itself, which costs a full download per card on every visit, so the copied entry is better.

Cards in the same `world` are joined by starlines when you hover one in Works, and listed together under "Also from …" on the card page.

## Add anything else to Works

Lorebooks, presets, themes, guides and tools go in `data/works.json`, with their files in `works/`:

```json
{
  "slug": "my-preset",
  "type": "preset",
  "name": "My Preset",
  "tagline": "One line for the shelf",
  "world": "",
  "tags": ["Claude", "Slow burn"],
  "version": "1.0",
  "updated": "2026-11-02",
  "description": "Markdown is fine here.\n\n- What it does\n- What it needs",
  "files": [{ "label": "Preset JSON", "url": "works/my-preset.json" }],
  "links": [{ "label": "Chub", "url": "https://chub.ai/..." }]
}
```

`type` is one of `lorebook`, `preset`, `theme`, `guide`, `tool`, `other`; Works groups them and gives each its own tab. A lorebook or preset with a `.json` file gets a button that opens it in the Lorebook or Preset builder. Give a work the same `world` as some cards and they're shown together.

## The Preset Archive

`data/presets.json` holds the community presets: creator credit, the version, what models it's built for, a summary, and a link to where the creator posted it. Nothing is re-hosted. Entries with `"catalogued": false` are on the community list but had no page outside Reddit to read, so they're credited without a summary; `"honorable": true` puts an entry under Honourable mentions. The list itself comes from the regularly updated post on r/SillyTavernAI; re-check it now and then and add new versions.

## Aetheria downloads and patch notes

Builds live as GitHub releases on **Aetrus/aetheria-releases** (cloned at `Desktop\Claude Creations\aetheria-releases`). The Downloads page and the Aetheria page read them live from GitHub, newest first, with the release text as patch notes. To publish:

```powershell
cd "$env:USERPROFILE\Desktop\Claude Creations\aetheria-releases"
.\publish-release.ps1 -Version 1.6.6
```

It finds the installer and APK in `OneDrive\Aetheria`, opens a patch-notes template, scans the APK for bundled secrets, and asks before publishing. The installer can't be scanned, so make sure `.env` and API keys aren't packed into the Electron build.

## Feature requests and bug reports

The boards (`#board` and `#bugs`) store posts in the Supabase project **aetheria-board** (org: Aetheria). Anyone can post and vote without an account; nobody but you can edit. To triage, open Supabase → aetheria-board → Table Editor → `board_items`:

- `status`: `new`, `planned`, `in_progress`, `done`, `wont_fix`, `duplicate`
- `reply`: your public answer, shown under the post
- `hidden`: tick it to remove spam or anything that shouldn't be public

Free Supabase projects pause after about a week with no traffic. If the board says it's resting, restore the project from the Supabase dashboard.

## Mature cards

GitHub's Acceptable Use Policies don't allow sexually explicit content in repositories or Pages sites, and that covers text as well as images. Keep explicit card files on Chub (or wherever you publish them) and list them here as **link-outs**:

```json
{
  "slug": "card-name",
  "name": "Card Name",
  "tagline": "One line for the gallery",
  "world": "",
  "tags": ["Horror"],
  "nsfw": true,
  "cover": "covers/card-name.webp",
  "link": { "label": "Chub", "url": "https://chub.ai/characters/..." },
  "added": "2026-10-29"
}
```

No `file`, so nothing explicit is hosted. The cover should itself be non-explicit; it is still blurred until the visitor taps it or switches on **Unveil mature covers** in Works.

## Creators

`data/creators.json` has two lists. Lodestars are kept to open sites where cards can actually be downloaded, plus the specs and docs.

- `kindred`: people. Fields: `name`, `role`, `blurb`, `tags`, `links` (`[{ "label", "url" }]`), optional `avatar` (image URL; otherwise a constellation sigil is drawn from the name), optional `house: true` for the centre star (you). Creators who share a tag are linked on the chart.
- `lodestars`: resources. Fields: `name`, `kind`, `blurb`, `url`.

Stars place themselves. To pin one, give it `"x"` and `"y"` as percentages of the chart.

## Site text and the Aetheria page

`data/site.json`: the home tagline, footer links, `aetheria.status` and `aetheria.note` (shown until the first release exists), `releases.repo` (where builds are read from) and `board` (the Supabase URL and its publishable key, which is safe to be public because the database only allows posting and voting).

## Bindings

The four themes are Aetheria's own Bindings (Gilt & Slate, Moonlit Silver, Verdigris & Brass, Blossom & Rose Gold), copied from `src/ui/bindings.js` into the top of `assets/css/archive.css`. Visitors pick one from the orb in the header; light-mode visitors start on Blossom. If a Binding changes in Aetheria, change the same tokens here.

## Preview locally

The site loads its data with `fetch` and ES modules, so opening `index.html` straight from disk won't work. From this folder:

```
python -m http.server 8000
```

then open http://localhost:8000.

## Turning on GitHub Pages

The repository must be named `aetrus.github.io` (your username, lower-case). Then **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**. The empty `.nojekyll` file tells Pages to serve the files as they are.

## The Workshop

Everything in the Workshop runs in the visitor's browser. Nothing they open or build is uploaded; drafts and worlds stay in that browser (IndexedDB) until they export them.

**The builders** are Aetheria Experimental's own sheets, ported to the web with the app's logic bundled in (`assets/js/vendor/aetheria/`). Anything that asks a model stays in Aetheria.

- **Character** (`#character`): the character sheet's sections (identity, portrait and motion, personality, living pages, scenario, greetings, example dialogue, voice, advanced prompting, group behaviour, metadata) with the Live card beside it: token anatomy, craft checks and Aetheria's house checklist. Imports PNG, JSON (V1 to V3) and CHARX; exports PNG (`chara` V2 and `ccv3` V3), CHARX and JSON. Portrait cropper; cards without art get a constellation cover. The old `#forge` link lands here.
- **Preset** (`#preset`): the prompt chain in the order it is really sent, choices, dials, panels, variables, display scripts with a live test, styles, request fields and samplers. The inspector shows the assembled request for a character from Aetheria's starter set. Start from the Storyteller, blank, or a SillyTavern preset; exports SillyTavern JSON.
- **Lorebook** (`#lorebook`): volume, entry tree and the activation inspector, plus an activation test that runs Aetheria's lorebook engine on a few lines of story and shows what fires and why. Imports World Info, card books, card PNGs and Aetheria lorebooks; exports World Info or a card's `character_book`, and binds a book into the Character builder. The old `#binder` link lands here.
- **World** (`#world`): the Ages engine. Write a world's book by hand from the engine's vocabulary (or start from Lantern Quay), bake it, then read the map, shape it (places, ways, regions, water, terrain, towns: every change reviewed before it's applied, with undo), keep its worldbook, and export or import `.aetheria-age` files.

**The instruments**:

- **Card Lens**: reads PNG or JSON (V1, V2, V3), shows chunks and spec, a token anatomy (permanent, ephemeral, keyed), and craft checks from the Card Workshop doctrine: frequency adverbs, `{{user}}` integrity in greetings, permanent token budget, prohibition density, lorebook key collisions, unknown macros, greeting count, em-dashes.
- **Blueprints**: the Grimoire's `[[Label: hint]]` templates, plus a Close-Third Description blueprint built on the doctrine. Results go straight into the Character builder.
- **Macro Codex**: the full macro catalogue, plus where each card field lands in the prompt.

When Aetheria's logic changes, rebuild the bundles with `tools/aetheria-core` (its README has the two commands) and commit them.

## The sample cards

Wren Calloway, Isolde Marr and Pell (the Lowmere set) are SFW starter cards that share one world, so the gallery has something to show and the starlines have something to join. Keep them, rewrite them, or delete their PNGs, covers and `data/cards.json` entries.
