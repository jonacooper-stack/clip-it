import { Pressable, Text, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, font, fonts } from '@/theme';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  size?: 'md' | 'lg';
  style?: ViewStyle;
}

// Tactile "press-down" button: a solid face sitting on a darker bottom lip, so it
// reads as a physical, satisfying control (Duolingo/Strava energy). Pressing sinks
// the face onto the lip.
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  size = 'lg',
  style,
}: Props) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        size === 'md' && styles.md,
        { backgroundColor: v.bg, borderBottomColor: v.lip },
        v.outline && styles.outline,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={20} color={v.fg} style={styles.icon} />}
          <Text style={[styles.label, size === 'md' && styles.labelMd, { color: v.fg }]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const VARIANTS: Record<
  Variant,
  { bg: string; fg: string; lip: string; outline?: boolean }
> = {
  primary: { bg: colors.primary, fg: colors.white, lip: colors.primaryDarker },
  accent: { bg: colors.accent, fg: colors.white, lip: colors.accentDark },
  secondary: { bg: colors.primarySoft, fg: colors.primaryDark, lip: colors.primaryEdge },
  ghost: { bg: colors.surface, fg: colors.primaryDark, lip: colors.border, outline: true },
  danger: { bg: colors.danger, fg: colors.white, lip: '#8C2C20' },
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderBottomWidth: 4,
    minHeight: 56,
  },
  md: { paddingVertical: 12, minHeight: 48, borderRadius: radius.md },
  outline: { borderWidth: 1.5, borderColor: colors.border },
  pressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2, opacity: 0.96 },
  disabled: { opacity: 0.45 },
  icon: { marginRight: spacing.sm },
  label: {
    fontSize: font.body + 1,
    fontFamily: fonts.heading,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  labelMd: { fontSize: font.body },
});
