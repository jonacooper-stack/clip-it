// ClipIt visual theme — GOHUNT-grade rugged outdoor-tech: dark spruce-black
// canvas, topographic texture, blaze accent, real icons. Technical and premium,
// never a literal hunting vibe (catch-and-release, all-ages).

export const colors = {
  bg: '#0E1411', // deep spruce-black canvas
  surface: '#18201A', // elevated card
  surfaceAlt: '#222C24', // chips, inputs, wells
  text: '#ECECE2', // warm off-white
  muted: '#9BA89A',
  faint: '#6B776C',

  // Greens — field green brightened to carry on a dark canvas
  primary: '#35A65F',
  primaryDark: '#103E24', // deep panel (hero, dark fills)
  primaryDarker: '#0A2C19',
  primarySoft: '#1B3727', // soft green WELL on dark (button/chips bg)
  primaryEdge: '#1B3727',
  pine: '#070B08', // deepest — overlays, topo lines on light
  onPrimary: '#CFEAD6', // light green for text/labels sitting on a green fill

  // Blaze reward accent — GOHUNT energy (points + primary CTAs)
  accent: '#F4812F',
  accentDark: '#C25A16',
  accentSoft: '#352311', // warm dark amber wash
  accentInk: '#F2B074', // readable amber on dark

  // Supporting earth + sky tones (tuned for dark)
  gold: '#E6B23C',
  goldSoft: '#2C2410',
  clay: '#D27C4A',
  claySoft: '#34231A',
  dusk: '#7CA9C6',
  duskSoft: '#19262F',
  sky: '#7CA9C6',
  skySoft: '#19262F',

  danger: '#E45B4C',
  dangerSoft: '#341D1A',
  border: 'rgba(255,255,255,0.09)', // subtle hairline on dark
  overlay: 'rgba(0,0,0,0.62)',
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
