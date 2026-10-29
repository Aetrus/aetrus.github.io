// Passing work between views without a round-trip through storage:
// handoff.lens = { file } | { data, bytes, name }
// handoff.forge = { file } | { data, imageBytes }
// handoff.binder = { json, name }
export const handoff = {};

export function take(key) {
  const v = handoff[key];
  delete handoff[key];
  return v;
}
