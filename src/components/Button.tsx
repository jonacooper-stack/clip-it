import { Pressable, Text, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, font, fonts } from '@/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({ label, onPress, variant = 'primary', icon, disabled, loading, style }: Props) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={v.fg} style={styles.icon} />}
          <Text style={[styles.label, { color: v.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
  secondary: { bg: colors.primarySoft, fg: colors.primaryDark, border: colors.primarySoft },
  ghost: { bg: 'transparent', fg: colors.primaryDark, border: colors.border },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  icon: { marginRight: spacing.sm },
  label: { fontSize: font.body, fontFamily: fonts.heading, letterSpacing: 0.4 },
});
