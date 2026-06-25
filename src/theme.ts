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
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

// Soft, web-safe elevation. react-native-web maps these shadow props to
// CSS box-shadow, so they render in the browser too.
export const shadow = {
  soft: {
    shadowColor: '#15311F',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  card: {
    shadowColor: '#15311F',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  lifted: {
    shadowColor: '#15311F',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
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

// Font families. Oswald = condensed outfitter character (display/headings/numbers);
// DM Sans = warm, legible body. Loaded in app/_layout.tsx.
export const fonts = {
  display: 'Oswald_700Bold',
  heading: 'Oswald_600SemiBold',
  headingMd: 'Oswald_500Medium',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
};
