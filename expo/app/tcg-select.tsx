import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Sparkles, Lock, ChevronRight, ArrowLeft } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { TCGS, type TCGId } from '@/constants/tcgs';
import { useTCG } from '@/providers/TCGProvider';

export default function TCGSelectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const isSwitching = params.from === 'settings';
  const { tcg: current, ready, setTcg } = useTCG();

  const select = useCallback(async (id: TCGId, available: boolean) => {
    if (!available) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Coming Soon', 'This TCG is not yet available. Stay tuned!');
      return;
    }
    try {
      await setTcg(id);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.replace('/(tabs)/(dashboard)');
    } catch (e) {
      console.log('[TCGSelect] save error', e);
    }
  }, [router, setTcg]);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: isSwitching,
          title: 'Choose TCG',
          headerLeft: isSwitching ? () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 4 }}>
              <ArrowLeft size={22} color={Colors.text} />
            </TouchableOpacity>
          ) : undefined,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!isSwitching && (
          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              <Sparkles size={14} color={Colors.primary} />
              <Text style={styles.heroBadgeText}>TCG Collection App</Text>
            </View>
            <Text style={styles.heroTitle}>Pick your game</Text>
            <Text style={styles.heroSubtitle}>
              Track collections, build decks, and log games across your favorite trading card games.
            </Text>
          </View>
        )}

        <View style={styles.list}>
          {TCGS.map((tcg) => {
            const active = current === tcg.id;
            return (
              <TouchableOpacity
                key={tcg.id}
                style={[
                  styles.card,
                  { borderColor: tcg.available ? tcg.color + '60' : Colors.surfaceBorder },
                  active && { borderColor: tcg.color, borderWidth: 2 },
                  !tcg.available && styles.cardLocked,
                ]}
                activeOpacity={0.85}
                onPress={() => select(tcg.id, tcg.available)}
                testID={`tcg-${tcg.id}`}
              >
                <View
                  style={[
                    styles.cardAccent,
                    { backgroundColor: tcg.gradient[0] },
                  ]}
                />
                <View style={styles.cardBody}>
                  <View style={styles.cardHeader}>
                    {tcg.id === 'lorcana' ? (
                      <Image
                        source={require('@/assets/images/icon.png')}
                        style={styles.cardLogo}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={[styles.cardLogoPlaceholder, { backgroundColor: tcg.gradient[0] + '30' }]}>
                        <Text style={[styles.cardLogoLetter, { color: tcg.color }]}>
                          {tcg.shortName.charAt(0)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.cardHeaderText}>
                      <Text style={styles.cardName}>{tcg.name}</Text>
                      <Text
                        style={[
                          styles.cardTagline,
                          tcg.available && { color: tcg.color },
                        ]}
                      >
                        {tcg.tagline}
                      </Text>
                    </View>
                    {tcg.available ? (
                      <ChevronRight size={20} color={tcg.color} />
                    ) : (
                      <View style={styles.lockBadge}>
                        <Lock size={12} color={Colors.textMuted} />
                      </View>
                    )}
                  </View>
                  {active && (
                    <View style={styles.currentBadge}>
                      <Text style={[styles.currentBadgeText, { color: tcg.color }]}>CURRENT</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.footnote}>
          More TCGs are on the way. Tap an unavailable game to register interest.
        </Text>
        <View style={{ height: 24 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  content: { padding: 20, paddingTop: 40, gap: 20 },
  hero: { gap: 10, marginBottom: 4 },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: Colors.primary + '15',
    borderRadius: 999,
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  heroBadgeText: {
    fontSize: 11, fontWeight: '700' as const,
    color: Colors.primary, letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  heroTitle: {
    fontSize: 34, fontWeight: '800' as const,
    color: Colors.text, letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 14, color: Colors.textSecondary, lineHeight: 20,
  },
  list: { gap: 12 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden' as const,
    flexDirection: 'row',
  },
  cardLocked: { opacity: 0.7 },
  cardAccent: { width: 4, alignSelf: 'stretch' },
  cardBody: { flex: 1, padding: 14, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardLogo: { width: 44, height: 44, borderRadius: 10 },
  cardLogoPlaceholder: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  cardLogoLetter: { fontSize: 22, fontWeight: '800' as const },
  cardHeaderText: { flex: 1, gap: 3 },
  cardName: { fontSize: 16, fontWeight: '700' as const, color: Colors.text },
  cardTagline: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' as const },
  lockBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center',
  },
  currentBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Colors.background,
  },
  currentBadgeText: { fontSize: 10, fontWeight: '800' as const, letterSpacing: 1 },
  footnote: {
    fontSize: 12, color: Colors.textMuted,
    textAlign: 'center' as const, paddingHorizontal: 20,
  },
});
