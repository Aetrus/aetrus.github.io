// Aetheria modules the web World builder uses. Build with: node build.mjs
// (it builds the bake worker beside it and points the bundle at the worker).
//
// The world engine's own service: plans, review, commits, the worldbook, imports, undo.
export {
  agesListWorlds, agesDeleteWorld, agesBakeCompilerProposal, agesPlanWorldDocument,
  agesPlanAuthoringOperation, agesCommitAuthoringPlan, agesPlanFeatureMoves, agesPlanTownLayout,
  agesRenderPlan, agesCommitPlan, agesCancelPlan, agesResolvePlanConflict,
  agesUndoWorld, agesRedoWorld, agesHistoryStatus,
  agesManifest, agesMapStudioData, agesDiagnosticMap, agesWorldDocument, agesSynopsis, agesState,
  agesWorldbook, agesSaveWorldbookEntry, agesSetWorldbookEntryLock, agesSetWorldbookEntryArchived, agesMergeWorldbookEntries,
  agesStageWorldFile, agesResolveWorldImport, agesSetWorldCover,
} from 'aetheria-src/services/agesEngineService.ts';

// The vocabulary a book is written in, and its checks.
export * as dictionary from 'aetheria-src/ages-engine/dictionary.ts';
export { AGE_LANGUAGE_DICTIONARY } from 'aetheria-src/ages-engine/languageDictionary.ts';
export { validateAgeBook } from 'aetheria-src/ages-engine/validate.ts';
export {
  createWorldDocument, updateWorldDocumentFromBook, validateWorldDocument, worldDocumentToBook,
} from 'aetheria-src/ages-engine/worldDocument.ts';
export { generateWorldSynopsis } from 'aetheria-src/ages-engine/compilerV2.ts';

// Baking a new world at the resolution chosen here, and keeping it.
export { bakeWorldAsync } from 'aetheria-src/ages-engine/workerClient.ts';
export { AGE_GENERATOR_VERSION } from 'aetheria-src/ages-engine/runtime.ts';
export { buildDerivedCache } from 'aetheria-src/ages-engine/changePlan.ts';
export { getWorld, putWorld } from 'aetheria-src/ages-engine/storage.ts';
export { worldbookEntryIdForMapEntry } from 'aetheria-src/ages-engine/worldbook.ts';
export { AGE_WORLD_FORMAT_VERSION, ageFileName, serializeWorld } from 'aetheria-src/ages-engine/portable.ts';
export { prepareAtlasDocument } from 'aetheria-src/ages-engine/atlas/document.ts';

// The map: Map Studio's geometry and inspection, the atlas drawn, the atlas in words.
export {
  fitPixelsPerMeter, inspectMapCell, mapScreenRect, nearestMapEntry, niceScaleBar, screenToWorld,
  searchMapEntries, searchableMapEntries, worldToScreen,
} from 'aetheria-src/ages-engine/mapStudio.ts';
export { ATLAS_LOOKS, atlasPicture, drawAtlas } from 'aetheria-src/components/ages/atlas/drawAtlas.js';
export { describeAtlasPoint } from 'aetheria-src/ages-engine/atlas/describe.ts';
export { ATLAS_AUTHOR_KINDS, atlasKindLabel } from 'aetheria-src/ages-engine/atlas/authoring.ts';
export { LAND_KINDS, WATER_KIND_BY_ID, isSettlement } from 'aetheria-src/ages-engine/atlas/catalog.ts';

// The world, in words (pure helpers from Aetheria's own world pane).
export {
  biomeName, coordinate, mapKindWord,
} from 'aetheria-src/components/ages/worldWords.js';
export {
  KIND_ORDER, MADE_BY_MAP, entryLine, firstShelved, kindWord, namesWord, placeWord, seenWord, shelveWorldbook, truthWord,
} from 'aetheria-src/components/ages/worldbookShelf.js';
export { builtNote } from 'aetheria-src/components/ages/builtNote.js';
