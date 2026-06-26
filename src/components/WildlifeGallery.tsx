import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { colors, spacing, font, fonts, radius } from '@/theme';
import { GALLERY } from '@/lib/galleryPhotos';

// A horizontally-scrolling strip of real wildlife photos — branding for the
// welcome screen. Each card is the same height and exactly as wide as its
// photo's aspect ratio, so `cover` fills it with no crop — the whole animal
// shows instead of a zoomed-in slice.
const CARD_H = 150;

export function WildlifeGallery({ limit }: { limit?: number }) {
  const items = limit ? GALLERY.slice(0, limit) : GALLERY;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map((g) => {
        const w = Math.round(CARD_H * g.aspect);
        return (
          <View key={g.label} style={[styles.card, { width: w }]}>
            <Image source={g.photo} style={{ width: w, height: CARD_H }} resizeMode="cover" />
            <View style={styles.labelWrap}>
              <Text style={styles.label} numberOfLines={1}>
                {g.label}
              </Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingRight: spacing.lg, gap: spacing.sm },
  card: {
    height: CARD_H,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  labelWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: 'rgba(7,11,8,0.55)',
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
