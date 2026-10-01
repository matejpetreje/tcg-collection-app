import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Modal,
  PanResponder, StatusBar, ScrollView,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { RotateCcw, Menu, Undo2, History, Trophy, X, Save, LogOut, Users } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useDatabase } from '@/providers/DatabaseProvider';
import { safeRun } from '@/utils/database';
import Colors from '@/constants/colors';

const TARGET_LORE = 20;
const LONG_PRESS_INTERVAL = 120;
const LONG_PRESS_DELAY = 400;
const SWIPE_THRESHOLD = 60;

interface LoreChange {
  player: number;
  delta: number;
  loreAfter: number;
  timestamp: number;
}

interface PlayerState {
  lore: number;
  name: string;
}

const PLAYER_COLORS = ['#C9975B', '#3AAFA9'] as const;
const PLAYER_BG = ['#1E1408', '#081E1C'] as const;

export default function LoreCounterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ player1?: string; player2?: string }>();
  const { db } = useDatabase();
  const queryClient = useQueryClient();
  const gameSavedRef = useRef<boolean>(false);


  const [players, setPlayers] = useState<PlayerState[]>([
    { lore: 0, name: params.player1 || 'Player 1' },
    { lore: 0, name: params.player2 || 'Player 2' },
  ]);
  const [history, setHistory] = useState<LoreChange[]>([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [resultVisible, setResultVisible] = useState(false);

  const [editingNames, setEditingNames] = useState(false);

  const pulseAnims = useRef([new Animated.Value(1), new Animated.Value(1)]).current;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const animatePulse = useCallback((index: number) => {
    Animated.sequence([
      Animated.timing(pulseAnims[index], { toValue: 1.12, duration: 80, useNativeDriver: true }),
      Animated.timing(pulseAnims[index], { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  }, [pulseAnims]);

  const updateLore = useCallback((playerIndex: number, delta: number) => {
    if (winnerIndex !== null) return;

    setPlayers(prev => {
      const updated = [...prev];
      const newVal = Math.max(0, updated[playerIndex].lore + delta);
      updated[playerIndex] = { ...updated[playerIndex], lore: newVal };
      return updated;
    });

    setHistory(prev => {
      const currentLore = players[playerIndex].lore;
      const newLore = Math.max(0, currentLore + delta);
      return [...prev, {
        player: playerIndex,
        delta,
        loreAfter: newLore,
        timestamp: Date.now(),
      }];
    });

    animatePulse(playerIndex);
    void Haptics.impactAsync(
      delta > 0 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
    );
  }, [animatePulse, winnerIndex, players]);

  useEffect(() => {
    if (winnerIndex !== null) return;
    for (let i = 0; i < players.length; i++) {
      if (players[i].lore >= TARGET_LORE) {
        setWinnerIndex(i);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      }
    }
  }, [players, winnerIndex]);

  const undoLast = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setPlayers(prev => {
      const updated = [...prev];
      updated[last.player] = {
        ...updated[last.player],
        lore: Math.max(0, updated[last.player].lore - last.delta),
      };
      return updated;
    });
    setHistory(prev => prev.slice(0, -1));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [history]);

  const saveGameToHistory = useCallback(async (winner: number) => {
    if (gameSavedRef.current || !db) return;
    gameSavedRef.current = true;
    try {
      const winnerName = players[winner].name;
      const loserIndex = winner === 0 ? 1 : 0;
      const loserName = players[loserIndex].name;
      const winnerLore = players[winner].lore;
      const loserLore = players[loserIndex].lore;
      const notes = `Lore Counter: ${winnerName} ${winnerLore} - ${loserName} ${loserLore}`;

      const result: 'win' | 'loss' = winner === 0 ? 'win' : 'loss';
      const opponent = players[1].name;

      await safeRun(
        db,
        `INSERT INTO game_history (deck_id, result, player_name, opponent_name, opponent_deck, notes, played_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [null, result, players[0].name, opponent, null, notes]
      );
      console.log('[LoreCounter] Game saved to history (Player 1 perspective):', notes, 'result:', result);
      void queryClient.invalidateQueries({ queryKey: ['game-history'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    } catch (e) {
      console.log('[LoreCounter] Error saving game:', e);
    }
  }, [db, players, queryClient]);

  const resetGame = useCallback(() => {
    if (winnerIndex !== null && !gameSavedRef.current) {
      void saveGameToHistory(winnerIndex);
    }
    gameSavedRef.current = false;
    setPlayers(prev => prev.map(p => ({ ...p, lore: 0 })));
    setHistory([]);
    setWinnerIndex(null);
    setResultVisible(false);
    setMenuVisible(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [winnerIndex, saveGameToHistory]);

  const confirmWinner = useCallback(() => {
    if (winnerIndex !== null && !gameSavedRef.current) {
      void saveGameToHistory(winnerIndex);
    }
    setResultVisible(true);
  }, [winnerIndex, saveGameToHistory]);

  const saveAndExit = useCallback(() => {
    if (winnerIndex !== null && !gameSavedRef.current) {
      void saveGameToHistory(winnerIndex);
    } else if (winnerIndex === null && history.length > 0) {
      const p0 = players[0].lore;
      const p1 = players[1].lore;
      const winner = p0 >= p1 ? 0 : 1;
      void saveGameToHistory(winner);
    }
    setMenuVisible(false);
    setResultVisible(false);
    router.back();
  }, [router, winnerIndex, saveGameToHistory, history.length, players]);

  const startLongPress = useCallback((playerIndex: number, delta: number) => {
    longPressTimerRef.current = setTimeout(() => {
      longPressIntervalRef.current = setInterval(() => {
        updateLore(playerIndex, delta);
      }, LONG_PRESS_INTERVAL);
    }, LONG_PRESS_DELAY);
  }, [updateLore]);

  const stopLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (longPressIntervalRef.current) {
      clearInterval(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
  }, []);

  const createSwipeResponder = useCallback((playerIndex: number, isTop: boolean) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 20 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderRelease: (_, gs) => {
        if (isTop) {
          if (gs.dy > SWIPE_THRESHOLD) {
            updateLore(playerIndex, 5);
          } else if (gs.dy < -SWIPE_THRESHOLD) {
            updateLore(playerIndex, -5);
          }
        } else {
          if (gs.dy < -SWIPE_THRESHOLD) {
            updateLore(playerIndex, 5);
          } else if (gs.dy > SWIPE_THRESHOLD) {
            updateLore(playerIndex, -5);
          }
        }
      },
    });
  }, [updateLore]);

  const swipeResponder0 = useMemo(() => createSwipeResponder(0, false), [createSwipeResponder]);
  const swipeResponder1 = useMemo(() => createSwipeResponder(1, true), [createSwipeResponder]);

  const renderPlayerPanel = useCallback((playerIndex: number, isTop: boolean) => {
    const player = players[playerIndex];
    const color = PLAYER_COLORS[playerIndex];
    const bg = PLAYER_BG[playerIndex];
    const responder = playerIndex === 0 ? swipeResponder0 : swipeResponder1;

    return (
      <View
        style={[styles.playerPanel, { backgroundColor: bg }, isTop && styles.playerPanelTop]}
        {...responder.panHandlers}
      >
        <View style={[styles.playerInner, isTop && styles.rotated]}>
          <Text style={[styles.playerName, { color: color + 'AA' }]}>{player.name}</Text>

          <View style={styles.loreRow}>
            {isTop ? (
              <>
                <TouchableOpacity
                  style={[styles.loreBtn, { backgroundColor: '#E74C3C18', borderColor: '#E74C3C40' }]}
                  onPress={() => updateLore(playerIndex, -1)}
                  onPressIn={() => startLongPress(playerIndex, -1)}
                  onPressOut={stopLongPress}
                  activeOpacity={0.6}
                  testID={`lore-minus-${playerIndex}`}
                >
                  <Text style={styles.loreBtnTextMinus}>−</Text>
                </TouchableOpacity>

                <Animated.View style={[styles.loreCenter, { transform: [{ scale: pulseAnims[playerIndex] }] }]}>
                  <Text style={[styles.loreValue, { color }]}>{player.lore}</Text>
                  <Text style={[styles.loreLabel, { color: color + '60' }]}>LORE</Text>
                </Animated.View>

                <TouchableOpacity
                  style={[styles.loreBtn, { backgroundColor: '#27AE6018', borderColor: '#27AE6040' }]}
                  onPress={() => updateLore(playerIndex, 1)}
                  onPressIn={() => startLongPress(playerIndex, 1)}
                  onPressOut={stopLongPress}
                  activeOpacity={0.6}
                  testID={`lore-plus-${playerIndex}`}
                >
                  <Text style={styles.loreBtnTextPlus}>+</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.loreBtn, { backgroundColor: '#E74C3C18', borderColor: '#E74C3C40' }]}
                  onPress={() => updateLore(playerIndex, -1)}
                  onPressIn={() => startLongPress(playerIndex, -1)}
                  onPressOut={stopLongPress}
                  activeOpacity={0.6}
                  testID={`lore-minus-${playerIndex}`}
                >
                  <Text style={styles.loreBtnTextMinus}>−</Text>
                </TouchableOpacity>

                <Animated.View style={[styles.loreCenter, { transform: [{ scale: pulseAnims[playerIndex] }] }]}>
                  <Text style={[styles.loreValue, { color }]}>{player.lore}</Text>
                  <Text style={[styles.loreLabel, { color: color + '60' }]}>LORE</Text>
                </Animated.View>

                <TouchableOpacity
                  style={[styles.loreBtn, { backgroundColor: '#27AE6018', borderColor: '#27AE6040' }]}
                  onPress={() => updateLore(playerIndex, 1)}
                  onPressIn={() => startLongPress(playerIndex, 1)}
                  onPressOut={stopLongPress}
                  activeOpacity={0.6}
                  testID={`lore-plus-${playerIndex}`}
                >
                  <Text style={styles.loreBtnTextPlus}>+</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <Text style={[styles.swipeHint, { color: color + '40' }]}>Swipe ↑+5 / ↓−5</Text>
        </View>
      </View>
    );
  }, [players, pulseAnims, updateLore, startLongPress, stopLongPress, swipeResponder0, swipeResponder1]);

  const historyReversed = useMemo(() => [...history].reverse(), [history]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      {renderPlayerPanel(1, true)}

      <View style={styles.centerDivider}>
        <View style={styles.centerLine} />
        <View style={styles.centerBadge}>
          <Text style={styles.centerTarget}>{TARGET_LORE}</Text>
        </View>
        <View style={styles.centerLine} />
      </View>

      <View style={[styles.topControls, { top: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={resetGame}
          testID="lore-reset"
        >
          <RotateCcw size={18} color={Colors.text} />
        </TouchableOpacity>

      </View>

      <View style={styles.sideControls}>
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={undoLast}
          disabled={history.length === 0}
        >
          <Undo2 size={18} color={history.length > 0 ? Colors.text : Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => setHistoryVisible(true)}
        >
          <History size={18} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {renderPlayerPanel(0, false)}

      <View style={[styles.bottomMenu, { bottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setMenuVisible(true)}
          testID="lore-menu"
        >
          <Menu size={20} color={Colors.text} />
          <Text style={styles.menuButtonText}>MENU</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={winnerIndex !== null && !resultVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.winnerCard}>
            <Trophy size={48} color="#FFD700" />
            <Text style={styles.winnerTitle}>Victory!</Text>
            <Text style={styles.winnerName}>
              {winnerIndex !== null ? players[winnerIndex].name : ''}
            </Text>
            <Text style={styles.winnerLore}>
              reached {winnerIndex !== null ? players[winnerIndex].lore : 0} Lore
            </Text>
            <TouchableOpacity style={styles.winnerBtn} onPress={confirmWinner}>
              <Text style={styles.winnerBtnText}>View Results</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.winnerBtnSecondary} onPress={resetGame}>
              <Text style={styles.winnerBtnSecondaryText}>New Game</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={resultVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Match Results</Text>
            <View style={styles.resultDivider} />
            {players.map((p, i) => (
              <View key={i} style={[styles.resultRow, winnerIndex === i && styles.resultRowWinner]}>
                <View style={[styles.resultDot, { backgroundColor: PLAYER_COLORS[i] }]} />
                <Text style={styles.resultPlayerName}>{p.name}</Text>
                <Text style={[styles.resultLore, { color: PLAYER_COLORS[i] }]}>{p.lore}</Text>
                {winnerIndex === i && (
                  <View style={styles.resultWinBadge}>
                    <Trophy size={14} color="#FFD700" />
                  </View>
                )}
              </View>
            ))}
            <View style={styles.resultDivider} />
            <Text style={styles.resultMoves}>{history.length} moves played</Text>
            <View style={styles.resultActions}>
              <TouchableOpacity style={styles.resultBtn} onPress={resetGame}>
                <RotateCcw size={16} color={Colors.text} />
                <Text style={styles.resultBtnText}>New Game</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.resultBtn, styles.resultBtnPrimary]} onPress={saveAndExit}>
                <Save size={16} color="#FFF" />
                <Text style={[styles.resultBtnText, { color: '#FFF' }]}>Save & Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={menuVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.menuCard}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Game Menu</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.menuItem} onPress={resetGame}>
              <RotateCcw size={20} color={Colors.warning} />
              <Text style={styles.menuItemText}>Restart Game</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => {
              setEditingNames(!editingNames);
              setMenuVisible(false);
            }}>
              <Users size={20} color={Colors.accent} />
              <Text style={styles.menuItemText}>Change Players</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => {
              setMenuVisible(false);
              setHistoryVisible(true);
            }}>
              <History size={20} color={Colors.primary} />
              <Text style={styles.menuItemText}>Lore History</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => {
              setWinnerIndex(players[0].lore >= players[1].lore ? 0 : 1);
              setMenuVisible(false);
            }}>
              <Trophy size={20} color="#FFD700" />
              <Text style={styles.menuItemText}>End Match</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={saveAndExit}>
              <LogOut size={20} color={Colors.danger} />
              <Text style={[styles.menuItemText, { color: Colors.danger }]}>Save & Exit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={historyVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.historyCard}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Lore History</Text>
              <TouchableOpacity onPress={() => setHistoryVisible(false)}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {history.length === 0 ? (
              <Text style={styles.historyEmpty}>No changes yet</Text>
            ) : (
              <ScrollView style={styles.historyScroll} showsVerticalScrollIndicator={false}>
                {historyReversed.map((entry, idx) => {
                  const moveNum = history.length - idx;
                  const pColor = PLAYER_COLORS[entry.player];
                  const isPositive = entry.delta > 0;
                  return (
                    <View key={idx} style={styles.historyRow}>
                      <View style={styles.historyMoveNum}>
                        <Text style={styles.historyMoveText}>#{moveNum}</Text>
                      </View>
                      <View style={[styles.historyDot, { backgroundColor: pColor }]} />
                      <Text style={[styles.historyPlayer, { color: pColor }]}>
                        {players[entry.player].name}
                      </Text>
                      <Text style={[
                        styles.historyDelta,
                        { color: isPositive ? Colors.success : Colors.danger }
                      ]}>
                        {isPositive ? '+' : ''}{entry.delta}
                      </Text>
                      <Text style={styles.historyResult}>→ {entry.loreAfter}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={editingNames} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.menuCard}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Player Names</Text>
              <TouchableOpacity onPress={() => setEditingNames(false)}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {players.map((p, i) => (
              <View key={i} style={styles.nameRow}>
                <View style={[styles.nameDot, { backgroundColor: PLAYER_COLORS[i] }]} />
                <View style={styles.nameInputWrap}>
                  {['Player 1', 'Player 2', 'Hero', 'Villain', 'Amber', 'Sapphire'].map(name => (
                    <TouchableOpacity
                      key={name}
                      style={[
                        styles.nameChip,
                        p.name === name && { backgroundColor: PLAYER_COLORS[i] + '30', borderColor: PLAYER_COLORS[i] },
                      ]}
                      onPress={() => {
                        setPlayers(prev => {
                          const u = [...prev];
                          u[i] = { ...u[i], name };
                          return u;
                        });
                      }}
                    >
                      <Text style={[
                        styles.nameChipText,
                        p.name === name && { color: PLAYER_COLORS[i] },
                      ]}>{name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E14',
  },
  playerPanel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerPanelTop: {
    borderBottomWidth: 0,
  },
  rotated: {
    transform: [{ rotate: '180deg' }],
  },
  playerInner: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 24,
    gap: 8,
  },
  playerName: {
    fontSize: 13,
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 3,
    marginBottom: 4,
  },
  loreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
  },
  loreBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  loreBtnTextPlus: {
    fontSize: 36,
    fontWeight: '300' as const,
    color: '#27AE60',
    marginTop: -2,
  },
  loreBtnTextMinus: {
    fontSize: 36,
    fontWeight: '300' as const,
    color: '#E74C3C',
    marginTop: -4,
  },
  loreCenter: {
    alignItems: 'center',
    minWidth: 120,
  },
  loreValue: {
    fontSize: 88,
    fontWeight: '900' as const,
    lineHeight: 96,
  },
  loreLabel: {
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 6,
    marginTop: -2,
  },
  swipeHint: {
    fontSize: 10,
    fontWeight: '600' as const,
    letterSpacing: 1,
    marginTop: 4,
  },
  centerDivider: {
    position: 'absolute' as const,
    top: '50%',
    left: 0,
    right: 0,
    marginTop: -16,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
    paddingHorizontal: 16,
  },
  centerLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#2E4052',
  },
  centerBadge: {
    width: 44,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1A2736',
    borderWidth: 2,
    borderColor: '#C9975B40',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  centerTarget: {
    fontSize: 14,
    fontWeight: '900' as const,
    color: '#C9975B',
  },
  topControls: {
    position: 'absolute' as const,
    right: 16,
    zIndex: 30,
    flexDirection: 'row',
    gap: 8,
  },
  sideControls: {
    position: 'absolute' as const,
    left: 12,
    top: '50%',
    marginTop: -50,
    zIndex: 30,
    gap: 8,
  },
  controlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A273680',
    borderWidth: 1,
    borderColor: '#2E405280',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomMenu: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1A273690',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2E405260',
  },
  menuButtonText: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: Colors.text,
    letterSpacing: 2,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  winnerCard: {
    backgroundColor: '#1A2736',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    borderWidth: 2,
    borderColor: '#FFD70040',
    gap: 12,
  },
  winnerTitle: {
    fontSize: 28,
    fontWeight: '900' as const,
    color: '#FFD700',
    letterSpacing: 2,
  },
  winnerName: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  winnerLore: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  winnerBtn: {
    backgroundColor: '#C9975B',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  winnerBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  winnerBtnSecondary: {
    paddingVertical: 10,
  },
  winnerBtnSecondaryText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  resultCard: {
    backgroundColor: '#1A2736',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#2E4052',
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center' as const,
    marginBottom: 8,
  },
  resultDivider: {
    height: 1,
    backgroundColor: '#2E4052',
    marginVertical: 16,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  resultRowWinner: {
    backgroundColor: '#FFD70010',
    borderWidth: 1,
    borderColor: '#FFD70030',
  },
  resultDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  resultPlayerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  resultLore: {
    fontSize: 24,
    fontWeight: '900' as const,
  },
  resultWinBadge: {
    marginLeft: 8,
  },
  resultMoves: {
    textAlign: 'center' as const,
    color: Colors.textSecondary,
    fontSize: 13,
    marginBottom: 16,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 12,
  },
  resultBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#243447',
    borderWidth: 1,
    borderColor: '#2E4052',
  },
  resultBtnPrimary: {
    backgroundColor: '#C9975B',
    borderColor: '#C9975B',
  },
  resultBtnText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  menuCard: {
    backgroundColor: '#1A2736',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#2E4052',
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#2E4052',
    marginVertical: 8,
  },
  historyCard: {
    backgroundColor: '#1A2736',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: '#2E4052',
  },
  historyEmpty: {
    textAlign: 'center' as const,
    color: Colors.textMuted,
    fontSize: 14,
    paddingVertical: 32,
  },
  historyScroll: {
    maxHeight: 400,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2E405230',
  },
  historyMoveNum: {
    width: 36,
  },
  historyMoveText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textMuted,
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  historyPlayer: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  historyDelta: {
    fontSize: 16,
    fontWeight: '800' as const,
    width: 40,
    textAlign: 'right' as const,
  },
  historyResult: {
    fontSize: 13,
    color: Colors.textSecondary,
    width: 44,
    textAlign: 'right' as const,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  nameDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 10,
  },
  nameInputWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  nameChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#24344720',
    borderWidth: 1,
    borderColor: '#2E405240',
  },
  nameChipText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
});
