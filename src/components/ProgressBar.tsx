import { View, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';

export function ProgressBar({ value, goal }: { value: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const complete = value >= goal;
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          { width: `${pct}%`, backgroundColor: complete ? colors.primary : colors.accent },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
});
