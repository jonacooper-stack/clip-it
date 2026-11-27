// ClipIt visual theme, "Trailhead": a national park after a technology
// makeover. A neutral basalt canvas (not green-black), bone text, and bright
// colour that comes in fades: neon greens for progress and "done", a warm
// campfire fade for points and the main action, glacier blue for rare finds.
// Photos stay the star; green is an accent, not the whole app.

export const colors = {
  bg: '#171A21', // basalt canvas
  surface: '#20242D', // slate card
  surfaceAlt: '#2B303B', // granite: chips, inputs, wells, tracks
  text: '#F5F2EA', // bone
  muted: '#B4B9C6',
  faint: '#868D9C',
  ink: '#12161C', // text and icons on a bright fill

  // Greens: neon, used as accents on the neutral canvas
  primary: '#2EE887',
  primaryDark: '#16382F', // deep panel (hero, dark fills)
  primaryDarker: '#102A24',
  primarySoft: '#1D3A33', // soft green well (secondary buttons, chips)
  primaryEdge: '#1D3A33',
  pine: '#0D0F14', // deepest: overlays
  onPrimary: '#D2FBE4', // light green for text sitting on a green well

  // Campfire: points and primary calls to action
  accent: '#FF8A2B',
  accentDark: '#FF6A3D',
  accentSoft: '#3A2A1A',
  accentInk: '#FFC078',

  // Supporting tones
  gold: '#FFD23F',
  goldSoft: '#3A3216',
  clay: '#FF9A6B',
  claySoft: '#3A261F',
  dusk: '#3FA9FF',
  duskSoft: '#1B2C40',
  sky: '#3FA9FF',
  skySoft: '#1B2C40',
  teal: '#19E0D0',
  lime: '#B6F23C',

  danger: '#F0604D',
  dangerSoft: '#3A211E',
  border: 'rgba(245,242,234,0.10)',
  overlay: 'rgba(8,10,14,0.66)',
  white: '#FFFFFF',
};

// Colour fades (drawn with components/Fade). Each has one job.
export const fades = {
  aurora: ['#12D8C4', '#2EE887', '#B6F23C', '#FFD23F'], // progress, rank, big moments
  campfire: ['#FFB02E', '#FF6A3D'], // points, the main button, the camera
  meadow: ['#2EE887', '#B6F23C'], // done; Trail tier
  lagoon: ['#12D8C4', '#2EE887'], // Backcountry tier
  glacier: ['#3FD0FF', '#3F7BFF'], // Rare tier
  goldenHour: ['#FFD23F', '#FFB02E'], // Legendary tier, streaks
  stone: ['#5A6274', '#414858'], // Backyard tier
} as const;
export type FadeName = keyof typeof fades;

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
    shadowColor: '#05070A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  card: {
    shadowColor: '#05070A',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  lifted: {
    shadowColor: '#05070A',
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

// Font families. Titles, numbers and buttons are set in Archivo, a plain,
// confident grotesque in the family of sign lettering; running text stays in
// DM Sans. One display family, so the app keeps a single voice.
export const fonts = {
  display: 'Archivo_800ExtraBold',
  heading: 'Archivo_700Bold',
  headingMd: 'Archivo_600SemiBold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
};
