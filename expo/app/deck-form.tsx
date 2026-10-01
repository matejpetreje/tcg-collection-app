import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { safeRun } from '@/utils/database';

const INK_OPTIONS = ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'];

export default function DeckFormScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db } = useDatabase();
  const [name, setName] = useState<string>('');
  const [format, setFormat] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [selectedInks, setSelectedInks] = useState<string[]>([]);

  const createDeck = useMutation({
    mutationFn: async () => {
      if (!db || !name.trim()) throw new Error('Name required');
      const inkProfile = selectedInks.join(', ');
      await safeRun(
        db,
        `INSERT INTO decks (name, format, ink_profile, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [name.trim(), format.trim() || null, inkProfile || null, note.trim() || null]
      );
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      router.back();
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  const toggleInk = (ink: string) => {
    setSelectedInks(prev =>
      prev.includes(ink) ? prev.filter(i => i !== ink) : [...prev, ink]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'New Deck' }} />

      <View style={styles.field}>
        <Text style={styles.label}>Deck Name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="My awesome deck"
          placeholderTextColor={Colors.textMuted}
          testID="deck-name-input"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Format</Text>
        <TextInput
          style={styles.input}
          value={format}
          onChangeText={setFormat}
          placeholder="e.g. Standard, Competitive"
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Ink Colors</Text>
        <View style={styles.inkGrid}>
          {INK_OPTIONS.map(ink => {
            const isSelected = selectedInks.includes(ink);
            const color = Colors.ink[ink] ?? Colors.textMuted;
            return (
              <TouchableOpacity
                key={ink}
                style={[
                  styles.inkChip,
                  isSelected && { backgroundColor: color + '30', borderColor: color },
                ]}
                onPress={() => toggleInk(ink)}
              >
                <View style={[styles.inkDot, { backgroundColor: color }]} />
                <Text style={[styles.inkChipText, isSelected && { color }]}>{ink}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={note}
          onChangeText={setNote}
          placeholder="Deck description, strategy..."
          placeholderTextColor={Colors.textMuted}
          multiline
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        style={[styles.createBtn, !name.trim() && styles.createBtnDisabled]}
        onPress={() => createDeck.mutate()}
        disabled={!name.trim() || createDeck.isPending}
        testID="create-deck-btn"
      >
        <Text style={styles.createBtnText}>
          {createDeck.isPending ? 'Creating...' : 'Create Deck'}
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
  field: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
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
  inkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  inkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  inkChipText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  createBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.background,
  },
});
