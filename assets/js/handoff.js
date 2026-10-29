// Passing work between views without a round-trip through storage:
// handoff.lens = { file } | { data, bytes, name }
// handoff.forge = { file } | { data, imageBytes }
// handoff.binder = { json, name }
// handoff.world = { text, name }   an .aetheria-age package, opened for review in the World builder
export const handoff = {};

export function take(key) {
  const v = handoff[key];
  delete handoff[key];
  return v;
}
