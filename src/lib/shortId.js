/**
 * Converts a UUID or any long ID into a short, human-friendly display ID.
 * e.g. "87cb049c-ec12-4fb7-b84e-4639051da063" → "#87CB04"
 * 
 * @param {string} id - The full UUID or ID string
 * @param {number} length - Number of characters to show (default 6)
 * @returns {string} Short ID like "#87CB04"
 */
export function shortId(id, length = 6) {
  if (!id) return "—";
  // Strip hyphens and take the first `length` chars, uppercase
  const clean = String(id).replace(/-/g, "");
  return "#" + clean.slice(0, length).toUpperCase();
}
