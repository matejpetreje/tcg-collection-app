import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, Alert, ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Camera, X, Download, Check, Trophy, X as XIcon } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { safeRun } from '@/utils/database';

interface CompactGame {
  r: string;
  p: string;
  o: string;
  n: string;
  d: string;
  dk: string;
}

interface ScannedHistoryData {
  t: string;
  g: CompactGame[];
}

export default function ScanHistoryQRScreen() {
  const router = useRouter();
  const { db } = useDatabase();
  const queryClient = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedData, setScannedData] = useState<ScannedHistoryData | null>(null);
  const [importing, setImporting] = useState<boolean>(false);
  const [imported, setImported] = useState<boolean>(false);
  const scanProcessedRef = useRef<boolean>(false);

  const handleBarCodeScanned = useCallback((result: BarcodeScanningResult) => {
    if (scanProcessedRef.current) return;

    try {
      const data = JSON.parse(result.data) as ScannedHistoryData;
      if (data.t !== 'h' || !Array.isArray(data.g)) {
        console.log('[ScanHistoryQR] Invalid QR data:', result.data);
        return;
      }

      scanProcessedRef.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScannedData(data);
    } catch (e) {
      console.log('[ScanHistoryQR] QR parse error:', e);
    }
  }, []);

  const importGames = useCallback(async () => {
    if (!scannedData || !db) return;

    setImporting(true);
    try {
      let count = 0;
      for (const game of scannedData.g) {
        const result = game.r === 'w' ? 'loss' : 'win';
        const playerName = game.o || null;
        const opponentName = game.p || null;
        const notes = game.n || null;
        const playedAt = game.d || new Date().toISOString();

        await safeRun(
          db,
          `INSERT INTO game_history (deck_id, result, player_name, opponent_name, opponent_deck, notes, played_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [null, result, playerName, opponentName, null, notes, playedAt]
        );
        count++;
      }

      console.log('[ScanHistoryQR] Imported', count, 'games');
      void queryClient.invalidateQueries({ queryKey: ['game-history'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['game-players'] });

      setImported(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.log('[ScanHistoryQR] Import error:', e);
      Alert.alert('Import Error', 'Failed to import game history. Please try again.');
    } finally {
      setImporting(false);
    }
  }, [scannedData, db, queryClient]);

  const handleRetry = useCallback(() => {
    scanProcessedRef.current = false;
    setScannedData(null);
    setImported(false);
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Scan History QR' }} />
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
        <Stack.Screen options={{ title: 'Scan History QR' }} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Scan History QR' }} />
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

  if (imported) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Import Complete' }} />
        <View style={styles.successContent}>
          <View style={styles.successIcon}>
            <Check size={40} color={Colors.success} />
          </View>
          <Text style={styles.successTitle}>Import Complete!</Text>
          <Text style={styles.successSubtitle}>
            {scannedData?.g.length ?? 0} game{(scannedData?.g.length ?? 0) !== 1 ? 's' : ''} imported to your history
          </Text>
          <Text style={styles.successHint}>
            Results are flipped to show your perspective of each game.
          </Text>
          <View style={styles.successActions}>
            <TouchableOpacity style={styles.successScanBtn} onPress={handleRetry}>
              <Text style={styles.successScanBtnText}>Scan Another</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.successDoneBtn} onPress={() => router.back()}>
              <Text style={styles.successDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (scannedData) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Confirm Import' }} />

        <View style={styles.previewHeader}>
          <Download size={24} color={Colors.accent} />
          <Text style={styles.previewTitle}>
            {scannedData.g.length} game{scannedData.g.length !== 1 ? 's' : ''} found
          </Text>
          <Text style={styles.previewSubtitle}>
            Review before importing. Results will be flipped to your perspective.
          </Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {scannedData.g.map((game, idx) => {
            const theirResult = game.r === 'w';
            const yourResult = !theirResult;
            return (
              <View key={idx} style={styles.gamePreviewItem}>
                <View style={[styles.gamePreviewResult, {
                  backgroundColor: yourResult ? Colors.success + '20' : Colors.danger + '20'
                }]}>
                  {yourResult ? (
                    <Trophy size={14} color={Colors.success} />
                  ) : (
                    <XIcon size={14} color={Colors.danger} />
                  )}
                </View>
                <View style={styles.gamePreviewInfo}>
                  <Text style={styles.gamePreviewNames}>
                    {game.p} vs {game.o}
                  </Text>
                  {game.n ? (
                    <Text style={styles.gamePreviewNotes} numberOfLines={1}>{game.n}</Text>
                  ) : null}
                </View>
                <Text style={styles.gamePreviewDate}>
                  {(() => {
                    try {
                      const d = new Date(game.d);
                      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    } catch { return ''; }
                  })()}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.importBtn, importing && { opacity: 0.6 }]}
            onPress={importGames}
            disabled={importing}
          >
            <Download size={20} color="#FFF" />
            <Text style={styles.importBtnText}>
              {importing ? 'Importing...' : `Import ${scannedData.g.length} Games`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelImportBtn} onPress={handleRetry}>
            <Text style={styles.cancelImportBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Scan History QR', headerShown: false }} />
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
            <Download size={24} color="#FFF" />
            <Text style={styles.instructionText}>
              Scan the game history QR code
            </Text>
            <Text style={styles.hintText}>
              Ask the other player to generate a history QR from their Game History screen
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
    paddingHorizontal: 24,
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
    lineHeight: 18,
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
  previewHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  previewSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 18,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 8,
  },
  gamePreviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  gamePreviewResult: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gamePreviewInfo: {
    flex: 1,
    gap: 2,
  },
  gamePreviewNames: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  gamePreviewNotes: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  gamePreviewDate: {
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
    gap: 8,
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
    width: '100%',
  },
  importBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  cancelImportBtn: {
    paddingVertical: 8,
  },
  cancelImportBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textMuted,
  },
  successContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.success + '20',
    borderWidth: 3,
    borderColor: Colors.success + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  successSubtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  successHint: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    marginBottom: 16,
  },
  successActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  successScanBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  successScanBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  successDoneBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.accent,
  },
  successDoneBtnText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#FFF',
  },
});
