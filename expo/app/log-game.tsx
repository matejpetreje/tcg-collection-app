import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trophy, X as XIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { safeQuery, safeRun } from '@/utils/database';
import type { Deck } from '@/types/database';

export default function LogGameScreen() {
  const { deckId: paramDeckId } = useLocalSearchParams<{ deckId?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db } = useDatabase();

  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(
    paramDeckId ? parseInt(paramDeckId, 10) : null
  );
  const [result, setResult] = useState<'win' | 'loss'>('win');
  const [opponentName, setOpponentName] = useState<string>('');
  const [opponentDeck, setOpponentDeck] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const { data: decks } = useQuery({
    queryKey: ['all-decks', !!db],
    queryFn: async () => {
      if (!db) return [];
      return safeQuery<Deck>(db, 'SELECT * FROM decks ORDER BY name ASC');
    },
    enabled: !!db,
  });

  const logGame = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('Database not ready');
      await safeRun(
        db,
        `INSERT INTO game_history (deck_id, result, opponent_name, opponent_deck, notes, played_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [
          selectedDeckId,
          result,
          opponentName.trim() || null,
          opponentDeck.trim() || null,
          notes.trim() || null,
        ]
      );
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries({ queryKey: ['game-history'] });
      void queryClient.invalidateQueries({ queryKey: ['game-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
      router.back();
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Log Game' }} />

      <View style={styles.resultSection}>
        <Text style={styles.label}>Result</Text>
        <View style={styles.resultRow}>
          <TouchableOpacity
            style={[styles.resultBtn, result === 'win' && styles.resultBtnWin]}
            onPress={() => setResult('win')}
          >
            <Trophy size={20} color={result === 'win' ? Colors.success : Colors.textMuted} />
            <Text style={[styles.resultBtnText, result === 'win' && { color: Colors.success }]}>Win</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.resultBtn, result === 'loss' && styles.resultBtnLoss]}
            onPress={() => setResult('loss')}
          >
            <XIcon size={20} color={result === 'loss' ? Colors.danger : Colors.textMuted} />
            <Text style={[styles.resultBtnText, result === 'loss' && { color: Colors.danger }]}>Loss</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Your Deck</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deckScroll}>
          <View style={styles.deckChips}>
            <TouchableOpacity
              style={[styles.deckChip, selectedDeckId === null && styles.deckChipActive]}
              onPress={() => setSelectedDeckId(null)}
            >
              <Text style={[styles.deckChipText, selectedDeckId === null && styles.deckChipTextActive]}>
                None
              </Text>
            </TouchableOpacity>
            {decks?.map(d => (
              <TouchableOpacity
                key={d.id}
                style={[styles.deckChip, selectedDeckId === d.id && styles.deckChipActive]}
                onPress={() => setSelectedDeckId(d.id)}
              >
                <Text style={[styles.deckChipText, selectedDeckId === d.id && styles.deckChipTextActive]}>
                  {d.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Opponent Name</Text>
        <TextInput
          style={styles.input}
          value={opponentName}
          onChangeText={setOpponentName}
          placeholder="Optional"
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Opponent Deck</Text>
        <TextInput
          style={styles.input}
          value={opponentDeck}
          onChangeText={setOpponentDeck}
          placeholder="Optional"
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Game notes..."
          placeholderTextColor={Colors.textMuted}
          multiline
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        style={styles.submitBtn}
        onPress={() => logGame.mutate()}
        disabled={logGame.isPending}
      >
        <Text style={styles.submitBtnText}>
          {logGame.isPending ? 'Saving...' : 'Log Game'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
    gap: 20,
  },
  resultSection: {
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  resultRow: {
    flexDirection: 'row',
    gap: 12,
  },
  resultBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.surfaceBorder,
  },
  resultBtnWin: {
    borderColor: Colors.success,
    backgroundColor: Colors.success + '15',
  },
  resultBtnLoss: {
    borderColor: Colors.danger,
    backgroundColor: Colors.danger + '15',
  },
  resultBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textMuted,
  },
  field: {
    gap: 8,
  },
  deckScroll: {
    maxHeight: 50,
  },
  deckChips: {
    flexDirection: 'row',
    gap: 8,
  },
  deckChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  deckChipActive: {
    backgroundColor: Colors.primary + '25',
    borderColor: Colors.primary,
  },
  deckChipText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  deckChipTextActive: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  textArea: {
    minHeight: 80,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.background,
  },
});
