import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, ScrollView, TextInput } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Plus, Layers, Trash2, ChevronRight, Lock, Trophy, Package, ChevronDown, ChevronUp, X, Edit3, TrendingUp, Eye, Heart, Search } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { safeQuery, safeRun } from '@/utils/database';
import EmptyState from '@/components/EmptyState';
import { getStarterDecks, getStarterDeckSets } from '@/constants/starterDecks';
import { useTCG } from '@/providers/TCGProvider';
import { fetchTrendingDecks } from '@/utils/lorcana-decks-api';
import type { DeckWithStats, PurchasedStarterDeck } from '@/types/database';
import type { StarterDeck } from '@/constants/starterDecks';

export default function DecksScreen() {
  const { db, isReady } = useDatabase();
  const { tcg } = useTCG();
  const router = useRouter();
  const starterDecks = getStarterDecks(tcg);
  const starterDeckSets = getStarterDeckSets(tcg);
  const queryClient = useQueryClient();
  const [showStarterModal, setShowStarterModal] = useState<boolean>(false);
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [customSetName, setCustomSetName] = useState<string>('');
  const [customDeckName, setCustomDeckName] = useState<string>('');
  const [customInkProfile, setCustomInkProfile] = useState<string>('');
  const [showPurchased, setShowPurchased] = useState<boolean>(false);
  const [showTrending, setShowTrending] = useState<boolean>(false);
  const showCommunity = tcg === 'lorcana';

  const { data: trendingDecks, isLoading: trendingLoading } = useQuery({
    queryKey: ['lorcana-trending-decks'],
    queryFn: fetchTrendingDecks,
    enabled: showCommunity && showTrending,
    staleTime: 1000 * 60 * 30,
  });

  const { data: decks, isLoading } = useQuery({
    queryKey: ['decks', !!db],
    queryFn: async () => {
      if (!db) return [];
      return safeQuery<DeckWithStats>(
        db,
        `SELECT d.*,
                COALESCE(SUM(dc.qty), 0) as total_cards,
                COALESCE((SELECT COUNT(*) FROM game_history gh WHERE gh.deck_id = d.id), 0) as games_played,
                COALESCE((SELECT COUNT(*) FROM game_history gh WHERE gh.deck_id = d.id AND gh.result = 'win'), 0) as games_won,
                COALESCE((SELECT COUNT(*) FROM game_history gh WHERE gh.deck_id = d.id AND gh.result = 'loss'), 0) as games_lost
         FROM decks d
         LEFT JOIN deck_cards dc ON dc.deck_id = d.id
         GROUP BY d.id
         ORDER BY d.updated_at DESC`
      );
    },
    enabled: isReady && !!db,
  });

  const { data: purchasedDecks } = useQuery({
    queryKey: ['purchased-starter-decks', !!db],
    queryFn: async () => {
      if (!db) return [];
      return safeQuery<PurchasedStarterDeck>(
        db,
        'SELECT * FROM purchased_starter_decks ORDER BY purchased_at DESC'
      );
    },
    enabled: isReady && !!db,
  });

  const purchasedIds = new Set(purchasedDecks?.map(d => d.id) ?? []);

  const { mutate: doDeleteDeck } = useMutation({
    mutationFn: async (deckId: number) => {
      if (!db) return;
      await safeRun(db, 'DELETE FROM deck_cards WHERE deck_id = ?', [deckId]);
      await safeRun(db, 'DELETE FROM decks WHERE id = ?', [deckId]);
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  const addStarterDeckMutation = useMutation({
    mutationFn: async (deck: StarterDeck) => {
      if (!db) throw new Error('DB not ready');
      await safeRun(
        db,
        `INSERT INTO purchased_starter_decks (id, set_name, deck_name, ink_profile, purchased_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO NOTHING`,
        [deck.id, deck.set, deck.name, deck.inkProfile]
      );
      return deck;
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: ['purchased-starter-decks'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-purchased-decks'] });
    },
  });

  const removeStarterDeckMutation = useMutation({
    mutationFn: async (deckId: string) => {
      if (!db) throw new Error('DB not ready');
      await safeRun(db, 'DELETE FROM purchased_starter_decks WHERE id = ?', [deckId]);
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: ['purchased-starter-decks'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-purchased-decks'] });
    },
  });

  const addCustomDeckMutation = useMutation({
    mutationFn: async ({ setName, deckName, inkProfile }: { setName: string; deckName: string; inkProfile: string }) => {
      if (!db) throw new Error('DB not ready');
      const customId = `custom-${Date.now()}`;
      await safeRun(
        db,
        `INSERT INTO purchased_starter_decks (id, set_name, deck_name, ink_profile, purchased_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [customId, setName, deckName, inkProfile]
      );
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: ['purchased-starter-decks'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-purchased-decks'] });
      setShowCustomModal(false);
      setCustomSetName('');
      setCustomDeckName('');
      setCustomInkProfile('');
    },
  });

  const handleDelete = useCallback((deck: DeckWithStats) => {
    if (deck.is_locked) {
      Alert.alert('Locked', 'Unlock this deck first before deleting.');
      return;
    }
    Alert.alert(
      'Delete Deck',
      `Delete "${deck.name}" and all its cards?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => doDeleteDeck(deck.id) },
      ]
    );
  }, [doDeleteDeck]);

  const handleRemovePurchased = useCallback((deck: PurchasedStarterDeck) => {
    Alert.alert(
      'Remove Deck',
      `Remove "${deck.deck_name}" from purchased decks?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeStarterDeckMutation.mutate(deck.id) },
      ]
    );
  }, [removeStarterDeckMutation]);

  const renderDeck = useCallback(({ item }: { item: DeckWithStats }) => {
    const inks = item.ink_profile?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
    const winRate = item.games_played > 0 ? Math.round((item.games_won / item.games_played) * 100) : 0;

    return (
      <TouchableOpacity
        style={styles.deckCard}
        onPress={() => router.push(`/deck/${item.id}`)}
        activeOpacity={0.7}
        testID={`deck-${item.id}`}
      >
        <View style={styles.deckIcon}>
          <Layers size={22} color={Colors.primary} />
          {item.is_locked === 1 && (
            <View style={styles.lockBadge}>
              <Lock size={8} color={Colors.warning} />
            </View>
          )}
        </View>
        <View style={styles.deckInfo}>
          <View style={styles.deckNameRow}>
            <Text style={styles.deckName} numberOfLines={1}>{item.name}</Text>
          </View>
          <View style={styles.deckMeta}>
            {item.format ? <Text style={styles.deckFormat}>{item.format}</Text> : null}
            <Text style={styles.deckCards}>{item.total_cards} cards</Text>
          </View>
          {inks.length > 0 && (
            <View style={styles.inkRow}>
              {inks.map(ink => {
                const c = Colors.ink[ink] ?? Colors.textMuted;
                return <View key={ink} style={[styles.miniInkDot, { backgroundColor: c }]} />;
              })}
            </View>
          )}
          {item.games_played > 0 && (
            <View style={styles.gameStatsRow}>
              <Trophy size={10} color={Colors.success} />
              <Text style={styles.gameStatsText}>
                {item.games_won}W / {item.games_lost}L ({winRate}%)
              </Text>
            </View>
          )}
        </View>
        <View style={styles.deckActions}>
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Trash2 size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          <ChevronRight size={18} color={Colors.textMuted} />
        </View>
      </TouchableOpacity>
    );
  }, [router, handleDelete]);

  const renderPurchasedDeck = useCallback((deck: PurchasedStarterDeck) => {
    const inks = deck.ink_profile.split(',').map(s => s.trim()).filter(Boolean);
    const isStarter = !deck.id.startsWith('custom-');
    const tappable = isStarter;
    const Body = (
      <>
        <View style={styles.purchasedInkDots}>
          {inks.map((ink, i) => (
            <View key={i} style={[styles.purchasedInkDot, { backgroundColor: Colors.ink[ink] ?? Colors.textMuted }]} />
          ))}
        </View>
        <View style={styles.purchasedInfo}>
          <Text style={styles.purchasedDeckName} numberOfLines={1}>{deck.deck_name}</Text>
          <Text style={styles.purchasedSetName}>{deck.set_name}</Text>
        </View>
        {tappable && <ChevronRight size={14} color={Colors.textMuted} />}
        <TouchableOpacity
          onPress={() => handleRemovePurchased(deck)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Trash2 size={14} color={Colors.textMuted} />
        </TouchableOpacity>
      </>
    );
    if (tappable) {
      const onPress = () => {
        router.push(`/starter-deck/${deck.id}`);
      };
      return (
        <TouchableOpacity
          key={deck.id}
          style={styles.purchasedItem}
          onPress={onPress}
          activeOpacity={0.7}
        >
          {Body}
        </TouchableOpacity>
      );
    }
    return <View key={deck.id} style={styles.purchasedItem}>{Body}</View>;
  }, [handleRemovePurchased, tcg, router]);

  const renderStarterDeckModal = () => {
    const groupedBySet: Record<string, StarterDeck[]> = {};
    for (const deck of starterDecks) {
      if (!groupedBySet[deck.set]) groupedBySet[deck.set] = [];
      groupedBySet[deck.set].push(deck);
    }

    return (
      <Modal visible={showStarterModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>Add Starter Deck</Text>
              <TouchableOpacity onPress={() => setShowStarterModal(false)}>
                <X size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={modalStyles.scroll} showsVerticalScrollIndicator={false}>
              {starterDeckSets.map(setName => {
                const setDecks = groupedBySet[setName] ?? [];
                return (
                  <View key={setName} style={modalStyles.setGroup}>
                    <Text style={modalStyles.setTitle}>{setName}</Text>
                    {setDecks.map(deck => {
                      const owned = purchasedIds.has(deck.id);
                      return (
                        <TouchableOpacity
                          key={deck.id}
                          style={[modalStyles.deckRow, owned && modalStyles.deckRowOwned]}
                          onPress={() => {
                            if (!owned) addStarterDeckMutation.mutate(deck);
                          }}
                          disabled={owned}
                          activeOpacity={0.7}
                        >
                          <View style={modalStyles.deckDots}>
                            {deck.colors.map((ink, i) => (
                              <View key={i} style={[modalStyles.deckDot, { backgroundColor: Colors.ink[ink] ?? Colors.textMuted }]} />
                            ))}
                          </View>
                          <View style={modalStyles.deckInfo}>
                            <Text style={[modalStyles.deckName, owned && { color: Colors.textMuted }]}>{deck.name}</Text>
                            <Text style={modalStyles.deckInk}>{deck.inkProfile}</Text>
                          </View>
                          {owned ? (
                            <Text style={modalStyles.ownedBadge}>Owned</Text>
                          ) : (
                            <Plus size={18} color={Colors.primary} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderCustomDeckModal = () => (
    <Modal visible={showCustomModal} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Add Custom Deck</Text>
            <TouchableOpacity onPress={() => setShowCustomModal(false)}>
              <X size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <View style={modalStyles.form}>
            <View style={modalStyles.field}>
              <Text style={modalStyles.label}>Set Name</Text>
              <TextInput
                style={modalStyles.input}
                value={customSetName}
                onChangeText={setCustomSetName}
                placeholder="e.g. The First Chapter"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={modalStyles.field}>
              <Text style={modalStyles.label}>Deck Name</Text>
              <TextInput
                style={modalStyles.input}
                value={customDeckName}
                onChangeText={setCustomDeckName}
                placeholder="e.g. My Custom Deck"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={modalStyles.field}>
              <Text style={modalStyles.label}>Ink Profile</Text>
              <TextInput
                style={modalStyles.input}
                value={customInkProfile}
                onChangeText={setCustomInkProfile}
                placeholder="e.g. Amber, Ruby"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <TouchableOpacity
              style={[modalStyles.submitBtn, (!customSetName.trim() || !customDeckName.trim()) && { opacity: 0.5 }]}
              onPress={() => {
                if (customSetName.trim() && customDeckName.trim()) {
                  addCustomDeckMutation.mutate({
                    setName: customSetName.trim(),
                    deckName: customDeckName.trim(),
                    inkProfile: customInkProfile.trim(),
                  });
                }
              }}
              disabled={!customSetName.trim() || !customDeckName.trim() || addCustomDeckMutation.isPending}
            >
              <Text style={modalStyles.submitBtnText}>Add Deck</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (!isReady) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  const purchasedCount = purchasedDecks?.length ?? 0;

  const ListHeader = (
    <View>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/deck-form')}
        testID="add-deck-btn"
      >
        <Plus size={20} color={Colors.background} />
        <Text style={styles.addButtonText}>New Deck</Text>
      </TouchableOpacity>

      <View style={styles.purchasedSection}>
          <TouchableOpacity
            style={styles.purchasedHeader}
            onPress={() => setShowPurchased(!showPurchased)}
            activeOpacity={0.7}
          >
            <Package size={18} color={Colors.accent} />
            <Text style={styles.purchasedTitle}>Purchased Starter Decks</Text>
            <View style={styles.purchasedCountBadge}>
              <Text style={styles.purchasedCountText}>{purchasedCount}</Text>
            </View>
            <View style={{ flex: 1 }} />
            {showPurchased ? (
              <ChevronUp size={16} color={Colors.textMuted} />
            ) : (
              <ChevronDown size={16} color={Colors.textMuted} />
            )}
          </TouchableOpacity>

          {showPurchased && (
            <View style={styles.purchasedContent}>
              <ScrollView style={styles.purchasedScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {purchasedDecks?.map(renderPurchasedDeck)}
                {purchasedCount === 0 && (
                  <Text style={styles.noPurchasedText}>No starter decks added yet</Text>
                )}
              </ScrollView>
              <View style={styles.purchasedActions}>
                <TouchableOpacity
                  style={styles.addStarterBtn}
                  onPress={() => setShowStarterModal(true)}
                  activeOpacity={0.7}
                >
                  <Plus size={16} color={Colors.primary} />
                  <Text style={styles.addStarterBtnText}>Add Starter Deck</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addCustomBtn}
                  onPress={() => setShowCustomModal(true)}
                  activeOpacity={0.7}
                >
                  <Edit3 size={16} color={Colors.accent} />
                  <Text style={styles.addCustomBtnText}>Custom Deck</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

      {showCommunity && (
        <View style={styles.purchasedSection}>
          <TouchableOpacity
            style={styles.purchasedHeader}
            onPress={() => setShowTrending(!showTrending)}
            activeOpacity={0.7}
          >
            <TrendingUp size={18} color={Colors.primary} />
            <Text style={styles.purchasedTitle}>Trending Community Decks</Text>
            <View style={{ flex: 1 }} />
            {showTrending ? (
              <ChevronUp size={16} color={Colors.textMuted} />
            ) : (
              <ChevronDown size={16} color={Colors.textMuted} />
            )}
          </TouchableOpacity>
          {showTrending && (
            <View style={styles.purchasedContent}>
              <TouchableOpacity
                style={styles.searchAllBtn}
                onPress={() => router.push('/community-decks-search')}
                activeOpacity={0.7}
              >
                <Search size={14} color={Colors.primary} />
                <Text style={styles.searchAllBtnText}>Search & filter all community decks</Text>
              </TouchableOpacity>
              {trendingLoading ? (
                <ActivityIndicator size="small" color={Colors.primary} style={{ paddingVertical: 16 }} />
              ) : (
                <ScrollView style={styles.purchasedScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {(trendingDecks ?? []).map((d) => (
                    <TouchableOpacity
                      key={d.uuid}
                      style={styles.purchasedItem}
                      onPress={() => router.push(`/community-deck/${d.uuid}`)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.purchasedInkDot, { backgroundColor: Colors.primary + '40', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }]}>
                        <TrendingUp size={14} color={Colors.primary} />
                      </View>
                      <View style={styles.purchasedInfo}>
                        <Text style={styles.purchasedDeckName} numberOfLines={1}>{d.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.purchasedSetName} numberOfLines={1}>
                            {d.creator_name ?? 'Unknown'} • {d.cardsCount}
                          </Text>
                          {d.views !== undefined ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                              <Eye size={9} color={Colors.textMuted} />
                              <Text style={styles.purchasedSetName}>{d.views}</Text>
                            </View>
                          ) : null}
                          {d.likes !== undefined ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                              <Heart size={9} color={Colors.textMuted} />
                              <Text style={styles.purchasedSetName}>{d.likes}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <ChevronRight size={14} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                  {(trendingDecks?.length ?? 0) === 0 && !trendingLoading && (
                    <Text style={styles.noPurchasedText}>No trending decks available</Text>
                  )}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={decks}
        renderItem={renderDeck}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <EmptyState
              icon={<Layers size={28} color={Colors.textMuted} />}
              title="No Decks Yet"
              message="Create your first deck to start building!"
            />
          )
        }
        testID="decks-list"
      />

      {renderStarterDeckModal()}
      {renderCustomDeckModal()}
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.background,
  },
  list: {
    padding: 16,
  },
  deckCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  deckIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadge: {
    position: 'absolute' as const,
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.warning + '30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  deckInfo: {
    flex: 1,
    gap: 3,
  },
  deckNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deckName: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    flex: 1,
  },
  deckMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deckFormat: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '600' as const,
  },
  deckCards: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  inkRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  miniInkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gameStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  gameStatsText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  deckActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  purchasedSection: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden' as const,
  },
  purchasedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
  },
  purchasedTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  purchasedCountBadge: {
    backgroundColor: Colors.accent + '25',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  purchasedCountText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.accent,
  },
  purchasedContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 6,
  },
  purchasedScroll: {
    maxHeight: 300,
  },
  purchasedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
  },
  purchasedInkDots: {
    flexDirection: 'row',
    gap: 3,
  },
  purchasedInkDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  purchasedInfo: {
    flex: 1,
    gap: 1,
  },
  purchasedDeckName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  purchasedSetName: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  noPurchasedText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    paddingVertical: 8,
  },
  purchasedActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  addStarterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary + '50',
    backgroundColor: Colors.primary + '10',
  },
  addStarterBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  addCustomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.accent + '50',
    backgroundColor: Colors.accent + '10',
  },
  addCustomBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.accent,
  },
  searchAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary + '50',
    backgroundColor: Colors.primary + '10',
    marginBottom: 4,
  },
  searchAllBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  title: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  scroll: {
    paddingHorizontal: 16,
  },
  setGroup: {
    marginTop: 16,
    gap: 6,
  },
  setTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primaryLight,
    marginBottom: 4,
  },
  deckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  deckRowOwned: {
    opacity: 0.5,
    borderColor: Colors.success + '40',
  },
  deckDots: {
    flexDirection: 'row',
    gap: 3,
  },
  deckDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  deckInfo: {
    flex: 1,
    gap: 1,
  },
  deckName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  deckInk: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  ownedBadge: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.success,
  },
  form: {
    padding: 20,
    gap: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.background,
  },
});
