import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Minus, Trash2, Copy, Share2, BarChart3, ChevronDown, ChevronUp, Lock, Unlock, Trophy, Swords, Filter } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { useTCG } from '@/providers/TCGProvider';
import { getTCGPresentation } from '@/tcg/presentation';
import { safeQuery, safeQueryFirst, safeRun } from '@/utils/database';
import CardImage from '@/components/CardImage';
import EmptyState from '@/components/EmptyState';
import type { Deck, DeckCardWithDetails, InkStats, CostCurveItem } from '@/types/database';

export default function DeckDetailScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db } = useDatabase();
  const { tcg } = useTCG();
  const presentation = tcg ? getTCGPresentation(tcg) : null;
  const [showStats, setShowStats] = useState<boolean>(false);
  const [filterInk, setFilterInk] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const deckIdNum = parseInt(deckId ?? '0', 10);

  const { data: deck } = useQuery({
    queryKey: ['deck', tcg, deckIdNum, !!db],
    queryFn: async () => {
      if (!db) return null;
      return safeQueryFirst<Deck>(db, 'SELECT * FROM decks WHERE id = ?', [deckIdNum]);
    },
    enabled: !!db && deckIdNum > 0,
  });

  const { data: cards, isLoading } = useQuery({
    queryKey: ['deck-cards', tcg, deckIdNum, !!db],
    queryFn: async () => {
      if (!db) return [];
      return safeQuery<DeckCardWithDetails>(
        db,
        `SELECT dc.*, c.name, c.ink_color, c.cost, c.rarity, c.type, c.set_code,
                i.image_url, i.thumbnail_url
         FROM deck_cards dc
         JOIN cards c ON c.id = dc.card_id
         LEFT JOIN images i ON i.card_id = dc.card_id
         WHERE dc.deck_id = ?
         ORDER BY c.cost ASC, c.name ASC`,
        [deckIdNum]
      );
    },
    enabled: !!db && deckIdNum > 0,
  });

  const { data: deckStats } = useQuery({
    queryKey: ['deck-stats', tcg, deckIdNum, !!db],
    queryFn: async () => {
      if (!db) return null;
      const totalCards = await safeQueryFirst<{ total: number }>(
        db, 'SELECT COALESCE(SUM(qty), 0) as total FROM deck_cards WHERE deck_id = ?', [deckIdNum]
      );
      const inkDist = await safeQuery<InkStats>(
        db,
        `SELECT c.ink_color, SUM(dc.qty) as count
         FROM deck_cards dc JOIN cards c ON c.id = dc.card_id
         WHERE dc.deck_id = ? AND c.ink_color IS NOT NULL
         GROUP BY c.ink_color ORDER BY count DESC`,
        [deckIdNum]
      );
      const typeDist = await safeQuery<{ type: string; count: number }>(
        db,
        `SELECT c.type, SUM(dc.qty) as count
         FROM deck_cards dc JOIN cards c ON c.id = dc.card_id
         WHERE dc.deck_id = ? AND c.type IS NOT NULL
         GROUP BY c.type ORDER BY count DESC`,
        [deckIdNum]
      );
      const costCurve = await safeQuery<CostCurveItem>(
        db,
        `SELECT COALESCE(c.cost, 0) as cost, SUM(dc.qty) as count
         FROM deck_cards dc JOIN cards c ON c.id = dc.card_id
         WHERE dc.deck_id = ?
         GROUP BY c.cost ORDER BY c.cost ASC`,
        [deckIdNum]
      );
      const avgCost = await safeQueryFirst<{ avg: number }>(
        db,
        `SELECT ROUND(AVG(c.cost * dc.qty * 1.0 / dc.qty), 1) as avg
         FROM deck_cards dc JOIN cards c ON c.id = dc.card_id
         WHERE dc.deck_id = ? AND c.cost IS NOT NULL`,
        [deckIdNum]
      );

      let gameStats = { total: 0, wins: 0, losses: 0, winRate: 0 };
      try {
        const totalGames = await safeQueryFirst<{ count: number }>(
          db, 'SELECT COUNT(*) as count FROM game_history WHERE deck_id = ?', [deckIdNum]
        );
        const wins = await safeQueryFirst<{ count: number }>(
          db, "SELECT COUNT(*) as count FROM game_history WHERE deck_id = ? AND result = 'win'", [deckIdNum]
        );
        const losses = await safeQueryFirst<{ count: number }>(
          db, "SELECT COUNT(*) as count FROM game_history WHERE deck_id = ? AND result = 'loss'", [deckIdNum]
        );
        const t = totalGames?.count ?? 0;
        const w = wins?.count ?? 0;
        gameStats = { total: t, wins: w, losses: losses?.count ?? 0, winRate: t > 0 ? Math.round((w / t) * 100) : 0 };
      } catch {
        console.log('[DeckDetail] game_history query failed');
      }

      return {
        total: totalCards?.total ?? 0,
        inkDist: inkDist ?? [],
        typeDist: typeDist ?? [],
        costCurve: costCurve ?? [],
        avgCost: avgCost?.avg ?? 0,
        gameStats,
      };
    },
    enabled: !!db && deckIdNum > 0 && showStats,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['deck-cards', tcg, deckIdNum] });
    void queryClient.invalidateQueries({ queryKey: ['deck-stats', tcg, deckIdNum] });
    void queryClient.invalidateQueries({ queryKey: ['decks'] });
  }, [queryClient, deckIdNum]);

  const { mutate: doToggleLock } = useMutation({
    mutationFn: async () => {
      if (!db || !deck) return;
      const newLocked = deck.is_locked === 1 ? 0 : 1;
      await safeRun(db, 'UPDATE decks SET is_locked = ? WHERE id = ?', [newLocked, deckIdNum]);
    },
    onSuccess: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      void queryClient.invalidateQueries({ queryKey: ['deck', tcg, deckIdNum] });
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
    },
  });

  const { mutate: doUpdateQty } = useMutation({
    mutationFn: async ({ cardId, delta, isSideboard }: { cardId: number; delta: number; isSideboard: number }) => {
      if (!db) return;
      if (deck?.is_locked === 1) {
        throw new Error('Deck is locked');
      }
      const current = await safeQueryFirst<{ qty: number }>(
        db,
        'SELECT qty FROM deck_cards WHERE deck_id = ? AND card_id = ? AND is_sideboard = ?',
        [deckIdNum, cardId, isSideboard]
      );
      const newQty = (current?.qty ?? 0) + delta;
      if (newQty <= 0) {
        await safeRun(db, 'DELETE FROM deck_cards WHERE deck_id = ? AND card_id = ? AND is_sideboard = ?', [deckIdNum, cardId, isSideboard]);
      } else {
        await safeRun(db, 'UPDATE deck_cards SET qty = ? WHERE deck_id = ? AND card_id = ? AND is_sideboard = ?', [newQty, deckIdNum, cardId, isSideboard]);
      }
      await safeRun(db, "UPDATE decks SET updated_at = datetime('now') WHERE id = ?", [deckIdNum]);
    },
    onSuccess: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      invalidate();
    },
    onError: (error: Error) => {
      if (error.message === 'Deck is locked') {
        Alert.alert('Locked', 'Unlock this deck to make changes.');
      }
    },
  });

  const { mutate: doRemoveCard } = useMutation({
    mutationFn: async ({ cardId, isSideboard }: { cardId: number; isSideboard: number }) => {
      if (!db) return;
      if (deck?.is_locked === 1) {
        throw new Error('Deck is locked');
      }
      await safeRun(db, 'DELETE FROM deck_cards WHERE deck_id = ? AND card_id = ? AND is_sideboard = ?', [deckIdNum, cardId, isSideboard]);
    },
    onSuccess: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      invalidate();
    },
    onError: (error: Error) => {
      if (error.message === 'Deck is locked') {
        Alert.alert('Locked', 'Unlock this deck to make changes.');
      }
    },
  });

  const generateDeckList = useCallback(() => {
    if (!cards || !deck) return '';
    const lines = cards.map(c => `${c.qty}x ${c.name} (${c.set_code ?? ''})`);
    return `${deck.name}\n${'='.repeat(deck.name.length)}\n${lines.join('\n')}\n\nTotal: ${cards.reduce((s, c) => s + c.qty, 0)} cards`;
  }, [cards, deck]);

  const handleCopy = useCallback(async () => {
    const text = generateDeckList();
    await Clipboard.setStringAsync(text);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'Deck list copied to clipboard');
  }, [generateDeckList]);

  const handleShare = useCallback(async () => {
    const text = generateDeckList();
    try {
      await Share.share({ message: text });
    } catch {}
  }, [generateDeckList]);

  const totalCards = useMemo(() => cards?.reduce((s, c) => s + c.qty, 0) ?? 0, [cards]);
  const isLocked = deck?.is_locked === 1;

  const deckInkColors = useMemo(() => {
    if (!cards || cards.length === 0) return [];
    const colors = new Set<string>();
    cards.forEach(c => { if (c.ink_color) colors.add(c.ink_color); });
    return Array.from(colors);
  }, [cards]);

  const deckCardTypes = useMemo(() => {
    if (!cards || cards.length === 0) return [];
    const types = new Set<string>();
    cards.forEach(c => { if (c.type) types.add(c.type); });
    return Array.from(types);
  }, [cards]);

  const filteredCards = useMemo(() => {
    if (!cards) return [];
    return cards.filter(c => {
      if (filterInk && c.ink_color !== filterInk) return false;
      if (filterType && c.type !== filterType) return false;
      return true;
    });
  }, [cards, filterInk, filterType]);

  const TYPE_LABELS: Record<string, string> = {
    Character: 'Character',
    Action: 'Action',
    Song: 'Song',
    Item: 'Item',
    Location: 'Location',
  };

  const renderCard = useCallback(({ item }: { item: DeckCardWithDetails }) => {
    const inkColor = Colors.ink[item.ink_color ?? ''] ?? Colors.textMuted;
    return (
      <View style={dcStyles.cardRow}>
        <TouchableOpacity onPress={() => router.push(`/card/${item.card_id}`)} style={dcStyles.cardMain}>
          <CardImage cardId={item.card_id} imageUrl={item.image_url} thumbnailUrl={item.thumbnail_url} size="small" />
          <View style={dcStyles.cardInfo}>
            <Text style={dcStyles.cardName} numberOfLines={1}>{item.name}</Text>
            <View style={dcStyles.cardMeta}>
              {item.ink_color ? <View style={[dcStyles.inkDot, { backgroundColor: inkColor }]} /> : null}
              {item.cost !== null && <Text style={dcStyles.costText}>{item.cost}</Text>}
              <Text style={dcStyles.typeText}>{item.type ?? ''}</Text>
            </View>
          </View>
        </TouchableOpacity>
        <View style={dcStyles.qtyControls}>
          <TouchableOpacity
            style={[dcStyles.qtyBtn, isLocked && dcStyles.qtyBtnDisabled]}
            onPress={() => doUpdateQty({ cardId: item.card_id, delta: -1, isSideboard: item.is_sideboard })}
            disabled={isLocked}
          >
            <Minus size={14} color={isLocked ? Colors.textMuted : Colors.text} />
          </TouchableOpacity>
          <Text style={dcStyles.qtyValue}>{item.qty}</Text>
          <TouchableOpacity
            style={[dcStyles.qtyBtn, isLocked && dcStyles.qtyBtnDisabled]}
            onPress={() => doUpdateQty({ cardId: item.card_id, delta: 1, isSideboard: item.is_sideboard })}
            disabled={isLocked}
          >
            <Plus size={14} color={isLocked ? Colors.textMuted : Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[dcStyles.deleteBtn, isLocked && dcStyles.qtyBtnDisabled]}
            onPress={() => doRemoveCard({ cardId: item.card_id, isSideboard: item.is_sideboard })}
            disabled={isLocked}
          >
            <Trash2 size={14} color={isLocked ? Colors.textMuted : Colors.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [router, doUpdateQty, doRemoveCard, isLocked]);

  if (!deck) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: deck.name }} />

      <FlatList
        data={filteredCards}
        renderItem={renderCard}
        keyExtractor={(item) => `${item.card_id}-${item.is_sideboard}`}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.deckHeader}>
              <View>
                {deck.format ? <Text style={styles.format}>{deck.format}</Text> : null}
                <Text style={styles.cardCount}>{totalCards} cards</Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={[styles.headerBtn, isLocked && { backgroundColor: Colors.warning + '20', borderColor: Colors.warning }]}
                  onPress={() => doToggleLock()}
                >
                  {isLocked
                    ? <Lock size={16} color={Colors.warning} />
                    : <Unlock size={16} color={Colors.text} />
                  }
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerBtn} onPress={handleCopy}>
                  <Copy size={16} color={Colors.text} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerBtn} onPress={handleShare}>
                  <Share2 size={16} color={Colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {isLocked && (
              <View style={styles.lockedBanner}>
                <Lock size={14} color={Colors.warning} />
                <Text style={styles.lockedText}>Deck is locked. Tap the lock icon to unlock.</Text>
              </View>
            )}

            {!isLocked && (
              <TouchableOpacity
                style={styles.addCardBtn}
                onPress={() => router.push({ pathname: '/add-card', params: { deckId: deckIdNum.toString() } })}
              >
                <Plus size={18} color={Colors.background} />
                <Text style={styles.addCardBtnText}>Add Card</Text>
              </TouchableOpacity>
            )}

            {(deckInkColors.length > 0 || deckCardTypes.length > 0) && (
              <View style={styles.filterSection}>
                <View style={styles.filterRow}>
                  <Filter size={14} color={Colors.textMuted} />
                  {deckInkColors.map(ink => {
                    const color = Colors.ink[ink] ?? Colors.textMuted;
                    const active = filterInk === ink;
                    return (
                      <TouchableOpacity
                        key={ink}
                        style={[styles.filterChip, active && { backgroundColor: color + '25', borderColor: color }]}
                        onPress={() => setFilterInk(active ? null : ink)}
                      >
                        <View style={[styles.filterInkDot, { backgroundColor: color }]} />
                        <Text style={[styles.filterChipText, active && { color }]}>{ink}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.filterRow}>
                  {deckCardTypes.map(type => {
                    const active = filterType === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[styles.filterChip, active && styles.filterChipActive]}
                        onPress={() => setFilterType(active ? null : type)}
                      >
                        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                          {TYPE_LABELS[type] ?? type}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {tcg === 'lorcana' && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.logGameBtn}
                  onPress={() => router.push({ pathname: '/log-game', params: { deckId: deckIdNum.toString() } })}
                >
                  <Swords size={16} color={Colors.text} />
                  <Text style={styles.logGameText}>Log Game</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={styles.statsToggle}
              onPress={() => setShowStats(!showStats)}
            >
              <BarChart3 size={16} color={Colors.primary} />
              <Text style={styles.statsToggleText}>Deck Statistics</Text>
              {showStats ? <ChevronUp size={16} color={Colors.textMuted} /> : <ChevronDown size={16} color={Colors.textMuted} />}
            </TouchableOpacity>

            {showStats && deckStats && (
              <View style={styles.statsSection}>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total Cards</Text>
                  <Text style={styles.statVal}>{deckStats.total}</Text>
                </View>
                {deckStats.costCurve.length > 0 && (
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Avg Cost</Text>
                    <Text style={styles.statVal}>{deckStats.avgCost}</Text>
                  </View>
                )}

                {deckStats.gameStats.total > 0 && (
                  <View style={styles.statBlock}>
                    <Text style={styles.statBlockTitle}>Game Record</Text>
                    <View style={styles.gameRecordRow}>
                      <View style={styles.gameRecordItem}>
                        <Trophy size={14} color={Colors.success} />
                        <Text style={[styles.gameRecordValue, { color: Colors.success }]}>{deckStats.gameStats.wins}</Text>
                        <Text style={styles.gameRecordLabel}>Wins</Text>
                      </View>
                      <View style={styles.gameRecordItem}>
                        <Text style={[styles.gameRecordValue, { color: Colors.danger }]}>{deckStats.gameStats.losses}</Text>
                        <Text style={styles.gameRecordLabel}>Losses</Text>
                      </View>
                      <View style={styles.gameRecordItem}>
                        <Text style={[styles.gameRecordValue, { color: Colors.primary }]}>{deckStats.gameStats.winRate}%</Text>
                        <Text style={styles.gameRecordLabel}>Win Rate</Text>
                      </View>
                    </View>
                  </View>
                )}

                {deckStats.inkDist.length > 0 && (
                  <View style={styles.statBlock}>
                    <Text style={styles.statBlockTitle}>{presentation?.colorLabel ?? 'Color'} Distribution</Text>
                    {deckStats.inkDist.map(ink => (
                      <View key={ink.ink_color} style={styles.distRow}>
                        <View style={[styles.distDot, { backgroundColor: Colors.ink[ink.ink_color] ?? Colors.textMuted }]} />
                        <Text style={styles.distLabel}>{ink.ink_color}</Text>
                        <Text style={styles.distVal}>{ink.count}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {deckStats.typeDist.length > 0 && (
                  <View style={styles.statBlock}>
                    <Text style={styles.statBlockTitle}>Type Distribution</Text>
                    {deckStats.typeDist.map(t => (
                      <View key={t.type} style={styles.distRow}>
                        <Text style={styles.distLabel}>{t.type}</Text>
                        <Text style={styles.distVal}>{t.count}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {deckStats.costCurve.length > 0 && (
                  <View style={styles.statBlock}>
                    <Text style={styles.statBlockTitle}>Cost Curve</Text>
                    <View style={styles.costCurve}>
                      {deckStats.costCurve.map(c => {
                        const maxCount = Math.max(...deckStats.costCurve.map(x => x.count), 1);
                        const height = Math.max((c.count / maxCount) * 60, 4);
                        return (
                          <View key={c.cost} style={styles.costBar}>
                            <View style={[styles.costBarFill, { height }]} />
                            <Text style={styles.costBarLabel}>{c.cost}</Text>
                            <Text style={styles.costBarCount}>{c.count}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <EmptyState
              icon={<Plus size={28} color={Colors.textMuted} />}
              title="No Cards"
              message="Add cards to your deck to start building!"
            />
          )
        }
      />
    </View>
  );
}

const dcStyles = StyleSheet.create({
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardName: {
    fontSize: 14,
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
  typeText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: {
    opacity: 0.4,
  },
  qtyValue: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.primary,
    minWidth: 20,
    textAlign: 'center' as const,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: Colors.danger + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});

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
  list: {
    padding: 16,
  },
  header: {
    gap: 10,
    marginBottom: 12,
  },
  deckHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  format: {
    fontSize: 13,
    color: Colors.accent,
    fontWeight: '600' as const,
  },
  cardCount: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warning + '15',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.warning + '40',
  },
  lockedText: {
    fontSize: 13,
    color: Colors.warning,
    fontWeight: '500' as const,
    flex: 1,
  },
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  addCardBtnText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.background,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  logGameBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  logGameText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  statsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  statsToggleText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600' as const,
  },
  statsSection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  statVal: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  statBlock: {
    gap: 6,
    marginTop: 6,
  },
  statBlockTitle: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.primary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  gameRecordRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 6,
  },
  gameRecordItem: {
    alignItems: 'center',
    gap: 2,
  },
  gameRecordValue: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  gameRecordLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  distDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  distLabel: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
  },
  distVal: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  costCurve: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 90,
    paddingTop: 10,
  },
  costBar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  costBarFill: {
    width: '80%',
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  costBarLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '700' as const,
  },
  costBarCount: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  filterSection: {
    gap: 8,
  },
  filterRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  filterChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
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
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.primary,
  },
  filterInkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
