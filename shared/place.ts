// Where a sighting was taken, as it is saved to the player's account.
//
// The phone knows the exact spot and keeps it. What leaves the phone is the
// place to two decimals of a degree: a square about a kilometre across. That
// is as much as the app ever shows ("~44.10, -72.50"), and it means the
// server never holds the exact location of anyone's sighting.
//
// Keep this file free of React Native and Node-only imports.

export function roundPlace(n: number): number {
  return Math.round(n * 100) / 100;
}

// The approximate place for a pair of coordinates, or null if they aren't a
// real position.
export function approxPlace(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: roundPlace(lat), lng: roundPlace(lng) };
}
