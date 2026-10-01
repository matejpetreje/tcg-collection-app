import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Modal, Animated, Alert, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Target, Plus, UserPlus, Trash2, X, Swords, ChevronRight, Edit3, Check, ScanLine, Share2,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

const PLAYERS_STORAGE_KEY = 'lorcana_players';
const PRIMARY_PLAYER_KEY = 'lorcana_primary_player';

interface SavedPlayer {
  id: string;
  name: string;
  createdAt: number;
  remoteId?: string;
  aliases?: string[];
}

export default function LorePlayerSelectScreen() {
  const router = useRouter();
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>([]);
  const [primaryPlayerName, setPrimaryPlayerName] = useState<string | null>(null);
  const [selectedOpponent, setSelectedOpponent] = useState<SavedPlayer | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [editingPlayer, setEditingPlayer] = useState<SavedPlayer | null>(null);
  const [editName, setEditName] = useState('');
  const [manageOpponent, setManageOpponent] = useState<SavedPlayer | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const loadPlayers = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(PLAYERS_STORAGE_KEY);
      if (stored) {
        setSavedPlayers(JSON.parse(stored));
      }
      const primary = await AsyncStorage.getItem(PRIMARY_PLAYER_KEY);
      setPrimaryPlayerName(primary);
    } catch (e) {
      console.log('[LorePlayerSelect] Error loading players:', e);
    }
  }, []);

  useEffect(() => {
    void loadPlayers();
  }, [loadPlayers]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const primaryPlayer = savedPlayers.find(p => p.name === primaryPlayerName) ?? null;

  const opponents = savedPlayers.filter(p => p.name !== primaryPlayerName);

  const savePlayers = useCallback(async (players: SavedPlayer[]) => {
    try {
      await AsyncStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players));
      setSavedPlayers(players);
    } catch (e) {
      console.log('[LorePlayerSelect] Error saving players:', e);
    }
  }, []);

  const createPlayer = useCallback(() => {
    const trimmed = newPlayerName.trim();
    if (!trimmed) return;
    if (savedPlayers.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Duplicate', 'A player with this name already exists.');
      return;
    }
    const newPlayer: SavedPlayer = {
      id: Date.now().toString(),
      name: trimmed,
      createdAt: Date.now(),
    };
    const updated = [...savedPlayers, newPlayer];
    void savePlayers(updated);
    setNewPlayerName('');
    setCreateModalVisible(false);

    if (!selectedOpponent) {
      setSelectedOpponent(newPlayer);
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [newPlayerName, savedPlayers, savePlayers, selectedOpponent]);

  const deletePlayer = useCallback((playerId: string) => {
    Alert.alert('Delete Player', 'Are you sure you want to remove this player?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const updated = savedPlayers.filter(p => p.id !== playerId);
          void savePlayers(updated);
          if (selectedOpponent?.id === playerId) {
            setSelectedOpponent(null);
          }
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  }, [savedPlayers, savePlayers, selectedOpponent]);

  const updatePlayer = useCallback(() => {
    const trimmed = editName.trim();
    if (!trimmed || !editingPlayer) return;
    if (savedPlayers.some(p => p.id !== editingPlayer.id && p.name.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Duplicate', 'A player with this name already exists.');
      return;
    }
    const updated = savedPlayers.map(p =>
      p.id === editingPlayer.id ? { ...p, name: trimmed } : p
    );
    void savePlayers(updated);
    if (selectedOpponent?.id === editingPlayer.id) {
      setSelectedOpponent({ ...selectedOpponent, name: trimmed });
    }
    setEditingPlayer(null);
    setEditName('');
  }, [editName, editingPlayer, savedPlayers, savePlayers, selectedOpponent]);

  const startGame = useCallback(() => {
    const p1Name = primaryPlayerName ?? 'Player 1';
    const p2Name = selectedOpponent?.name ?? 'Player 2';
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push({
      pathname: '/lore-counter',
      params: { player1: p1Name, player2: p2Name },
    });
  }, [primaryPlayerName, selectedOpponent, router]);

  const handleShareProfile = useCallback(() => {
    if (!primaryPlayer) {
      Alert.alert('No Primary Player', 'Set a primary player in Settings first.');
      return;
    }
    router.push({
      pathname: '/player-profile-qr',
      params: { playerId: primaryPlayer.id, playerName: primaryPlayer.name },
    });
  }, [primaryPlayer, router]);

  const canStart = primaryPlayerName !== null && selectedOpponent !== null;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <View style={styles.heroTopRow}>
            <View style={{ width: 40 }} />
            <Animated.View style={[styles.heroIcon, { transform: [{ scale: pulseAnim }] }]}>
              <Target size={40} color={Colors.primary} />
            </Animated.View>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={handleShareProfile}
              testID="share-profile-btn"
            >
              <Share2 size={18} color={Colors.accent} />
            </TouchableOpacity>
          </View>
          <Text style={styles.heroTitle}>Lore Counter</Text>
          <Text style={styles.heroSubtitle}>Select opponent and start a game</Text>
        </View>

        <View style={styles.slotsSection}>
          <Text style={styles.sectionLabel}>PLAYERS</Text>

          <View style={styles.slotCard}>
            <View style={styles.slotHeader}>
              <View style={[styles.slotIndicator, { backgroundColor: '#C9975B' }]} />
              <Text style={styles.slotLabel}>Player 1 (You)</Text>
            </View>

            {primaryPlayerName ? (
              <View style={styles.selectedPlayerRow}>
                <View style={styles.selectedPlayerInfo}>
                  <View style={[styles.playerAvatar, { backgroundColor: '#C9975B20' }]}>
                    <Text style={[styles.avatarText, { color: '#C9975B' }]}>
                      {primaryPlayerName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.selectedPlayerName}>{primaryPlayerName}</Text>
                </View>
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.noPrimaryRow}
                onPress={() => router.push('/(tabs)/settings')}
              >
                <Text style={styles.noPrimaryText}>No primary player set</Text>
                <Text style={styles.noPrimaryHint}>Tap to go to Settings</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.slotCard}>
            <View style={styles.slotHeader}>
              <View style={[styles.slotIndicator, { backgroundColor: '#3AAFA9' }]} />
              <Text style={styles.slotLabel}>Player 2 (Opponent)</Text>
            </View>

            {selectedOpponent ? (
              <View style={styles.selectedPlayerRow}>
                <View style={styles.selectedPlayerInfo}>
                  <View style={[styles.playerAvatar, { backgroundColor: '#3AAFA920' }]}>
                    <Text style={[styles.avatarText, { color: '#3AAFA9' }]}>
                      {selectedOpponent.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.selectedPlayerName}>{selectedOpponent.name}</Text>
                </View>
                <View style={styles.selectedPlayerActions}>
                  <TouchableOpacity
                    style={styles.smallActionBtn}
                    onPress={() => {
                      setEditingPlayer(selectedOpponent);
                      setEditName(selectedOpponent.name);
                    }}
                  >
                    <Edit3 size={14} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={() => setSelectedOpponent(null)}
                  >
                    <X size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.playerOptions}>
                {opponents.length > 0 ? (
                  <View style={styles.opponentsList}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.playerChipsScroll}
                    >
                      {opponents.map(player => (
                        <TouchableOpacity
                          key={player.id}
                          style={styles.playerChip}
                          onPress={() => {
                            setSelectedOpponent(player);
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                          onLongPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            setManageOpponent(player);
                          }}
                        >
                          <Text style={styles.playerChipText}>{player.name}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={styles.addChip}
                        onPress={() => setCreateModalVisible(true)}
                      >
                        <Plus size={14} color={Colors.primary} />
                        <Text style={styles.addChipText}>New</Text>
                      </TouchableOpacity>
                    </ScrollView>
                    <View style={styles.opponentsToolbar}>
                      <TouchableOpacity
                        style={styles.scanPlayerBtn}
                        onPress={() => router.push('/scan-player-qr')}
                      >
                        <ScanLine size={13} color={Colors.accent} />
                        <Text style={styles.scanPlayerBtnText}>Scan QR</Text>
                      </TouchableOpacity>
                      <Text style={styles.longPressHint}>Long press to edit</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.emptyOpponents}>
                    <TouchableOpacity
                      style={styles.createFirstBtn}
                      onPress={() => setCreateModalVisible(true)}
                    >
                      <UserPlus size={18} color={Colors.primary} />
                      <Text style={styles.createFirstText}>Add an opponent</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.scanFirstBtn}
                      onPress={() => router.push('/scan-player-qr')}
                    >
                      <ScanLine size={16} color={Colors.accent} />
                      <Text style={styles.scanFirstText}>Scan QR</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.startBtn, !canStart && styles.startBtnAlt]}
          onPress={startGame}
          activeOpacity={0.7}
        >
          <Swords size={20} color="#FFF" />
          <Text style={styles.startBtnText}>
            {canStart ? 'Start Game' : 'Quick Game'}
          </Text>
          <ChevronRight size={18} color="#FFF" />
        </TouchableOpacity>
        {!canStart && (
          <Text style={styles.quickHint}>
            {!primaryPlayerName
              ? 'Set a primary player in Settings for full tracking'
              : 'Select an opponent or start with defaults'}
          </Text>
        )}
      </View>

      <Modal visible={createModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Player</Text>
              <TouchableOpacity onPress={() => { setCreateModalVisible(false); setNewPlayerName(''); }}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={newPlayerName}
              onChangeText={setNewPlayerName}
              placeholder="Player name..."
              placeholderTextColor={Colors.textMuted}
              maxLength={20}
              autoFocus
              onSubmitEditing={createPlayer}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.modalBtn, !newPlayerName.trim() && styles.modalBtnDisabled]}
              onPress={createPlayer}
              disabled={!newPlayerName.trim()}
            >
              <UserPlus size={18} color="#FFF" />
              <Text style={styles.modalBtnText}>Create Player</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={manageOpponent !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{manageOpponent?.name ?? ''}</Text>
              <TouchableOpacity onPress={() => setManageOpponent(null)}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {manageOpponent?.remoteId && (
              <View style={styles.linkedBadgeRow}>
                <Text style={styles.playerLinkedBadge}>Linked</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.manageOption}
              onPress={() => {
                if (manageOpponent) {
                  setEditingPlayer(manageOpponent);
                  setEditName(manageOpponent.name);
                }
                setManageOpponent(null);
              }}
            >
              <Edit3 size={18} color={Colors.accent} />
              <Text style={styles.manageOptionText}>Edit Name</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.manageOption}
              onPress={() => {
                if (manageOpponent) {
                  deletePlayer(manageOpponent.id);
                }
                setManageOpponent(null);
              }}
            >
              <Trash2 size={18} color={Colors.danger} />
              <Text style={[styles.manageOptionText, { color: Colors.danger }]}>Delete Player</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={editingPlayer !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Player</Text>
              <TouchableOpacity onPress={() => { setEditingPlayer(null); setEditName(''); }}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="Player name..."
              placeholderTextColor={Colors.textMuted}
              maxLength={20}
              autoFocus
              onSubmitEditing={updatePlayer}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.modalBtn, !editName.trim() && styles.modalBtnDisabled]}
              onPress={updatePlayer}
              disabled={!editName.trim()}
            >
              <Check size={18} color="#FFF" />
              <Text style={styles.modalBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 4,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary + '15',
    borderWidth: 2,
    borderColor: Colors.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent + '15',
    borderWidth: 1,
    borderColor: Colors.accent + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
    letterSpacing: 1,
  },
  heroSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  slotsSection: {
    gap: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  slotCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 12,
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slotIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  slotLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  selectedPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedPlayerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800' as const,
  },
  selectedPlayerName: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  primaryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.primary + '20',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  primaryBadgeText: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: Colors.primary,
    letterSpacing: 1,
  },
  noPrimaryRow: {
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    backgroundColor: Colors.warning + '10',
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  noPrimaryText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.warning,
  },
  noPrimaryHint: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerOptions: {
    minHeight: 44,
    justifyContent: 'center',
  },
  playerChipsScroll: {
    gap: 8,
    paddingRight: 8,
  },
  playerChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  playerChipText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
  },
  addChipText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  createFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary + '30',
  },
  createFirstText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  playersListSection: {
    marginTop: 24,
    gap: 8,
  },
  playersListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  playersListActions: {
    flexDirection: 'row',
    gap: 6,
  },
  scanPlayerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.accent + '15',
  },
  scanPlayerBtnText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.accent,
  },
  addPlayerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.primary + '15',
  },
  addPlayerBtnText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  playerListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  playerListItemPrimary: {
    borderColor: Colors.primary + '40',
    backgroundColor: Colors.primary + '08',
  },
  playerListAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerListAvatarText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  playerListInfo: {
    flex: 1,
    gap: 2,
  },
  playerListName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  playerPrimaryBadge: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.primary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  playerLinkedBadge: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.accent,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  playerActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    backgroundColor: Colors.background + 'F0',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    alignItems: 'center',
    gap: 6,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    width: '100%',
  },
  startBtnAlt: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.primary + '50',
  },
  startBtnText: {
    fontSize: 17,
    fontWeight: '800' as const,
    color: '#FFF',
    letterSpacing: 0.5,
  },
  quickHint: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  modalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  modalBtnDisabled: {
    opacity: 0.4,
  },
  modalBtnText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  selectedPlayerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smallActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opponentsList: {
    gap: 8,
  },
  opponentsToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  longPressHint: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic' as const,
  },
  emptyOpponents: {
    gap: 8,
  },
  scanFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.accent + '30',
  },
  scanFirstText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.accent,
  },
  linkedBadgeRow: {
    flexDirection: 'row',
    marginTop: -8,
  },
  manageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  manageOptionText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
});
