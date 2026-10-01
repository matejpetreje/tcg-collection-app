import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Check, X, Layers, Filter } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { useTCG } from '@/providers/TCGProvider';
import { getTCGPresentation } from '@/tcg/presentation';
import { safeQuery, safeRun } from '@/utils/database';
import CardImage from '@/components/CardImage';
import type { CardWithDetails, InkStats } from '@/types/database';

export default function AddCardScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db, hasCatalog } = useDatabase();
  const { tcg } = useTCG();
  const presentation = tcg ? getTCGPresentation(tcg) : null;
  const [search, setSearch] = useState<string>('');
  const [addedCards, setAddedCards] = useState<Map<number, number>>(new Map());
  const [filterInk, setFilterInk] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const deckIdNum = parseInt(deckId ?? '0', 10);

  const { data: deckInkColors } = useQuery({
    queryKey: ['deck-ink-colors', tcg, deckIdNum, !!db],
    queryFn: async () => {
      if (!db) return [];
      const result = await safeQuery<InkStats>(
        db,
        `SELECT DISTINCT c.ink_color, COUNT(*) as count
         FROM deck_cards dc
         JOIN cards c ON c.id = dc.card_id
         WHERE dc.deck_id = ? AND c.ink_color IS NOT NULL
         GROUP BY c.ink_color
         ORDER BY count DESC`,
        [deckIdNum]
      );
      return result.map(r => r.ink_color);
    },
    enabled: !!db && deckIdNum > 0,
  });

  const { data: otherDeckCards } = useQuery({
    queryKey: ['other-deck-cards', tcg, deckIdNum, !!db],
    queryFn: async () => {
      if (!db) return new Map<number, string[]>();
      const result = await safeQuery<{ card_id: number; deck_name: string }>(
        db,
        `SELECT dc.card_id, d.name as deck_name
         FROM deck_cards dc
         JOIN decks d ON d.id = dc.deck_id
         WHERE dc.deck_id != ?`,
        [deckIdNum]
      );
      const map = new Map<number, string[]>();
      result.forEach(r => {
        const existing = map.get(r.card_id) ?? [];
        if (!existing.includes(r.deck_name)) {
          existing.push(r.deck_name);
        }
        map.set(r.card_id, existing);
      });
      return map;
    },
    enabled: !!db && deckIdNum > 0,
  });

  const deckColorLimit = presentation?.deckColorLimit ?? null;
  const hasMaxColors = deckColorLimit !== null && (deckInkColors?.length ?? 0) >= deckColorLimit;
  const allowedInks = hasMaxColors ? deckInkColors ?? [] : (presentation?.deckColors ?? []);

  const availableInks = useMemo(() => {
    if (hasMaxColors) return deckInkColors ?? [];
    return presentation?.deckColors ?? [];
  }, [hasMaxColors, deckInkColors, presentation]);

  const { data: cards, isLoading } = useQuery({
    queryKey: ['add-card-search', tcg, search, filterInk, filterType, !!db],
    queryFn: async () => {
      if (!db) return [];

      let sql = `SELECT c.id, c.name, c.version, c.ink_color, c.cost, c.rarity, c.type, c.set_code, c.inkable,
              c.card_number, c.strength, c.willpower, c.lore,
              COALESCE(uc.qty, 0) as qty, COALESCE(uc.qty_foil, 0) as qty_foil,
              COALESCE(uc.qty_enchanted, 0) as qty_enchanted,
              i.image_url, i.thumbnail_url,
              COALESCE(uc.qty, 0) + COALESCE(uc.qty_foil, 0) + COALESCE(uc.qty_enchanted, 0) as total_owned,
              s.name as set_name, s.release_date
       FROM cards c
       LEFT JOIN user_collection uc ON uc.card_id = c.id
       LEFT JOIN images i ON i.card_id = c.id
       LEFT JOIN sets s ON s.set_code = c.set_code
       WHERE 1=1`;

      const params: unknown[] = [];

      if (search.trim().length >= 2) {
        sql += ` AND c.name LIKE ?`;
        params.push(`%${search.trim()}%`);
      } else {
        sql += ` AND (COALESCE(uc.qty, 0) + COALESCE(uc.qty_foil, 0) + COALESCE(uc.qty_enchanted, 0)) > 0`;
      }

      if (filterInk) {
        sql += ` AND c.ink_color = ?`;
        params.push(filterInk);
      } else if (hasMaxColors && allowedInks.length > 0) {
        sql += ` AND c.ink_color IN (${allowedInks.map(() => '?').join(',')})`;
        params.push(...allowedInks);
      }

      if (filterType) {
        sql += ` AND c.type = ?`;
        params.push(filterType);
      }

      sql += ` ORDER BY total_owned DESC, c.name ASC LIMIT 60`;

      return safeQuery<CardWithDetails>(db, sql, params);
    },
    enabled: !!db && hasCatalog,
  });

  const { mutate: doAddCard } = useMutation({
    mutationFn: async (cardId: number) => {
      if (!db) return;
      await safeRun(
        db,
        `INSERT INTO deck_cards (deck_id, card_id, qty, is_sideboard) VALUES (?, ?, 1, 0)
         ON CONFLICT(deck_id, card_id, is_sideboard) DO UPDATE SET qty = qty + 1`,
        [deckIdNum, cardId]
      );
      await safeRun(db, "UPDATE decks SET updated_at = datetime('now') WHERE id = ?", [deckIdNum]);
    },
    onSuccess: (_, cardId) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setAddedCards(prev => {
        const next = new Map(prev);
        next.set(cardId, (next.get(cardId) ?? 0) + 1);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['deck-cards', tcg, deckIdNum] });
      void queryClient.invalidateQueries({ queryKey: ['deck-stats', tcg, deckIdNum] });
      void queryClient.invalidateQueries({ queryKey: ['deck-ink-colors', tcg, deckIdNum] });
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
    },
  });

  const renderCard = useCallback(({ item }: { item: CardWithDetails }) => {
    const inkColor = Colors.ink[item.ink_color ?? ''] ?? Colors.textMuted;
    const addedCount = addedCards.get(item.id) ?? 0;
    const isAdded = addedCount > 0;
    const inOtherDecks = otherDeckCards?.get(item.id);
    const totalOwned = item.total_owned ?? 0;

    return (
      <View style={cardStyles.row}>
        <TouchableOpacity style={cardStyles.main} onPress={() => router.push(`/card/${item.id}`)}>
          <CardImage cardId={item.id} imageUrl={item.image_url} thumbnailUrl={item.thumbnail_url} size="small" />
          <View style={cardStyles.info}>
            <Text style={cardStyles.name} numberOfLines={1}>{item.name}</Text>
            <View style={cardStyles.meta}>
              {item.ink_color ? <View style={[cardStyles.inkDot, { backgroundColor: inkColor }]} /> : null}
              {item.cost !== null && <Text style={cardStyles.cost}>{item.cost}</Text>}
              <Text style={cardStyles.type}>{item.type ?? ''}</Text>
              {item.card_number ? <Text style={cardStyles.cardNum}>#{item.card_number}</Text> : null}
            </View>
            <View style={cardStyles.extraRow}>
              {totalOwned > 0 && (
                <View style={cardStyles.ownedBadge}>
                  <Text style={cardStyles.ownedText}>Owned: {totalOwned}</Text>
                </View>
              )}
              {inOtherDecks && inOtherDecks.length > 0 && (
                <View style={cardStyles.inDeckBadge}>
                  <Layers size={10} color={Colors.warning} />
                  <Text style={cardStyles.inDeckText} numberOfLines={1}>
                    {inOtherDecks.length === 1 ? inOtherDecks[0] : `${inOtherDecks.length} decks`}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
        <View style={cardStyles.addArea}>
          {isAdded && (
            <Text style={cardStyles.addedCount}>+{addedCount}</Text>
          )}
          <TouchableOpacity
            style={[cardStyles.addBtn, isAdded && cardStyles.addBtnDone]}
            onPress={() => doAddCard(item.id)}
          >
            {isAdded ? <Check size={16} color={Colors.success} /> : <Plus size={16} color={Colors.text} />}
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [addedCards, doAddCard, router, otherDeckCards]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Add Card to Deck' }} />

      <View style={styles.searchBox}>
        <Search size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search cards..."
          placeholderTextColor={Colors.textMuted}
          autoFocus
          testID="add-card-search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <X size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filtersArea}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <Filter size={14} color={Colors.textMuted} style={{ marginRight: 4 }} />
          {availableInks.map(ink => {
            const color = Colors.ink[ink] ?? Colors.textMuted;
            const active = filterInk === ink;
            return (
              <TouchableOpacity
                key={ink}
                style={[styles.filterChip, active && { backgroundColor: color + '25', borderColor: color }]}
                onPress={() => setFilterInk(active ? null : ink)}
              >
                <View style={[styles.filterDot, { backgroundColor: color }]} />
                <Text style={[styles.filterChipText, active && { color }]}>{ink}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {(presentation?.cardTypes ?? []).map(type => {
            const active = filterType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilterType(active ? null : type)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{type}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {hasMaxColors && (
        <View style={styles.colorNotice}>
          <Text style={styles.colorNoticeText}>
            Deck has reached its {presentation?.deckColorLabel?.toLowerCase() ?? 'color'} limit — showing only {allowedInks.join(' & ')} cards
          </Text>
        </View>
      )}

      {search.trim().length < 2 && (
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionLabelText}>Your owned cards</Text>
        </View>
      )}

      <FlatList
        data={cards}
        renderItem={renderCard}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : search.trim().length >= 2 ? (
            <Text style={styles.emptyText}>No cards found</Text>
          ) : (
            <Text style={styles.emptyText}>No owned cards yet. Search to find cards.</Text>
          )
        }
      />
    </View>
  );
}

const cardStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inkDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  cost: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  type: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  cardNum: {
    fontSize: 10,
    color: Colors.textMuted,
    marginLeft: 'auto' as const,
  },
  extraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  ownedBadge: {
    backgroundColor: Colors.accent + '20',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  ownedText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.accent,
  },
  inDeckBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.warning + '18',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  inDeckText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.warning,
    maxWidth: 80,
  },
  addArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addedCount: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.success,
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  addBtnDone: {
    backgroundColor: Colors.success + '20',
    borderColor: Colors.success,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    margin: 16,
    marginBottom: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  searchInput: {
    flex: 1,
    height: 42,
    color: Colors.text,
    fontSize: 15,
  },
  filtersArea: {
    gap: 6,
    marginBottom: 4,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 6,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  filterChipActive: {
    backgroundColor: Colors.primary + '25',
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.primary,
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  colorNotice: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: Colors.warning + '12',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  colorNoticeText: {
    fontSize: 11,
    fontWeight: '500' as const,
    color: Colors.warning,
  },
  sectionLabel: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sectionLabelText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  emptyText: {
    textAlign: 'center' as const,
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: 40,
  },
});
