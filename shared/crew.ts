// Scout: ClipIt's one AI companion, a playful fox-bot (always labeled AI).
// Scout shares facts about what you find, tells you what's happening in
// nature near you each season, and gives you quests. Shared by the app (src/)
// and the server (api/) — keep this file free of React Native and Node-only
// imports.

export type CrewKey = 'scout';

export interface CrewMember {
  key: CrewKey;
  name: string;
  role: string;
  color: string;
  tagline: string;
}

export const COMPANION: CrewMember = {
  key: 'scout',
  name: 'Scout',
  role: 'Your AI field guide',
  color: '#F4812F',
  tagline: 'A friendly fox-bot who shares fun facts, tells you what’s happening in nature near you, and sends you on quests.',
};

export const CREW: Record<CrewKey, CrewMember> = { scout: COMPANION };
export const CREW_KEYS: CrewKey[] = ['scout'];

// Earlier bot accounts (the "Field Crew"), removed by the daily job.
export const RETIRED_CREW = ['hoot', 'moss', 'magpie', 'kestrel'] as const;

// Names players can't take (so nobody can pose as the companion or the team).
export const CREW_RESERVED_NAMES = ['scout', 'dr. hoot', 'dr hoot', 'moss', 'magpie', 'kestrel', 'field crew'];

// ---------- regions ----------
// Players pick a home region (the app can suggest one from the device's
// location, which never leaves the phone). Scout's forecasts are per region.

export type RegionKey =
  | 'northeast'
  | 'mid_atlantic'
  | 'southeast'
  | 'midwest'
  | 'plains'
  | 'texas'
  | 'rockies'
  | 'southwest'
  | 'california'
  | 'pacific_northwest'
  | 'alaska'
  | 'hawaii'
  | 'canada'
  | 'elsewhere';

type Box = [latMin: number, latMax: number, lngMin: number, lngMax: number];

export interface Region {
  key: RegionKey;
  label: string;
  hint: string; // places, so players recognise their region
  describe: string; // how Scout's forecast prompt refers to it
  boxes: Box[]; // rough bounding boxes, checked in REGIONS order, for location suggestions
}

export const REGIONS: Region[] = [
  { key: 'alaska', label: 'Alaska', hint: 'Alaska', describe: 'Alaska, USA', boxes: [[51, 72, -170, -129]] },
  { key: 'hawaii', label: 'Hawaii', hint: 'The Hawaiian Islands', describe: 'Hawaii, USA', boxes: [[18.5, 22.5, -161, -154]] },
  { key: 'pacific_northwest', label: 'Pacific Northwest', hint: 'WA · OR · northern ID', describe: 'the Pacific Northwest of the US (Washington, Oregon, northern Idaho)', boxes: [[42, 49.1, -125, -116.4]] },
  { key: 'california', label: 'California', hint: 'California', describe: 'California, USA', boxes: [[32.5, 42, -124.5, -117]] },
  { key: 'rockies', label: 'Rocky Mountains', hint: 'MT · WY · CO · southern ID', describe: 'the US Rocky Mountains (Montana, Wyoming, Colorado, southern Idaho)', boxes: [[41, 49.1, -117, -104], [37, 41, -109.1, -102]] },
  { key: 'southwest', label: 'Desert Southwest', hint: 'AZ · NM · NV · UT', describe: 'the US desert Southwest and Great Basin (Arizona, New Mexico, Nevada, Utah)', boxes: [[31.3, 42, -120, -103]] },
  { key: 'texas', label: 'Texas & South Central', hint: 'TX · OK', describe: 'Texas and the south-central US', boxes: [[25.8, 34, -106.7, -93.5], [34, 36.6, -103.1, -100]] },
  { key: 'plains', label: 'Great Plains', hint: 'ND · SD · NE · KS · OK', describe: 'the US Great Plains (the Dakotas, Nebraska, Kansas, Oklahoma)', boxes: [[33.6, 49.1, -104.1, -94.4]] },
  { key: 'midwest', label: 'Midwest & Great Lakes', hint: 'MN · WI · MI · IA · IL · IN · OH · MO', describe: 'the US Midwest and Great Lakes', boxes: [[36.62, 49.4, -97.3, -80.5]] },
  { key: 'northeast', label: 'Northeast', hint: 'New England · NY · NJ · PA', describe: 'the northeastern US (New England, New York, New Jersey, Pennsylvania)', boxes: [[39.7, 47.6, -80.6, -66.8]] },
  { key: 'mid_atlantic', label: 'Mid-Atlantic', hint: 'MD · DE · VA · WV · DC', describe: 'the US Mid-Atlantic (Maryland, Delaware, Virginia, West Virginia)', boxes: [[36.5, 39.7, -83.7, -75]] },
  { key: 'southeast', label: 'Southeast', hint: 'NC · SC · GA · FL · AL · TN · KY · LA', describe: 'the southeastern US (the Carolinas, Georgia, Florida, Alabama, Mississippi, Tennessee, Kentucky, Arkansas, Louisiana)', boxes: [[24.4, 36.7, -94.7, -75.3]] },
  { key: 'canada', label: 'Canada', hint: 'Canada', describe: 'southern Canada', boxes: [[41.6, 70, -141, -52]] },
  { key: 'elsewhere', label: 'Somewhere else', hint: 'Outside the US & Canada', describe: 'the temperate Northern Hemisphere', boxes: [] },
];

export const REGION_KEYS = REGIONS.map((r) => r.key);

export function regionByKey(key: string | null | undefined): Region | undefined {
  return REGIONS.find((r) => r.key === key);
}

// Suggest a region from coordinates (approximate; the player confirms).
export function suggestRegion(lat: number, lng: number): RegionKey {
  for (const r of REGIONS) {
    if (r.boxes.some(([a, b, c, d]) => lat >= a && lat <= b && lng >= c && lng <= d)) return r.key;
  }
  return 'elsewhere';
}

// The week a forecast belongs to: the Monday (UTC date) on or before `d`.
export function weekOf(d: Date = new Date()): string {
  const day = d.getUTCDay(); // 0 = Sunday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((day + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

// "a heron" / "an osprey" (good enough for animal names: "a European …", "a unicorn").
export function withArticle(name: string): string {
  const n = name.trim();
  const an = /^[aeiou]/i.test(n) && !/^(eu|uni|use|one)/i.test(n);
  return `${an ? 'an' : 'a'} ${n}`;
}
