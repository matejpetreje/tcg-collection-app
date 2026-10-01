import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, Alert, Modal, ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Camera, X, UserPlus, Check, RefreshCw, Users } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

const PLAYERS_STORAGE_KEY = 'lorcana_players';

interface SavedPlayer {
  id: string;
  name: string;
  createdAt: number;
  remoteId?: string;
  aliases?: string[];
}

interface ScannedPlayerData {
  t: string;
  id: string;
  n: string;
}

export default function ScanPlayerQRScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedPlayer, setScannedPlayer] = useState<ScannedPlayerData | null>(null);
  const [existingPlayers, setExistingPlayers] = useState<SavedPlayer[]>([]);
  const [syncModalVisible, setSyncModalVisible] = useState<boolean>(false);
  const [selectedSyncPlayer, setSelectedSyncPlayer] = useState<SavedPlayer | null>(null);
  const scanProcessedRef = useRef<boolean>(false);

  const loadExistingPlayers = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(PLAYERS_STORAGE_KEY);
      if (stored) {
        setExistingPlayers(JSON.parse(stored));
      }
    } catch (e) {
      console.log('[ScanPlayerQR] Error loading players:', e);
    }
  }, []);

  useEffect(() => {
    void loadExistingPlayers();
  }, [loadExistingPlayers]);

  const handleBarCodeScanned = useCallback((result: BarcodeScanningResult) => {
    if (scanProcessedRef.current) return;

    try {
      const data = JSON.parse(result.data) as ScannedPlayerData;
      if (data.t !== 'p' || !data.id || !data.n) {
        console.log('[ScanPlayerQR] Invalid QR data:', result.data);
        return;
      }

      scanProcessedRef.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScannedPlayer(data);
    } catch (e) {
      console.log('[ScanPlayerQR] QR parse error:', e);
    }
  }, []);

  const addAsNewPlayer = useCallback(async () => {
    if (!scannedPlayer) return;

    try {
      const stored = await AsyncStorage.getItem(PLAYERS_STORAGE_KEY);
      const players: SavedPlayer[] = stored ? JSON.parse(stored) : [];

      const alreadyExists = players.some(p => p.remoteId === scannedPlayer.id);
      if (alreadyExists) {
        Alert.alert('Already Added', 'This player is already in your list.');
        router.back();
        return;
      }

      const nameExists = players.some(p => p.name.toLowerCase() === scannedPlayer.n.toLowerCase());
      if (nameExists) {
        Alert.alert('Name Conflict', `A player named "${scannedPlayer.n}" already exists. You can sync with them instead.`);
        return;
      }

      const newPlayer: SavedPlayer = {
        id: Date.now().toString(),
        name: scannedPlayer.n,
        createdAt: Date.now(),
        remoteId: scannedPlayer.id,
      };

      players.push(newPlayer);
      await AsyncStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players));

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Player Added', `${scannedPlayer.n} has been added to your player list.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      console.log('[ScanPlayerQR] Error adding player:', e);
      Alert.alert('Error', 'Failed to add player. Please try again.');
    }
  }, [scannedPlayer, router]);

  const syncWithExisting = useCallback(async () => {
    if (!scannedPlayer || !selectedSyncPlayer) return;

    try {
      const stored = await AsyncStorage.getItem(PLAYERS_STORAGE_KEY);
      const players: SavedPlayer[] = stored ? JSON.parse(stored) : [];

      const updated = players.map(p => {
        if (p.id === selectedSyncPlayer.id) {
          return {
            ...p,
            name: scannedPlayer.n,
            remoteId: scannedPlayer.id,
          };
        }
        return p;
      });

      await AsyncStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(updated));

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSyncModalVisible(false);
      Alert.alert(
        'Player Synced',
        `"${selectedSyncPlayer.name}" has been updated to "${scannedPlayer.n}". Game history will be synchronized.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e) {
      console.log('[ScanPlayerQR] Error syncing player:', e);
      Alert.alert('Error', 'Failed to sync player.');
    }
  }, [scannedPlayer, selectedSyncPlayer, router]);

  const handleRetry = useCallback(() => {
    scanProcessedRef.current = false;
    setScannedPlayer(null);
    setSelectedSyncPlayer(null);
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Scan Player QR' }} />
        <View style={styles.centerBox}>
          <Camera size={48} color={Colors.textMuted} />
          <Text style={styles.centerTitle}>QR Scanning</Text>
          <Text style={styles.centerText}>QR scanning is only available on mobile devices.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Scan Player QR' }} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Scan Player QR' }} />
        <View style={styles.centerBox}>
          <Camera size={48} color={Colors.primary} />
          <Text style={styles.centerTitle}>Camera Access Required</Text>
          <Text style={styles.centerText}>We need camera access to scan QR codes.</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Grant Access</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (scannedPlayer) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Player Found' }} />

        <View style={styles.resultContent}>
          <View style={styles.scannedAvatar}>
            <Text style={styles.scannedAvatarText}>
              {scannedPlayer.n.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.scannedName}>{scannedPlayer.n}</Text>
          <Text style={styles.scannedId}>ID: {scannedPlayer.id.slice(-8)}</Text>

          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.addNewBtn} onPress={addAsNewPlayer}>
              <UserPlus size={18} color="#FFF" />
              <Text style={styles.addNewBtnText}>Add as New Player</Text>
            </TouchableOpacity>

            {existingPlayers.length > 0 && (
              <TouchableOpacity
                style={styles.syncBtn}
                onPress={() => setSyncModalVisible(true)}
              >
                <RefreshCw size={18} color={Colors.accent} />
                <Text style={styles.syncBtnText}>Sync with Existing Player</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
              <Text style={styles.retryBtnText}>Scan Again</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Modal visible={syncModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.syncModal}>
              <View style={styles.syncModalHeader}>
                <Text style={styles.syncModalTitle}>Sync with Player</Text>
                <TouchableOpacity onPress={() => setSyncModalVisible(false)}>
                  <X size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.syncModalHint}>
                Select which player to sync with "{scannedPlayer.n}". Their name will be updated to match the scanned profile.
              </Text>
              <ScrollView style={styles.syncPlayerList} showsVerticalScrollIndicator={false}>
                {existingPlayers.map(p => {
                  const isSelected = selectedSyncPlayer?.id === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.syncPlayerItem, isSelected && styles.syncPlayerItemActive]}
                      onPress={() => setSelectedSyncPlayer(p)}
                    >
                      <View style={styles.syncPlayerAvatar}>
                        <Text style={styles.syncPlayerAvatarText}>
                          {p.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.syncPlayerInfo}>
                        <Text style={[styles.syncPlayerName, isSelected && { color: Colors.accent }]}>
                          {p.name}
                        </Text>
                        {isSelected && (
                          <Text style={styles.syncPreview}>
                            → will become "{scannedPlayer.n}"
                          </Text>
                        )}
                      </View>
                      {isSelected && <Check size={18} color={Colors.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity
                style={[styles.confirmSyncBtn, !selectedSyncPlayer && { opacity: 0.4 }]}
                onPress={syncWithExisting}
                disabled={!selectedSyncPlayer}
              >
                <RefreshCw size={16} color="#FFF" />
                <Text style={styles.confirmSyncBtnText}>Confirm Sync</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Scan Player QR', headerShown: false }} />
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarCodeScanned}
      >
        <View style={styles.overlay}>
          <View style={styles.overlayTop}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
              <X size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={styles.overlayBottom}>
            <Users size={24} color="#FFF" />
            <Text style={styles.instructionText}>
              Scan a player's QR code
            </Text>
            <Text style={styles.hintText}>
              Add them as new or sync with an existing player
            </Text>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  overlayTop: {
    paddingTop: 60,
    paddingHorizontal: 16,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingBottom: 40,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    alignSelf: 'center',
    position: 'relative' as const,
  },
  corner: {
    position: 'absolute' as const,
    width: 28,
    height: 28,
    borderColor: Colors.accent,
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 8 },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    paddingTop: 40,
    gap: 8,
  },
  instructionText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#FFF',
    textAlign: 'center' as const,
  },
  hintText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center' as const,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 16,
  },
  centerTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  centerText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
  },
  backBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  permBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  permBtnText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  resultContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
    gap: 8,
  },
  scannedAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent + '20',
    borderWidth: 3,
    borderColor: Colors.accent + '50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  scannedAvatarText: {
    fontSize: 36,
    fontWeight: '800' as const,
    color: Colors.accent,
  },
  scannedName: {
    fontSize: 26,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  scannedId: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 24,
  },
  actionButtons: {
    width: '100%',
    gap: 10,
  },
  addNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
  },
  addNewBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accent + '40',
  },
  syncBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.accent,
  },
  retryBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  syncModal: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 12,
  },
  syncModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  syncModalTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  syncModalHint: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  syncPlayerList: {
    maxHeight: 300,
  },
  syncPlayerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  syncPlayerItemActive: {
    backgroundColor: Colors.accent + '15',
  },
  syncPlayerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncPlayerAvatarText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  syncPlayerInfo: {
    flex: 1,
    gap: 2,
  },
  syncPlayerName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  syncPreview: {
    fontSize: 11,
    color: Colors.accent,
    fontStyle: 'italic' as const,
  },
  confirmSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  confirmSyncBtnText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#FFF',
  },
});
