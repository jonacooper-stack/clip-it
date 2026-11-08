import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LegalDoc, legalStyles as s } from '@/components/LegalDoc';
import { colors } from '@/theme';
import { PRIVACY_GLANCE, PRIVACY_SECTIONS } from '@/lib/legal';

// Public at /legal/privacy on the web build — the App Store "Privacy Policy URL".
export default function PrivacyPolicy() {
  return (
    <LegalDoc title="Privacy Policy" sections={PRIVACY_SECTIONS}>
      <View style={s.card}>
        <Text style={s.cardTitle}>Privacy at a glance: what we collect</Text>
        {PRIVACY_GLANCE.collected.map((r) => (
          <View key={r.title} style={s.row}>
            <View style={s.rowIcon}>
              <Ionicons name={r.icon as any} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{r.title}</Text>
              <Text style={s.rowDetail}>{r.detail}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>What we never do</Text>
        {PRIVACY_GLANCE.never.map((t) => (
          <View key={t} style={s.neverRow}>
            <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
            <Text style={s.neverText}>{t}</Text>
          </View>
        ))}
      </View>
    </LegalDoc>
  );
}
