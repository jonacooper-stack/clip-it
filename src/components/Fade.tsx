import { useId } from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors, fades, type FadeName } from '@/theme';

// A colour fade that fills its parent (which should clip: overflow hidden and
// a border radius). Drawn with SVG, which the app already ships, so it works
// in an over-the-air update.
export function Fade({ name, angle = 'across', style }: { name: FadeName; angle?: 'across' | 'diagonal' | 'down'; style?: StyleProp<ViewStyle> }) {
  const id = `fade-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const stops = fades[name];
  const to = angle === 'down' ? { x2: '0', y2: '1' } : angle === 'diagonal' ? { x2: '1', y2: '1' } : { x2: '1', y2: '0' };
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" {...to}>
            {stops.map((c, i) => (
              <Stop key={c + i} offset={`${(i / (stops.length - 1)) * 100}%`} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

// The soft glow at the top of a screen: teal on one side, lime on the other,
// fading into the canvas. Decorative only.
export function SkyGlow({ height = 260 }: { height?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View pointerEvents="none" style={[styles.glow, { height }]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={`l${id}`} cx="5%" cy="-10%" rx="85%" ry="95%" fx="5%" fy="-10%">
            <Stop offset="0%" stopColor={colors.teal} stopOpacity={0.3} />
            <Stop offset="100%" stopColor={colors.teal} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`r${id}`} cx="92%" cy="-8%" rx="85%" ry="100%" fx="92%" fy="-8%">
            <Stop offset="0%" stopColor={colors.lime} stopOpacity={0.2} />
            <Stop offset="100%" stopColor={colors.lime} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#l${id})`} />
        <Rect x="0" y="0" width="100" height="100" fill={`url(#r${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 0, left: 0, right: 0 },
});
