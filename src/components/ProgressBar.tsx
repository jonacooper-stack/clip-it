import { View, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';
import { Fade } from './Fade';

export function ProgressBar({ value, goal }: { value: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const complete = value >= goal;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: complete ? colors.primary : colors.teal }]}>
        {/* (the fade is as wide as the whole track, so a short bar shows its cool end) */}
        {pct > 0 && <Fade name="aurora" style={{ width: `${10000 / pct}%`, right: undefined }} />}
      </View>
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
  fill: { height: '100%', borderRadius: radius.pill, overflow: 'hidden' },
});
