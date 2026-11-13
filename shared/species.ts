// One way of writing a species.
//
// The identifier writes scientific names itself, and not always the same way:
// "Vulpes vulpes", "Vulpes Vulpes", "Vulpes vulpes fulva" (a subspecies),
// "Vulpes vulpes (juvenile)". For the game these are one species: one
// first-time bonus, one entry in the species count, one line in the journal's
// collection. The server stores the name in this form, and both the server
// and the app compare species by it.
//
// Keep this file free of React Native and Node-only imports.

// Words that are not part of a name ("Larus sp.", "Larus cf. argentatus").
const NOT_A_NAME: ReadonlySet<string> = new Set(['sp', 'spp', 'ssp', 'subsp', 'cf', 'aff', 'var', 'x', 'f', 'nr']);

// "Genus species": the first two words of the name, the genus with a capital
// and the rest in lower case. A name of one word (a genus or a family) stays
// one word. Text that isn't a name at all comes back trimmed and otherwise
// unchanged.
export function canonicalSpecies(name: unknown): string {
  if (typeof name !== 'string') return '';
  const words = name
    .normalize('NFKC')
    .replace(/\([^)]*\)/g, ' ') // notes in brackets: "(juvenile)", an author's name
    .split(/[^\p{L}-]+/u)
    .filter((w) => /\p{L}/u.test(w) && !NOT_A_NAME.has(w.toLowerCase()));
  if (!words.length) return name.trim();
  const genus = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
  return words.length > 1 ? `${genus} ${words[1].toLowerCase()}` : genus;
}

// What two sightings of the same species have in common, whatever their
// names look like on the screen.
export function speciesKey(name: unknown): string {
  return canonicalSpecies(name).toLowerCase();
}

export function sameSpecies(a: unknown, b: unknown): boolean {
  const ka = speciesKey(a);
  return ka !== '' && ka === speciesKey(b);
}
