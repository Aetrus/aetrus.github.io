// What the starter-set generator takes from Aetheria Experimental (as 'aetheria-src/<path>') and from
// this site. Bundled for Node by generate.mjs; nothing here asks a model.

// The set itself: the cards, the book, the preset, the world's book and structure, and their pictures.
export {
  STARTER_CARDS, STARTER_LOREBOOK, STARTER_PRESET, STARTER_VERSION, WORLD_BOOK, WORLD_NAME, WORLD_STRUCTURE,
} from 'aetheria-src/starter/lanternQuay.js';
export { STARTER_PORTRAITS } from 'aetheria-src/starter/portraitData.js';
export { STARTER_COVERS } from 'aetheria-src/starter/coverData.js';
export { STARTER_KEYS } from 'aetheria-src/starter/installStarter.js';
export { STORY_CHOICES, STORY_TONES, STORYTELLER_EDITION } from 'aetheria-src/presets/storyteller.js';

// Cards: how the app reads a PNG card in, keeps it, and writes it out again.
export {
  embedCardInImage, extractCardFromImage, cardFieldsForImport, cardForExport,
} from 'aetheria-src/utils/characterCardUtils.js';

// Lorebooks: how the app keeps a book (normalizeLorebook) and exports it as World Info (stripLorebookMeta).
export * as lore from 'aetheria-src/utils/lorebookUtils.js';

// Presets: the app's import (importSillyTavernPreset, then validateAndFixPreset) and export.
export { importSillyTavernPreset, exportSillyTavernPreset, convertFromSillyTavernPreset } from 'aetheria-src/utils/sillyTavernPresetUtils.js';
export { validateAndFixPreset } from 'aetheria-src/utils/presetShape.js';

// The world: built as the starter set builds it, given its picture, exported, and read back.
export {
  agesBakeCompilerProposal, agesSetWorldCover, agesExportWorld, agesStageWorldFile, agesResolveWorldImport,
} from 'aetheria-src/services/agesEngineService.ts';
export { inspectPortableWorld } from 'aetheria-src/ages-engine/portable.ts';

// A card's character_book, written the way this site's Lorebook builder binds a book into a card
// (SillyTavern's form, which Aetheria's importers read back whole). Aetheria has no writer for one.
export { toCharacterBook, fromJson as lorebookFromJson, canonicalEntry } from '../../assets/js/builders/lorebook/codec.js';

// This site's own card reader (the gallery, the card page and the Card Lens read cards with it).
export { readCardBytes, cardStats } from '../../assets/js/lib/card.js';
export { readTextChunks, listChunks, base64ToUtf8 } from '../../assets/js/lib/png.js';
