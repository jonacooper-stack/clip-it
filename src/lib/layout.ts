import { Platform, useWindowDimensions } from 'react-native';

// On a desktop browser the app renders in a centered, phone-width column (see
// app/_layout.tsx) instead of stretching across the whole window. Native apps
// always use the full screen.
export const APP_MAX_WIDTH = 520;

export function isWideWeb(windowWidth: number): boolean {
  return Platform.OS === 'web' && windowWidth > APP_MAX_WIDTH + 80;
}

// The width the app content actually gets: the window on phones, the column on desktop.
export function useAppWidth(): number {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' ? Math.min(width, APP_MAX_WIDTH) : width;
}
