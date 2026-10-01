import React, { useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Eye, Heart, Youtube, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { safeQuery, safeRun } from '@/utils/database';
import { fetchDeckById, parseDreambornId, type LorcanaDeckCardRef } from '@/utils/lorcana-decks-api';
import CardImage from '@/components/CardImage';
import EmptyState from '@/components/EmptyState';

interface ResolvedCard {
  dreamborn: string;
  count: number;
  id: number | null;
  name: string | null;
  cost: number | null;
  type: string | null;
  rarity: string | null;
  ink_color: string | null;
  card_number: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
}

export default function CommunityDeckScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db, isReady, hasCatalog } = useDatabase();

  const { data: deck, isLoading, error } = useQuery({
    queryKey: ['community-deck', uuid],
    queryFn: () => fetchDeckById(uuid as string),
    enabled: !!uuid,
  });

  const { data: resolved } = useQuery({
    queryKey: ['community-deck-resolved', uuid, !!db, deck?.cards?.length ?? 0],
    queryFn: async (): Promise<ResolvedCard[]> => {
      if (!db || !deck) return [];
      const rows: ResolvedCard[] = [];
      for (const ref of deck.cards) {
        const parsed = parseDreambornId(ref.dreamborn);
        if (!parsed) {
          rows.push({ ...emptyResolved(ref) });
          continue;
        }
        const found = await safeQuery<{
          id: number; name: string; cost: number | null; type: string | null;
          rarity: string | null; ink_color: string | null; card_number: string | null;
          image_url: string | null; thumbnail_url: string | null;
        }>(
          db,
          `SELECT c.id, c.name, c.cost, c.type, c.rarity, c.ink_color, c.card_number,
                  i.image_url, i.thumbnail_url
           FROM cards c
           LEFT JOIN images i ON i.card_id = c.id
           WHERE c.set_code = ? AND c.card_number = ?
           LIMIT 1`,
          [parsed.setCode, parsed.cardNum]
        );
        const r = found[0];
        if (r) {
          rows.push({ dreamborn: ref.dreamborn, count: ref.count, ...r });
        } else {
          rows.push(emptyResolved(ref));
        }
      }
      return rows;
    },
    enabled: isReady && !!db && hasCatalog && !!deck,
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!db || !deck || !resolved) throw new Error('Not ready');
      const validCards = resolved.filter(c => c.id !== null);
      if (validCards.length === 0) throw new Error('No matching cards found in catalog');
      const inkProfile = deriveInkProfile(resolved);
      const result = await db.runAsync(
        `INSERT INTO decks (name, format, ink_profile, note) VALUES (?, ?, ?, ?)`,
        [deck.name, 'Constructed', inkProfile, `Imported from ${deck.creator_name ?? 'community'} (api-lorcana.com)`]
      );
      const deckId = result.lastInsertRowId;
      for (const c of validCards) {
        await safeRun(
          db,
          `INSERT INTO deck_cards (deck_id, card_id, qty, is_sideboard) VALUES (?, ?, ?, 0)
           ON CONFLICT(deck_id, card_id, is_sideboard) DO UPDATE SET qty = excluded.qty`,
          [deckId, c.id, c.count]
        );
      }
      return { deckId, count: validCards.length, missing: resolved.length - validCards.length };
    },
    onSuccess: ({ deckId, count, missing }) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
      Alert.alert(
        'Deck Imported',
        `Added ${count} cards${missing > 0 ? ` (${missing} card${missing === 1 ? '' : 's'} not in your catalog — sync the latest set if needed)` : ''}.`,
        [{ text: 'View Deck', onPress: () => router.replace(`/deck/${deckId}`) }, { text: 'OK' }]
      );
    },
    onError: (e: Error) => {
      Alert.alert('Import Failed', e.message);
    },
  });

  const sorted = useMemo(() => {
    if (!resolved) return [];
    return [...resolved].sort((a, b) => {
      const at = a.type === 'Location' ? 2 : a.type === 'Item' ? 1 : 0;
      const bt = b.type === 'Location' ? 2 : b.type === 'Item' ? 1 : 0;
      if (at !== bt) return at - bt;
      return (a.cost ?? 0) - (b.cost ?? 0);
    });
  }, [resolved]);

  const totals = useMemo(() => {
    if (!resolved) return { total: 0, missing: 0 };
    let total = 0; let missing = 0;
    for (const c of resolved) {
      total += c.count;
      if (c.id === null) missing += c.count;
    }
    return { total, missing };
  }, [resolved]);

  const renderCard = useCallback(({ item }: { item: ResolvedCard }) => {
    const rarityColor = Colors.rarity[item.rarity ?? ''] ?? Colors.textSecondary;
    const inkColor = Colors.ink[item.ink_color ?? ''] ?? Colors.textMuted;
    const isMissing = item.id === null;
    const content = (
      <>
        {item.id !== null ? (
          <CardImage cardId={item.id} imageUrl={item.image_url} thumbnailUrl={item.thumbnail_url} size="small" />
        ) : (
          <View style={styles.placeholderImg}>
            <Text style={styles.placeholderText}>?</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={[styles.cardName, isMissing && { color: Colors.textMuted }]} numberOfLines={1}>
            {item.name ?? `Unknown (${item.dreamborn})`}
          </Text>
          <View style={styles.metaRow}>
            {item.ink_color ? <View style={[styles.dot, { backgroundColor: inkColor }]} /> : null}
            {item.cost !== null ? <Text style={styles.cost}>{item.cost}</Text> : null}
            {item.type ? <Text style={styles.type}>{item.type}</Text> : null}
            {item.rarity ? (
              <Text style={[styles.rarity, { color: rarityColor }]}>{item.rarity}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.qtyBadge}>
          <Text style={styles.qtyText}>×{item.count}</Text>
        </View>
      </>
    );
    if (isMissing) {
      return <View style={[styles.cardRow, styles.cardRowMissing]}>{content}</View>;
    }
    return (
      <TouchableOpacity
        style={styles.cardRow}
        onPress={() => item.id !== null && router.push(`/card/${item.id}`)}
        activeOpacity={0.7}
      >
        {content}
      </TouchableOpacity>
    );
  }, [router]);

  if (error) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Deck' }} />
        <EmptyState
          icon={<Layers size={28} color={Colors.textMuted} />}
          title="Couldn't load deck"
          message={(error as Error).message}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: deck?.name ?? 'Community Deck' }} />
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>{deck?.name ?? '…'}</Text>
        {deck?.creator_name ? (
          <Text style={styles.creator}>by {deck.creator_name}</Text>
        ) : null}
        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Layers size={12} color={Colors.textSecondary} />
            <Text style={styles.statText}>{totals.total} cards</Text>
          </View>
          {deck?.views !== undefined ? (
            <View style={styles.statChip}>
              <Eye size={12} color={Colors.textSecondary} />
              <Text style={styles.statText}>{deck.views}</Text>
            </View>
          ) : null}
          {deck?.likes !== undefined ? (
            <View style={styles.statChip}>
              <Heart size={12} color={Colors.textSecondary} />
              <Text style={styles.statText}>{deck.likes}</Text>
            </View>
          ) : null}
          {deck?.youtube ? (
            <TouchableOpacity
              style={[styles.statChip, { backgroundColor: '#ff000020', borderColor: '#ff000040' }]}
              onPress={() => Linking.openURL(`https://youtu.be/${deck.youtube}`)}
            >
              <Youtube size={12} color="#ff5555" />
              <Text style={[styles.statText, { color: '#ff8888' }]}>Watch</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {totals.missing > 0 ? (
          <Text style={styles.missingNote}>
            {totals.missing} card{totals.missing === 1 ? '' : 's'} not in your catalog yet
          </Text>
        ) : null}
      </View>

      {deck ? (
        <TouchableOpacity
          style={[styles.importBtn, (!resolved || importMutation.isPending) && { opacity: 0.6 }]}
          onPress={() => importMutation.mutate()}
          disabled={!resolved || importMutation.isPending}
        >
          <Plus size={16} color={Colors.background} />
          <Text style={styles.importBtnText}>
            {importMutation.isPending ? 'Importing…' : 'Import as My Deck'}
          </Text>
        </TouchableOpacity>
      ) : null}

      <FlatList
        data={sorted}
        renderItem={renderCard}
        keyExtractor={(item, idx) => `${item.dreamborn}-${idx}`}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : null
        }
      />
    </View>
  );
}

function emptyResolved(ref: LorcanaDeckCardRef): ResolvedCard {
  return {
    dreamborn: ref.dreamborn, count: ref.count, id: null, name: null,
    cost: null, type: null, rarity: null, ink_color: null, card_number: null,
    image_url: null, thumbnail_url: null,
  };
}

function deriveInkProfile(cards: ResolvedCard[]): string {
  const counts = new Map<string, number>();
  for (const c of cards) {
    if (!c.ink_color) continue;
    counts.set(c.ink_color, (counts.get(c.ink_color) ?? 0) + c.count);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([ink]) => ink)
    .join(', ');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 6,
  },
  title: { fontSize: 20, fontWeight: '700' as const, color: Colors.text },
  creator: { fontSize: 13, color: Colors.textSecondary },
  statsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' as const, marginTop: 4 },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  statText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' as const },
  missingNote: { fontSize: 11, color: Colors.warning, marginTop: 2 },
  importBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingVertical: 12,
    backgroundColor: Colors.primary,
    borderRadius: 12,
  },
  importBtnText: { color: Colors.background, fontWeight: '700' as const, fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  cardRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 10,
    padding: 8, gap: 10,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  cardRowMissing: { opacity: 0.55, borderStyle: 'dashed' as const },
  placeholderImg: {
    width: 44, height: 60, borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center',
  },
  placeholderText: { color: Colors.textMuted, fontSize: 18, fontWeight: '700' as const },
  info: { flex: 1, gap: 3 },
  cardName: { fontSize: 14, fontWeight: '600' as const, color: Colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cost: { fontSize: 12, fontWeight: '700' as const, color: Colors.textSecondary },
  type: { fontSize: 11, color: Colors.textMuted },
  rarity: { fontSize: 11, fontWeight: '700' as const, marginLeft: 'auto' as const },
  qtyBadge: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, backgroundColor: Colors.primary + '25',
  },
  qtyText: { fontSize: 12, fontWeight: '700' as const, color: Colors.primary },
});
