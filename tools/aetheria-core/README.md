# Aetheria core bundles

The Workshop's builders run Aetheria Experimental's own logic in the browser: the card formats, the lorebook engine, the preset chain and assembler, and the Ages world engine. That logic is bundled from the app's source into `assets/js/vendor/aetheria/`. Nothing that asks a model is included.

When the logic changes in Aetheria, rebuild and commit the bundles:

```
cd tools/aetheria-core
npm install
node build.mjs
```

`build.mjs` looks for the source at `C:\Users\gjens\Documents\Antigravity creations\Aetheria Experiemental\src`; pass another path as its argument if it moves. Each file in `entries/` lists the modules one builder uses. A builder that needs more of Aetheria gets another `export … from 'aetheria-src/…'` line there.
