import React, { useCallback, useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Modal, Pressable, FlatList, Alert, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ChevronDown, Check, Lock, X } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { TCGS, type TCGInfo } from '@/constants/tcgs';
import { useTCG } from '@/providers/TCGProvider';

export default function TCGSwitcherButton() {
  const { tcg: current, setTcg } = useTCG();
  const [open, setOpen] = useState<boolean>(false);

  const currentTCG = TCGS.find(t => t.id === current);

  const handleSelect = useCallback(async (tcg: TCGInfo) => {
    if (!tcg.available) {
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Coming Soon', `${tcg.name} is not yet available. Stay tuned!`);
      return;
    }
    if (tcg.id === current) {
      setOpen(false);
      return;
    }
    try {
      await setTcg(tcg.id);
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setOpen(false);
    } catch (e) {
      console.log('[TCGSwitcher] save error', e);
    }
  }, [current, setTcg]);

  return (
    <>
      <TouchableOpacity
        testID="tcg-switcher-button"
        onPress={() => {
          if (Platform.OS !== 'web') void Haptics.selectionAsync();
          setOpen(true);
        }}
        style={styles.button}
        activeOpacity={0.6}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {currentTCG ? (
          <View style={[styles.dot, { backgroundColor: currentTCG.color }]} />
        ) : null}
        <Text style={styles.buttonText} numberOfLines={1}>
          {currentTCG?.shortName ?? 'TCG'}
        </Text>
        <ChevronDown size={14} color={Colors.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Text style={styles.title}>Switch TCG</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn}>
                <X size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={TCGS}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isCurrent = item.id === current;
                return (
                  <TouchableOpacity
                    style={[styles.row, isCurrent && styles.rowActive]}
                    onPress={() => void handleSelect(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.dot, { backgroundColor: item.color }]} />
                    <View style={styles.rowText}>
                      <Text style={styles.rowName}>{item.name}</Text>
                      <Text style={styles.rowTag} numberOfLines={1}>{item.tagline}</Text>
                    </View>
                    {!item.available && <Lock size={16} color={Colors.textMuted} />}
                    {isCurrent && <Check size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginRight: 8,
    maxWidth: 160,
  },
  buttonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end' as const,
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 32,
    maxHeight: '80%' as const,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
  },
  closeBtn: {
    padding: 4,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  rowActive: {
    backgroundColor: Colors.surface,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  rowTag: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sep: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginLeft: 20,
  },
});
