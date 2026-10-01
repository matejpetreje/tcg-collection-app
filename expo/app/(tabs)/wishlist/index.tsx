import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Heart, Star, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { useTCG } from '@/providers/TCGProvider';
import { safeQuery, safeRun } from '@/utils/database';
import CardImage from '@/components/CardImage';
import EmptyState from '@/components/EmptyState';
import type { WishlistWithCard } from '@/types/database';

const PRIORITY_LABELS: Record<number, string> = { 1: 'High', 2: 'Medium', 3: 'Low' };
const PRIORITY_COLORS: Record<number, string> = { 1: Colors.danger, 2: Colors.warning, 3: Colors.textMuted };

export default function WishlistScreen() {
  const { db, isReady, hasCatalog } = useDatabase();
  const { tcg } = useTCG();
  const isYugioh = tcg === 'yugioh';
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filterPriority, setFilterPriority] = useState<number | null>(null);
  const [filterMissing, setFilterMissing] = useState<boolean>(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ['wishlist', tcg, filterPriority, filterMissing, !!db],
    queryFn: async () => {
      if (!db) return [];
      let sql = `SELECT w.*, c.name, c.ink_color, c.cost, c.rarity, c.set_code,
                        i.image_url, i.thumbnail_url,
                        COALESCE(uc.qty, 0) as qty, COALESCE(uc.qty_foil, 0) as qty_foil,
                        COALESCE(uc.qty_enchanted, 0) as qty_enchanted,
                        COALESCE(uc.qty_epic, 0) as qty_epic, COALESCE(uc.qty_promo, 0) as qty_promo,
                        COALESCE(uc.qty_iconic, 0) as qty_iconic, COALESCE(uc.qty_play, 0) as qty_play
                 FROM wishlist w
                 JOIN cards c ON c.id = w.card_id
                 LEFT JOIN images i ON i.card_id = w.card_id
                 LEFT JOIN user_collection uc ON uc.card_id = w.card_id
                 WHERE 1=1`;
      const params: unknown[] = [];

      if (filterPriority !== null) {
        sql += ' AND w.priority = ?';
        params.push(filterPriority);
      }
      if (filterMissing) {
        sql += ' AND (COALESCE(uc.qty, 0) + COALESCE(uc.qty_foil, 0) + COALESCE(uc.qty_enchanted, 0) + COALESCE(uc.qty_epic, 0) + COALESCE(uc.qty_promo, 0) + COALESCE(uc.qty_iconic, 0) + COALESCE(uc.qty_play, 0)) = 0';
      }
      sql += ' ORDER BY w.priority ASC, c.name ASC';
      return safeQuery<WishlistWithCard>(db, sql, params);
    },
    enabled: isReady && !!db && hasCatalog,
  });

  const { mutate: doChangePriority } = useMutation({
    mutationFn: async ({ cardId, priority }: { cardId: number; priority: number }) => {
      if (!db) return;
      await safeRun(db, 'UPDATE wishlist SET priority = ? WHERE card_id = ?', [priority, cardId]);
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    },
  });

  const { mutate: doAcquireCard } = useMutation({
    mutationFn: async ({ cardId, targetQty }: { cardId: number; targetQty: number }) => {
      if (!db) return;
      await safeRun(
        db,
        `INSERT INTO user_collection (card_id, qty, updated_at) VALUES (?, 1, datetime('now'))
         ON CONFLICT(card_id) DO UPDATE SET qty = qty + 1, updated_at = datetime('now')`,
        [cardId]
      );
      const newTarget = targetQty - 1;
      if (newTarget <= 0) {
        await safeRun(db, 'DELETE FROM wishlist WHERE card_id = ?', [cardId]);
      } else {
        await safeRun(db, 'UPDATE wishlist SET target_qty = ? WHERE card_id = ?', [newTarget, cardId]);
      }
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      queryClient.invalidateQueries({ queryKey: ['collection'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  const renderItem = useCallback(({ item }: { item: WishlistWithCard }) => {
    const inkColor = Colors.ink[item.ink_color ?? ''] ?? Colors.textMuted;
    const priorityColor = PRIORITY_COLORS[item.priority] ?? Colors.textMuted;
    const totalOwned = item.qty + item.qty_foil + item.qty_enchanted
      + (item.qty_epic ?? 0) + (item.qty_promo ?? 0) + (item.qty_iconic ?? 0) + (item.qty_play ?? 0);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/card/${item.card_id}`)}
        activeOpacity={0.7}
      >
        <CardImage cardId={item.card_id} imageUrl={item.image_url} thumbnailUrl={item.thumbnail_url} size="small" />
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.cardMeta}>
            {item.ink_color ? <View style={[styles.inkDot, { backgroundColor: inkColor }]} /> : null}
            {item.cost !== null && <Text style={styles.costText}>{item.cost}</Text>}
            <Text style={styles.setText}>{item.set_code ?? ''}</Text>
          </View>
          <View style={styles.cardBottom}>
            <TouchableOpacity
              style={[styles.priorityBadge, { backgroundColor: priorityColor + '20', borderColor: priorityColor }]}
              onPress={() => {
                const next = item.priority >= 3 ? 1 : item.priority + 1;
                doChangePriority({ cardId: item.card_id, priority: next });
              }}
            >
              <Star size={10} color={priorityColor} />
              <Text style={[styles.priorityText, { color: priorityColor }]}>
                {PRIORITY_LABELS[item.priority]}
              </Text>
            </TouchableOpacity>
            <Text style={styles.targetText}>Need: {item.target_qty}</Text>
            {totalOwned > 0 && <Text style={styles.ownedText}>Own: {totalOwned}</Text>}
          </View>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.acquireBtn}
            onPress={() => {
              if (isYugioh) {
                router.push(`/card/${item.card_id}`);
                return;
              }
              doAcquireCard({ cardId: item.card_id, targetQty: item.target_qty });
            }}
          >
            <Check size={16} color={Colors.success} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }, [router, doChangePriority, doAcquireCard, isYugioh]);

  if (!isReady) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  if (!hasCatalog) {
    return (
      <EmptyState
        icon={<Heart size={28} color={Colors.textMuted} />}
        title="No Cards Synced"
        message="Sync cards from the API in Settings to use the wishlist."
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, filterPriority === 1 && { backgroundColor: Colors.danger + '25', borderColor: Colors.danger }]}
          onPress={() => setFilterPriority(filterPriority === 1 ? null : 1)}
        >
          <Text style={[styles.filterChipText, filterPriority === 1 && { color: Colors.danger }]}>High</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filterMissing && styles.filterChipActive]}
          onPress={() => setFilterMissing(!filterMissing)}
        >
          <Text style={[styles.filterChipText, filterMissing && styles.filterChipTextActive]}>Missing Only</Text>
        </TouchableOpacity>
        <Text style={styles.countLabel}>{items?.length ?? 0} items</Text>
      </View>

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.card_id.toString()}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <EmptyState
              icon={<Heart size={28} color={Colors.textMuted} />}
              title="Wishlist Empty"
              message="Add cards to your wishlist from the collection or card detail."
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  filterChipActive: {
    backgroundColor: Colors.primary + '25',
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  filterChipTextActive: {
    color: Colors.primary,
  },
  countLabel: {
    marginLeft: 'auto',
    fontSize: 12,
    color: Colors.textMuted,
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inkDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  costText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  setText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  targetText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  ownedText: {
    fontSize: 11,
    color: Colors.accent,
    fontWeight: '600' as const,
  },
  cardActions: {
    gap: 8,
  },
  acquireBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.success + '20',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.success + '40',
  },
});
