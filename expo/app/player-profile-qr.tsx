import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { X, Share2 } from 'lucide-react-native';
import Colors from '@/constants/colors';

export default function PlayerProfileQRScreen() {
  const router = useRouter();
  const { playerId, playerName } = useLocalSearchParams<{ playerId: string; playerName: string }>();

  const qrData = JSON.stringify({
    t: 'p',
    id: playerId ?? '',
    n: playerName ?? '',
  });

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}&bgcolor=1A2736&color=ECE5D8&margin=10`;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Player QR Code', presentation: 'modal' }} />

      <View style={styles.content}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {(playerName ?? 'P').charAt(0).toUpperCase()}
          </Text>
        </View>

        <Text style={styles.playerName}>{playerName ?? 'Player'}</Text>
        <Text style={styles.subtitle}>Show this QR code to another player</Text>
        <Text style={styles.hint}>They can scan it to add you to their player list</Text>

        <View style={styles.qrWrapper}>
          {Platform.OS === 'web' ? (
            <View style={styles.qrPlaceholder}>
              <Share2 size={40} color={Colors.textMuted} />
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

        <View style={styles.idRow}>
          <Text style={styles.idLabel}>Player ID</Text>
          <Text style={styles.idValue}>{playerId?.slice(-8) ?? '...'}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
        <X size={18} color={Colors.text} />
        <Text style={styles.closeBtnText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 24,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary + '25',
    borderWidth: 2,
    borderColor: Colors.primary + '50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  playerName: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
  },
  hint: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    marginBottom: 16,
  },
  qrWrapper: {
    width: 260,
    height: 260,
    borderRadius: 20,
    backgroundColor: '#1A2736',
    borderWidth: 2,
    borderColor: Colors.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden' as const,
    marginVertical: 8,
  },
  qrImage: {
    width: 240,
    height: 240,
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
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  idLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  idValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
});
