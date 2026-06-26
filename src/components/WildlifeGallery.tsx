import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { GALLERY } from '@/lib/galleryPhotos';

// A horizontally-scrolling strip of real wildlife photos — branding for the
// welcome screen ("here's what's out there").
export function WildlifeGallery() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {GALLERY.map((g) => (
        <View key={g.label} style={styles.card}>
          <Image source={g.photo} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={styles.labelWrap}>
            <Text style={styles.label} numberOfLines={1}>
              {g.label}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingRight: spacing.lg, gap: spacing.sm },
  card: {
    width: 132,
    height: 172,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'flex-end',
  },
  labelWrap: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    backgroundColor: 'rgba(7,11,8,0.5)',
  },
  label: {
    fontSize: font.small,
    fontFamily: fonts.heading,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
