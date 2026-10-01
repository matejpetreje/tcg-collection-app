import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { Share2, Users, Check, ChevronRight, QrCode } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { safeQuery } from '@/utils/database';
import type { GameHistoryWithDeck } from '@/types/database';

const PLAYERS_STORAGE_KEY = 'lorcana_players';

interface SavedPlayer {
  id: string;
  name: string;
  remoteId?: string;
  aliases?: string[];
}

type Step = 'select-player' | 'preview' | 'qr';

export default function ShareGameHistoryScreen() {
  const router = useRouter();
  const { db, isReady } = useDatabase();
  const [step, setStep] = useState<Step>('select-player');
  const [selectedPlayerName, setSelectedPlayerName] = useState<string | null>(null);
  const [selectedGames, setSelectedGames] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState<boolean>(true);

  const { data: savedPlayers } = useQuery({
    queryKey: ['saved-players-share'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(PLAYERS_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as SavedPlayer[]) : [];
    },
  });

  const { data: players } = useQuery({
    queryKey: ['game-players-share', !!db],
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

  const allPlayerNames = useMemo(() => {
    const names = new Set<string>();
    players?.forEach(n => names.add(n));
    savedPlayers?.forEach(p => {
      names.add(p.name);
      p.aliases?.forEach(a => names.add(a));
    });
    return Array.from(names).sort();
  }, [players, savedPlayers]);

  const { data: games, isLoading: gamesLoading } = useQuery({
    queryKey: ['share-history-games', selectedPlayerName, !!db],
    queryFn: async () => {
      if (!db || !selectedPlayerName) return [];

      const playerObj = savedPlayers?.find(p => p.name === selectedPlayerName);
      const searchNames = [selectedPlayerName];
      if (playerObj?.aliases) {
        searchNames.push(...playerObj.aliases);
      }

      const placeholders = searchNames.map(() => '?').join(',');
      const sql = `SELECT gh.*, d.name as deck_name, d.ink_profile as deck_ink_profile
                   FROM game_history gh
                   LEFT JOIN decks d ON d.id = gh.deck_id
                   WHERE gh.opponent_name IN (${placeholders}) OR gh.player_name IN (${placeholders})
                   ORDER BY gh.played_at DESC
                   LIMIT 50`;
      return safeQuery<GameHistoryWithDeck>(db, sql, [...searchNames, ...searchNames]);
    },
    enabled: isReady && !!db && !!selectedPlayerName && step !== 'select-player',
  });

  const handleSelectPlayer = useCallback((name: string) => {
    setSelectedPlayerName(name);
    setStep('preview');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const toggleGame = useCallback((id: number) => {
    setSelectedGames(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setSelectAll(false);
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectAll) {
      setSelectedGames(new Set());
      setSelectAll(false);
    } else {
      setSelectedGames(new Set(games?.map(g => g.id) ?? []));
      setSelectAll(true);
    }
  }, [selectAll, games]);

  const gamesToShare = useMemo(() => {
    if (!games) return [];
    if (selectAll) return games;
    return games.filter(g => selectedGames.has(g.id));
  }, [games, selectedGames, selectAll]);

  const qrData = useMemo(() => {
    const compact = gamesToShare.slice(0, 20).map(g => ({
      r: g.result === 'win' ? 'w' : 'l',
      p: g.player_name ?? '',
      o: g.opponent_name ?? '',
      n: g.notes ?? '',
      d: g.played_at,
      dk: g.deck_name ?? '',
    }));
    return JSON.stringify({ t: 'h', g: compact });
  }, [gamesToShare]);

  const qrUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}&bgcolor=1A2736&color=ECE5D8&margin=10`;
  }, [qrData]);

  const formatDate = useCallback((iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch { return iso; }
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Share History' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (step === 'select-player') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Share Game History' }} />

        <View style={styles.header}>
          <Share2 size={28} color={Colors.accent} />
          <Text style={styles.headerTitle}>Share History</Text>
          <Text style={styles.headerSubtitle}>
            Select which player you want to share game history with
          </Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {allPlayerNames.length === 0 ? (
            <View style={styles.emptyBox}>
              <Users size={32} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No players found. Play some games first!</Text>
            </View>
          ) : (
            allPlayerNames.map(name => (
              <TouchableOpacity
                key={name}
                style={styles.playerItem}
                onPress={() => handleSelectPlayer(name)}
              >
                <View style={styles.playerAvatar}>
                  <Text style={styles.playerAvatarText}>{name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.playerName}>{name}</Text>
                <ChevronRight size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  if (step === 'preview') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: `Share with ${selectedPlayerName}` }} />

        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>
            Games with {selectedPlayerName}
          </Text>
          <TouchableOpacity style={styles.selectAllBtn} onPress={toggleSelectAll}>
            <View style={[styles.checkbox, selectAll && styles.checkboxActive]}>
              {selectAll && <Check size={12} color="#FFF" />}
            </View>
            <Text style={styles.selectAllText}>Select All ({games?.length ?? 0})</Text>
          </TouchableOpacity>
        </View>

        {gamesLoading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {(games ?? []).map(game => {
              const isSelected = selectAll || selectedGames.has(game.id);
              const isWin = game.result === 'win';
              return (
                <TouchableOpacity
                  key={game.id}
                  style={[styles.gameItem, isSelected && styles.gameItemSelected]}
                  onPress={() => toggleGame(game.id)}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                    {isSelected && <Check size={12} color="#FFF" />}
                  </View>
                  <View style={[styles.gameResult, { backgroundColor: isWin ? Colors.success + '20' : Colors.danger + '20' }]}>
                    <Text style={[styles.gameResultText, { color: isWin ? Colors.success : Colors.danger }]}>
                      {isWin ? 'W' : 'L'}
                    </Text>
                  </View>
                  <View style={styles.gameInfo}>
                    <Text style={styles.gameOpponent} numberOfLines={1}>
                      vs {game.opponent_name ?? 'Unknown'}
                    </Text>
                    {game.notes && (
                      <Text style={styles.gameNotes} numberOfLines={1}>{game.notes}</Text>
                    )}
                  </View>
                  <Text style={styles.gameDate}>{formatDate(game.played_at)}</Text>
                </TouchableOpacity>
              );
            })}
            {(games ?? []).length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No games found with this player.</Text>
              </View>
            )}
          </ScrollView>
        )}

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.generateBtn, gamesToShare.length === 0 && { opacity: 0.4 }]}
            onPress={() => {
              setStep('qr');
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
            disabled={gamesToShare.length === 0}
          >
            <QrCode size={20} color="#FFF" />
            <Text style={styles.generateBtnText}>
              Generate QR ({gamesToShare.length} game{gamesToShare.length !== 1 ? 's' : ''})
            </Text>
          </TouchableOpacity>
          {gamesToShare.length > 20 && (
            <Text style={styles.limitHint}>Only first 20 games will be included in QR</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Share QR Code' }} />

      <View style={styles.qrContent}>
        <Text style={styles.qrTitle}>Game History QR</Text>
        <Text style={styles.qrSubtitle}>
          {Math.min(gamesToShare.length, 20)} game{gamesToShare.length !== 1 ? 's' : ''} with {selectedPlayerName}
        </Text>

        <View style={styles.qrWrapper}>
          {Platform.OS === 'web' ? (
            <View style={styles.qrPlaceholder}>
              <QrCode size={40} color={Colors.textMuted} />
              <Text style={styles.qrPlaceholderText}>QR codes are best viewed on mobile</Text>
            </View>
          ) : (
            <Image
              source={{ uri: qrUrl }}
              style={styles.qrImage}
              contentFit="contain"
              placeholder={undefined}
            />
          )}
        </View>

        <Text style={styles.qrHint}>
          The other player should go to Game History and tap the scan icon to import these games.
        </Text>

        <View style={styles.qrActions}>
          <TouchableOpacity style={styles.qrBackBtn} onPress={() => setStep('preview')}>
            <Text style={styles.qrBackBtnText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.qrDoneBtn} onPress={() => router.back()}>
            <Text style={styles.qrDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 8,
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarText: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.accent,
  },
  playerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center' as const,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  gameItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  gameItemSelected: {
    borderColor: Colors.accent + '40',
    backgroundColor: Colors.accent + '08',
  },
  gameResult: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameResultText: {
    fontSize: 13,
    fontWeight: '800' as const,
  },
  gameInfo: {
    flex: 1,
    gap: 2,
  },
  gameOpponent: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  gameNotes: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  gameDate: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    alignItems: 'center',
    gap: 6,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
    width: '100%',
  },
  generateBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  limitHint: {
    fontSize: 11,
    color: Colors.warning,
  },
  qrContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  qrTitle: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  qrSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  qrWrapper: {
    width: 280,
    height: 280,
    borderRadius: 20,
    backgroundColor: '#1A2736',
    borderWidth: 2,
    borderColor: Colors.accent + '30',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden' as const,
  },
  qrImage: {
    width: 260,
    height: 260,
  },
  qrPlaceholder: {
    alignItems: 'center',
    gap: 12,
    padding: 20,
  },
  qrPlaceholderText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center' as const,
  },
  qrHint: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    lineHeight: 18,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  qrActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    width: '100%',
  },
  qrBackBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  qrBackBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  qrDoneBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.accent,
  },
  qrDoneBtnText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#FFF',
  },
});
