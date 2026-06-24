// Clip-It visual theme — "outdoor adventure" hybrid:
// REI-style refined nature palette + GOHUNT rugged credibility + gamified warmth.
// Catch-and-release and all-ages: rugged look, never a literal hunting vibe.

export const colors = {
  bg: '#F4F1E8', // warm archival sand
  surface: '#FFFFFF',
  surfaceAlt: '#ECE6D7',
  text: '#1A2A20', // deep spruce-black
  muted: '#5E6A5C',
  faint: '#97A08F',

  // Greens — REI nature + spruce depth
  primary: '#2A7A45', // field green
  primaryDark: '#16482B', // spruce
  primarySoft: '#E1EDE1',
  pine: '#15271C', // deep spruce — nav, overlays, topo lines

  // Blaze reward accent — GOHUNT energy (points + CTAs)
  accent: '#E07B2E',
  accentSoft: '#FAE4CB',
  accentInk: '#8A4516', // readable text on accentSoft

  // Supporting earth tones
  clay: '#B5532E',
  claySoft: '#F1DBCD',
  dusk: '#3C5666',
  duskSoft: '#DBE4E9',

  danger: '#B23A2A',
  dangerSoft: '#F3D8D1',
  border: '#DCD6C6', // warm hairline
  overlay: 'rgba(13, 22, 16, 0.55)',
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
  md: 14,
  lg: 22,
  pill: 999,
};

// Font sizes.
export const font = {
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
