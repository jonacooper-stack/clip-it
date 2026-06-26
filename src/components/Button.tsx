import { Pressable, Text, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, font, fonts, shadow } from '@/theme';

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

// Clean, modern button: a solid (or outlined) face with a soft shadow and a subtle
// press state — no 3D "lip", which read as a kids'-game control.
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
        { backgroundColor: v.bg },
        v.filled && shadow.soft,
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
          {icon && (
            <Ionicons name={icon} size={size === 'md' ? 18 : 20} color={v.fg} style={styles.icon} />
          )}
          <Text style={[styles.label, size === 'md' && styles.labelMd, { color: v.fg }]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const VARIANTS: Record<Variant, { bg: string; fg: string; filled?: boolean; outline?: boolean }> = {
  primary: { bg: colors.primary, fg: colors.white, filled: true },
  accent: { bg: colors.accent, fg: colors.white, filled: true },
  secondary: { bg: colors.primarySoft, fg: colors.primaryDark },
  ghost: { bg: colors.surface, fg: colors.primaryDark, outline: true },
  danger: { bg: colors.danger, fg: colors.white, filled: true },
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    minHeight: 54,
  },
  md: { paddingVertical: 11, minHeight: 46, borderRadius: radius.md },
  outline: { borderWidth: 1.5, borderColor: colors.border },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
  icon: { marginRight: spacing.sm },
  label: {
    fontSize: font.body + 1,
    fontFamily: fonts.bodyBold,
    letterSpacing: 0.2,
  },
  labelMd: { fontSize: font.body },
});
