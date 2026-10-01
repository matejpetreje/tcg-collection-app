import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trophy, X as XIcon, Trash2, Calendar, Filter, Users, Check, Share2, ScanLine } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { safeQuery, safeRun } from '@/utils/database';
import EmptyState from '@/components/EmptyState';
import type { GameHistoryWithDeck, Deck } from '@/types/database';

export default function GameHistoryScreen() {
  const router = useRouter();
  const { db, isReady } = useDatabase();
  const queryClient = useQueryClient();
  const [filterDeckId, setFilterDeckId] = useState<number | null>(null);
  const [filterResult, setFilterResult] = useState<string | null>(null);
  const [filterPlayer, setFilterPlayer] = useState<string | null>(null);
  const [playerModalVisible, setPlayerModalVisible] = useState(false);

  const { data: decks } = useQuery({
    queryKey: ['all-decks-filter', !!db],
    queryFn: async () => {
      if (!db) return [];
      return safeQuery<Deck>(db, 'SELECT * FROM decks ORDER BY name ASC');
    },
    enabled: isReady && !!db,
  });

  const { data: players } = useQuery({
    queryKey: ['game-players', !!db],
    queryFn: async () => {
      if (!db) return [];
      const rows = await safeQuery<{ name: string }>(db,
        `SELECT DISTINCT name FROM (
          SELECT opponent_name AS name FROM game_history WHERE opponent_name IS NOT NULL AND opponent_name != ''
          UNION
          SELECT player_name AS name FROM game_history WHERE player_name IS NOT NULL AND player_name != ''
        ) ORDER BY name ASC`
      );
      return rows.map(r => r.name);
    },
    enabled: isReady && !!db,
  });

  const { data: games, isLoading } = useQuery({
    queryKey: ['game-history', filterDeckId, filterResult, filterPlayer, !!db],
    queryFn: async () => {
      if (!db) return [];
      let sql = `SELECT gh.*, d.name as deck_name, d.ink_profile as deck_ink_profile
                 FROM game_history gh
                 LEFT JOIN decks d ON d.id = gh.deck_id
                 WHERE 1=1`;
      const params: unknown[] = [];

      if (filterDeckId !== null) {
        sql += ' AND gh.deck_id = ?';
        params.push(filterDeckId);
      }
      if (filterResult) {
        sql += ' AND gh.result = ?';
        params.push(filterResult);
      }

      if (filterPlayer !== null) {
        sql += ' AND (gh.opponent_name = ? OR gh.player_name = ?)';
        params.push(filterPlayer, filterPlayer);
      }

      sql += ' ORDER BY gh.played_at DESC LIMIT 200';
      return safeQuery<GameHistoryWithDeck>(db, sql, params);
    },
    enabled: isReady && !!db,
  });

  const stats = React.useMemo(() => {
    if (!games || games.length === 0) return { total: 0, wins: 0, losses: 0, winRate: 0 };
    const wins = games.filter(g => g.result === 'win').length;
    const losses = games.filter(g => g.result === 'loss').length;
    return {
      total: games.length,
      wins,
      losses,
      winRate: games.length > 0 ? Math.round((wins / games.length) * 100) : 0,
    };
  }, [games]);

  const { mutate: doDelete } = useMutation({
    mutationFn: async (id: number) => {
      if (!db) return;
      await safeRun(db, 'DELETE FROM game_history WHERE id = ?', [id]);
    },
    onSuccess: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      void queryClient.invalidateQueries({ queryKey: ['game-history'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  const handleDelete = useCallback((game: GameHistoryWithDeck) => {
    Alert.alert('Delete Game', 'Remove this game from history?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => doDelete(game.id) },
    ]);
  }, [doDelete]);

  const formatDate = useCallback((iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  }, []);

  const renderGame = useCallback(({ item }: { item: GameHistoryWithDeck }) => {
    const isWin = item.result === 'win';
    return (
      <View style={gameStyles.card}>
        <View style={[gameStyles.resultIndicator, { backgroundColor: isWin ? Colors.success : Colors.danger }]} />
        <View style={gameStyles.content}>
          <View style={gameStyles.topRow}>
            <View style={[gameStyles.resultBadge, { backgroundColor: (isWin ? Colors.success : Colors.danger) + '20' }]}>
              {isWin ? <Trophy size={12} color={Colors.success} /> : <XIcon size={12} color={Colors.danger} />}
              <Text style={[gameStyles.resultText, { color: isWin ? Colors.success : Colors.danger }]}>
                {isWin ? 'WIN' : 'LOSS'}
              </Text>
            </View>
            <Text style={gameStyles.date}>{formatDate(item.played_at)}</Text>
          </View>

          {item.deck_name && (
            <Text style={gameStyles.deckName}>{item.deck_name}</Text>
          )}

          {item.opponent_name && (
            <Text style={gameStyles.opponent}>vs {item.opponent_name}</Text>
          )}

          {item.opponent_deck && (
            <Text style={gameStyles.opponentDeck}>{item.opponent_deck}</Text>
          )}

          {item.notes && (
            <Text style={gameStyles.notes} numberOfLines={2}>{item.notes}</Text>
          )}
        </View>
        <TouchableOpacity
          style={gameStyles.deleteBtn}
          onPress={() => handleDelete(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Trash2 size={14} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }, [formatDate, handleDelete]);

  if (!isReady) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: 'Game History',
        headerRight: () => (
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.push('/share-game-history')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Share2 size={18} color={Colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.push('/scan-history-qr')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ScanLine size={18} color={Colors.accent} />
            </TouchableOpacity>
          </View>
        ),
      }} />

      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Games</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.success }]}>{stats.wins}</Text>
          <Text style={styles.statLabel}>Wins</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.danger }]}>{stats.losses}</Text>
          <Text style={styles.statLabel}>Losses</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.primary }]}>{stats.winRate}%</Text>
          <Text style={styles.statLabel}>Win Rate</Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, filterResult === 'win' && { backgroundColor: Colors.success + '25', borderColor: Colors.success }]}
          onPress={() => setFilterResult(filterResult === 'win' ? null : 'win')}
        >
          <Text style={[styles.filterChipText, filterResult === 'win' && { color: Colors.success }]}>Wins</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filterResult === 'loss' && { backgroundColor: Colors.danger + '25', borderColor: Colors.danger }]}
          onPress={() => setFilterResult(filterResult === 'loss' ? null : 'loss')}
        >
          <Text style={[styles.filterChipText, filterResult === 'loss' && { color: Colors.danger }]}>Losses</Text>
        </TouchableOpacity>
        {(decks?.length ?? 0) > 0 && (
          <TouchableOpacity
            style={[styles.filterChip, filterDeckId !== null && styles.filterChipActive]}
            onPress={() => {
              if (filterDeckId !== null) {
                setFilterDeckId(null);
              } else if (decks && decks.length > 0) {
                setFilterDeckId(decks[0].id);
              }
            }}
          >
            <Filter size={12} color={filterDeckId !== null ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.filterChipText, filterDeckId !== null && { color: Colors.primary }]}>
              {filterDeckId !== null ? decks?.find(d => d.id === filterDeckId)?.name ?? 'Deck' : 'By Deck'}
            </Text>
          </TouchableOpacity>
        )}
        {(players?.length ?? 0) > 0 && (
          <TouchableOpacity
            style={[styles.filterChip, filterPlayer !== null && styles.filterChipActive]}
            onPress={() => {
              if (filterPlayer !== null) {
                setFilterPlayer(null);
              } else {
                setPlayerModalVisible(true);
              }
            }}
          >
            <Users size={12} color={filterPlayer !== null ? Colors.accent : Colors.textSecondary} />
            <Text style={[styles.filterChipText, filterPlayer !== null && { color: Colors.accent }]}>
              {filterPlayer !== null ? filterPlayer : 'By Player'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {filterDeckId !== null && decks && decks.length > 0 && (
        <View style={styles.deckFilterRow}>
          {decks.map(d => (
            <TouchableOpacity
              key={d.id}
              style={[styles.deckChip, filterDeckId === d.id && styles.deckChipActive]}
              onPress={() => setFilterDeckId(d.id)}
            >
              <Text style={[styles.deckChipText, filterDeckId === d.id && styles.deckChipTextActive]}>
                {d.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {filterPlayer !== null && (
        <View style={styles.deckFilterRow}>
          <TouchableOpacity
            style={[styles.deckChip, styles.playerChipActive]}
            onPress={() => setPlayerModalVisible(true)}
          >
            <Text style={styles.playerChipTextActive}>{filterPlayer}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.clearChip}
            onPress={() => setFilterPlayer(null)}
          >
            <XIcon size={12} color={Colors.textMuted} />
            <Text style={styles.clearChipText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={playerModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.playerModal}>
            <View style={styles.playerModalHeader}>
              <Text style={styles.playerModalTitle}>Select Player</Text>
              <TouchableOpacity onPress={() => setPlayerModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <XIcon size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.playerModalScroll} showsVerticalScrollIndicator={false}>
              {(players ?? []).map(p => {
                const isSelected = filterPlayer === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[styles.playerModalItem, isSelected && styles.playerModalItemActive]}
                    onPress={() => {
                      setFilterPlayer(p);
                      setPlayerModalVisible(false);
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <View style={[styles.playerModalDot, isSelected && { backgroundColor: Colors.accent }]} />
                    <Text style={[styles.playerModalName, isSelected && { color: Colors.accent }]}>{p}</Text>
                    {isSelected && <Check size={18} color={Colors.accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <FlatList
        data={games}
        renderItem={renderGame}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <EmptyState
              icon={<Calendar size={28} color={Colors.textMuted} />}
              title="No Games Yet"
              message="Log your first game from the Dashboard."
            />
          )
        }
      />
    </View>
  );
}

const gameStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  resultIndicator: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  resultText: {
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
  },
  date: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  deckName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  opponent: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  opponentDeck: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic' as const,
  },
  notes: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 12,
    alignSelf: 'flex-start',
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
  statsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
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
  deckFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 6,
    flexWrap: 'wrap',
  },
  deckChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  deckChipActive: {
    backgroundColor: Colors.primary + '20',
    borderColor: Colors.primary,
  },
  deckChipText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  deckChipTextActive: {
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  playerChipActive: {
    backgroundColor: Colors.accent + '20',
    borderColor: Colors.accent,
  },
  playerChipTextActive: {
    color: Colors.accent,
    fontWeight: '600' as const,
  },
  clearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  clearChipText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  playerModal: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    width: '100%',
    maxWidth: 340,
    maxHeight: '60%',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden' as const,
  },
  playerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  playerModalTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  playerModalScroll: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  playerModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 2,
  },
  playerModalItemActive: {
    backgroundColor: Colors.accent + '15',
  },
  playerModalDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.textMuted,
  },
  playerModalName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 4,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
});
