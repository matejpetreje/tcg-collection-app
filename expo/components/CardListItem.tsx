import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Droplets, DropletOff, Minus, Plus } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { getSetNumber } from '@/constants/sets';
import { getCardFoundation } from '@/constants/tcg-card-foundations';
import { useDatabase } from '@/providers/DatabaseProvider';
import { useTCG } from '@/providers/TCGProvider';
import { safeRun } from '@/utils/database';
import CardImage from './CardImage';
import type { CardWithDetails } from '@/types/database';

interface CardListItemProps {
  card: CardWithDetails;
  showQuickAdd?: boolean;
}

function CardListItemComponent({ card, showQuickAdd = true }: CardListItemProps) {
  const router = useRouter();
  const { db } = useDatabase();
  const queryClient = useQueryClient();
  const { tcg } = useTCG();
  const isOnePiece = tcg === 'onepiece';
  const gameStats = tcg === 'lorcana' ? [] : getCardFoundation(tcg).getDisplayStats(card);

  const handlePress = useCallback(() => {
    router.push(`/card/${card.id}`);
  }, [card.id, router]);

  const handleQuickAdd = useCallback(async () => {
    if (!db) return;
    try {
      await safeRun(
        db,
        `INSERT INTO user_collection (card_id, qty, qty_foil, qty_enchanted, qty_epic, qty_promo, qty_iconic, qty_play, updated_at)
         VALUES (?, 1, 0, 0, 0, 0, 0, 0, datetime('now'))
         ON CONFLICT(card_id) DO UPDATE SET qty = qty + 1, updated_at = datetime('now')`,
        [card.id]
      );
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void queryClient.invalidateQueries({ queryKey: ['collection'] });
      void queryClient.invalidateQueries({ queryKey: ['collection-count'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      console.log('[CardListItem] Quick added classic card:', card.id, card.name);
    } catch (e) {
      console.log('[CardListItem] Quick add error:', e);
    }
  }, [db, card.id, card.name, queryClient]);

  const handleQuickRemove = useCallback(async () => {
    if (!db || card.qty <= 0) return;
    try {
      await safeRun(
        db,
        `UPDATE user_collection
         SET qty = MAX(qty - 1, 0), updated_at = datetime('now')
         WHERE card_id = ?`,
        [card.id]
      );
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void queryClient.invalidateQueries({ queryKey: ['collection'] });
      void queryClient.invalidateQueries({ queryKey: ['collection-count'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      console.log('[CardListItem] Quick removed classic card:', card.id, card.name);
    } catch (e) {
      console.log('[CardListItem] Quick remove error:', e);
    }
  }, [db, card.id, card.name, card.qty, queryClient]);

  const inkColor = Colors.ink[card.ink_color ?? ''] ?? Colors.textSecondary;
  const rarityColor = Colors.rarity[card.rarity ?? ''] ?? Colors.textSecondary;
  const totalOwned = card.total_owned ?? (card.qty + card.qty_foil + card.qty_enchanted + (card.qty_epic ?? 0) + (card.qty_promo ?? 0) + (card.qty_iconic ?? 0) + (card.qty_play ?? 0));
  const setNum = getSetNumber(card.set_name);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
      testID={`card-item-${card.id}`}
    >
      <CardImage
        cardId={card.id}
        imageUrl={card.image_url}
        thumbnailUrl={card.thumbnail_url}
        size="small"
      />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{card.name}</Text>
        {card.version ? (
          <Text style={styles.version} numberOfLines={1}>{card.version}</Text>
        ) : null}
        <View style={styles.metaRow}>
          {card.ink_color ? (
            <View style={[styles.badge, { backgroundColor: inkColor + '25' }]}>
              <View style={[styles.inkDot, { backgroundColor: inkColor }]} />
              <Text style={[styles.badgeText, { color: inkColor }]}>{card.ink_color}</Text>
            </View>
          ) : null}
          {card.cost !== null && card.cost !== undefined ? (
            <View style={styles.costBadge}>
              <Text style={styles.costText}>{card.cost}</Text>
            </View>
          ) : null}
          {card.rarity ? (
            <Text style={[styles.rarityText, { color: rarityColor }]}>{card.rarity}</Text>
          ) : null}
          {card.inkable === 1 && !isOnePiece ? (
            <Droplets size={12} color={Colors.accent} />
          ) : card.inkable === 0 && !isOnePiece ? (
            <DropletOff size={12} color={Colors.textMuted} />
          ) : null}
        </View>
        <View style={styles.statsRow}>
          {tcg === 'lorcana' ? (
            <>
              {card.cost !== null && card.cost !== undefined ? <View style={styles.statBadge}><Text style={styles.statLabel}>Cost</Text><Text style={styles.statText}>{card.cost}</Text></View> : null}
              {card.strength !== null && card.strength !== undefined ? <View style={styles.statBadge}><Text style={styles.statLabel}>Str</Text><Text style={styles.statText}>{card.strength}</Text></View> : null}
              {card.willpower !== null && card.willpower !== undefined ? <View style={styles.statBadge}><Text style={styles.statLabel}>Wil</Text><Text style={styles.statText}>{card.willpower}</Text></View> : null}
              {card.lore !== null && card.lore !== undefined ? <View style={styles.statBadge}><Text style={[styles.statLabel, { color: Colors.accent }]}>Lore</Text><Text style={[styles.statText, { color: Colors.accent }]}>{card.lore}</Text></View> : null}
            </>
          ) : gameStats.map(stat => (
            <View style={styles.statBadge} key={stat.key}>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statText}>{stat.value}</Text>
            </View>
          ))}
        </View>
        <View style={styles.setRow}>
          {card.card_number ? (
            <Text style={styles.cardNumber}>#{card.card_number}</Text>
          ) : null}
          {setNum !== null ? (
            <View style={styles.setNumBadge}>
              <Text style={styles.setNumText}>S{setNum}</Text>
            </View>
          ) : null}
          <Text style={styles.setCode} numberOfLines={1}>
            {card.set_code ?? ''}
          </Text>
        </View>
      </View>
      <View style={styles.rightColumn}>
        {showQuickAdd ? (
          <View style={styles.quickEditRow}>
            <TouchableOpacity
              style={[styles.quickEditBtn, card.qty <= 0 && styles.quickEditBtnDisabled]}
              onPress={handleQuickRemove}
              disabled={card.qty <= 0}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
              testID={`quick-remove-${card.id}`}
            >
              <Minus size={13} color={card.qty <= 0 ? Colors.textMuted : Colors.text} />
            </TouchableOpacity>
            <View style={styles.quickQtyBadge}>
              <Text style={styles.quickQtyText}>{card.qty}</Text>
            </View>
            <TouchableOpacity
              style={styles.quickEditBtn}
              onPress={handleQuickAdd}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              testID={`quick-add-${card.id}`}
            >
              <Plus size={13} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        ) : totalOwned > 0 ? (
          <View style={styles.ownedBadge}>
            <Text style={styles.ownedText}>{totalOwned}</Text>
          </View>
        ) : null}
        {totalOwned > 0 ? (
          <View style={styles.variantRow}>
            {card.qty > 0 ? <View style={[styles.variantBadge, { backgroundColor: Colors.accent + '30' }]}><Text style={[styles.variantText, { color: Colors.accent }]}>C{card.qty}</Text></View> : null}
            {card.qty_foil > 0 ? <View style={[styles.variantBadge, { backgroundColor: Colors.primaryLight + '30' }]}><Text style={[styles.variantText, { color: Colors.primaryLight }]}>F{card.qty_foil}</Text></View> : null}
            {(card.qty_epic ?? 0) > 0 ? <View style={[styles.variantBadge, { backgroundColor: '#FF6B3530' }]}><Text style={[styles.variantText, { color: '#FF6B35' }]}>Ep</Text></View> : null}
            {card.qty_enchanted > 0 ? <View style={[styles.variantBadge, { backgroundColor: Colors.dangerLight + '30' }]}><Text style={[styles.variantText, { color: Colors.dangerLight }]}>En</Text></View> : null}
            {(card.qty_promo ?? 0) > 0 ? <View style={[styles.variantBadge, { backgroundColor: '#1ABC9C30' }]}><Text style={[styles.variantText, { color: '#1ABC9C' }]}>Pr</Text></View> : null}
            {(card.qty_iconic ?? 0) > 0 ? <View style={[styles.variantBadge, { backgroundColor: '#FFD70030' }]}><Text style={[styles.variantText, { color: '#FFD700' }]}>Ic</Text></View> : null}
            {(card.qty_play ?? 0) > 0 ? <View style={[styles.variantBadge, { backgroundColor: Colors.accent + '30' }]}><Text style={[styles.variantText, { color: Colors.accent }]}>Pl</Text></View> : null}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(CardListItemComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  version: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic' as const,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  inkDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  costBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  costText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  rarityText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statText: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: '600' as const,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '500' as const,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  cardNumber: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500' as const,
  },
  setCode: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  setNumBadge: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  setNumText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  rightColumn: {
    alignItems: 'center',
    gap: 6,
  },
  quickEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quickEditBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickEditBtnDisabled: {
    opacity: 0.4,
  },
  quickQtyBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  quickQtyText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  ownedBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.primary + '25',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  ownedText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  variantRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    justifyContent: 'center',
    maxWidth: 50,
  },
  variantBadge: {
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  variantText: {
    fontSize: 8,
    fontWeight: '700' as const,
  },
});
