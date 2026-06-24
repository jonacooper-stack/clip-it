import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/theme';

interface Props {
  color?: string;
  opacity?: number;
  style?: ViewStyle;
}

// Subtle topographic contour lines — the "field map" texture borrowed from GOHUNT,
// kept faint so it reads as craft, not clutter. Decorative only.
export function TopoBackground({ color = colors.primary, opacity = 0.07, style }: Props) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice">
        {CONTOURS.map((d, i) => (
          <Path key={i} d={d} stroke={color} strokeWidth={1.5} fill="none" opacity={opacity} />
        ))}
      </Svg>
    </View>
  );
}

const CONTOURS = [
  'M-20 36 C 70 6, 150 66, 230 36 S 380 6, 440 46',
  'M-20 84 C 70 54, 150 114, 230 84 S 380 54, 440 94',
  'M-20 132 C 70 102, 150 162, 230 132 S 380 102, 440 142',
  'M-20 180 C 70 150, 150 210, 230 180 S 380 150, 440 190',
  'M-20 228 C 70 198, 150 258, 230 228 S 380 198, 440 238',
];

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
