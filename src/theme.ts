// Clip-It visual theme — "outdoor adventure" hybrid:
// Patagonia-grade refined nature palette + GOHUNT rugged credibility +
// Duolingo/Strava gamified energy. Catch-and-release, all-ages: rugged and
// playful, never a literal hunting vibe.

export const colors = {
  bg: '#F3EFE4', // warm archival sand
  surface: '#FFFFFF',
  surfaceAlt: '#EBE5D6',
  text: '#16241B', // deep spruce-black
  muted: '#566254',
  faint: '#8E988A',

  // Greens — refined nature + spruce depth
  primary: '#1F7A45', // field green
  primaryDark: '#13502E', // spruce
  primaryDarker: '#0C3A21', // pressed "lip" under buttons
  primarySoft: '#DCEEDD',
  primaryEdge: '#BCD9BD', // soft button lip
  pine: '#0E2117', // deep spruce — nav, overlays, topo lines

  // Blaze reward accent — GOHUNT / Strava energy (points + primary CTAs)
  accent: '#F07B2D',
  accentDark: '#C25A16', // pressed "lip"
  accentSoft: '#FBE4CC',
  accentInk: '#8A4516', // readable text on accentSoft

  // Supporting earth + sky tones
  gold: '#E6B23C',
  goldSoft: '#F8EBC8',
  clay: '#B5532E',
  claySoft: '#F1DBCD',
  dusk: '#34607A',
  duskSoft: '#D7E5EC',
  sky: '#34607A',
  skySoft: '#D7E5EC',

  danger: '#BE3A2A',
  dangerSoft: '#F4D9D2',
  border: '#E0D9C8', // warm hairline
  overlay: 'rgba(11, 20, 14, 0.58)',
  white: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

// Soft, web-safe elevation. react-native-web maps these shadow props to
// CSS box-shadow, so they render in the browser too.
export const shadow = {
  soft: {
    shadowColor: '#15311F',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  card: {
    shadowColor: '#15311F',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  lifted: {
    shadowColor: '#15311F',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
};

// Font sizes.
export const font = {
  hero: 46,
  display: 34,
  title: 26,
  heading: 20,
  body: 16,
  small: 14,
  tiny: 12,
};

// Font families. One modern family (DM Sans) across the UI — hierarchy comes from
// weight + size + tracking, not a condensed display face. This is the single
// biggest move away from the "kids' game" look toward a clean, modern feel.
// (Oswald is still loaded in app/_layout.tsx but no longer used in the UI.)
export const fonts = {
  display: 'DMSans_700Bold',
  heading: 'DMSans_700Bold',
  headingMd: 'DMSans_500Medium',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
};
