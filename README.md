# Aetheria Archive

The public wing of Aetheria: a card gallery, a star chart of kindred creators, and the Aetheria Grimoire's card-making tools rebuilt for the browser.

Live at **https://aetrus.github.io** once Pages is on. Plain HTML, CSS and ES modules: no build step, no framework, no server.

```
index.html            the shell (header, footer, mobile dock)
404.html              sends stray paths home
data/site.json        tagline, footer links, Aetheria release status
data/cards.json       the gallery manifest
data/creators.json    Kindred (creators) and Lodestars (resources)
cards/                card PNGs (chara + ccv3 chunks inside)
covers/               small thumbnails for the gallery (optional)
assets/css/archive.css   the Bindings and every style
assets/js/            app shell, router, views, and the format libraries
  lib/png.js          PNG tEXt chunk read/write (never re-encodes the image)
  lib/card.js         V1/V2/V3 reading, V2+V3 writing, token anatomy, craft checks
  lib/lorebook.js     World Info <-> character_book (port of the Grimoire's LorebookCodec)
  lib/macros.js       SillyTavern macro catalogue (port of Macros.kt)
  lib/blueprints.js   [[slot]] blueprints (port of BlueprintSlots.kt)
```

## Add a card to the gallery

1. Drop the card PNG into `cards/`.
2. Open the site's **Workshop → Card Lens**, drop the same PNG in, and press **Copy gallery entry**.
3. Paste that entry into the `cards` list in `data/cards.json`. Edit `featured`, `tagline` or `world` if you like.
4. Optional but faster on phones: save a small cover (about 520×780, `.webp` or `.jpg`) in `covers/` and set `"thumb"` to it.
5. Commit and push. Pages updates in a minute or two.

The shortest entry that works is `{ "file": "cards/name.png" }`. The gallery then reads name, tags and stats out of the PNG itself, which costs a full download per card on every visit, so the copied entry is better.

Cards in the same `world` are joined by starlines when you hover one in the gallery, and listed together under "Also from …" on the card page.

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

No `file`, so nothing explicit is hosted. The cover should itself be non-explicit; it is still blurred until the visitor taps it or switches on **Unveil mature covers** in the gallery.

## Creators

`data/creators.json` has two lists.

- `kindred`: people. Fields: `name`, `role`, `blurb`, `tags`, `links` (`[{ "label", "url" }]`), optional `avatar` (image URL; otherwise a constellation sigil is drawn from the name), optional `house: true` for the centre star (you). Creators who share a tag are linked on the chart.
- `lodestars`: resources. Fields: `name`, `kind`, `blurb`, `url`.

Stars place themselves. To pin one, give it `"x"` and `"y"` as percentages of the chart.

## Site text and the Aetheria page

`data/site.json`: the home tagline, footer links, and `aetheria.status` / `aetheria.note` / `aetheria.links`. Add release links there (`[{ "label": "Download for Windows", "url": "…" }]`) and the Aetheria page shows them.

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

Everything in the Workshop runs in the visitor's browser. Cards opened in the Lens or Forge are never uploaded; Forge drafts and custom blueprints live in that browser's local storage.

- **Card Forge**: every V2 field, macro chips, portrait cropper (2:3 or 1:1), embedded lorebook, PNG export with `chara` (V2) and optionally `ccv3` (V3). Cards without a portrait get a constellation cover drawn from their name.
- **Card Lens**: reads PNG or JSON (V1, V2, V3), shows chunks and spec, a token anatomy (permanent, ephemeral, keyed), and craft checks from the Card Workshop doctrine: frequency adverbs, `{{user}}` integrity in greetings, permanent token budget, prohibition density, lorebook key collisions, unknown macros, greeting count, em-dashes.
- **Blueprints**: the Grimoire's `[[Label: hint]]` templates, plus a Close-Third Description blueprint built on the doctrine. Results go straight into the Forge.
- **Lorebook Binder**: standalone World Info ⇄ embedded `character_book`, with positions 2 to 7 kept in `extensions.aetherbot_position`.
- **Macro Codex**: the full macro catalogue, plus where each card field lands in the prompt.

## The sample cards

Wren Calloway, Isolde Marr and Pell (the Lowmere set) are SFW starter cards that share one world, so the gallery has something to show and the starlines have something to join. Keep them, rewrite them, or delete their PNGs, covers and `data/cards.json` entries.
