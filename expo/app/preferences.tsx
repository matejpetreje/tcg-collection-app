import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Grid3X3, List, LayoutGrid } from 'lucide-react-native';
import Colors from '@/constants/colors';

export const COLLECTION_VIEW_KEY = 'collection_view_mode';
export const COLLECTION_COLUMNS_KEY = 'collection_cards_per_row';
export const COLLECTION_PRICES_KEY = 'collection_show_prices';

type CollectionView = 'grid-minimal' | 'grid-detailed' | 'list';

const COLUMN_OPTIONS = ['auto', '2', '3', '4', '5', '6', '8', '10'] as const;

export default function PreferencesScreen() {
  const router = useRouter();
  const [view, setView] = useState<CollectionView>('grid-detailed');
  const [columns, setColumns] = useState<string>('auto');
  const [showPrices, setShowPrices] = useState(false);

  useEffect(() => {
    void (async () => {
      const [savedView, savedColumns, savedPrices] = await Promise.all([
        AsyncStorage.getItem(COLLECTION_VIEW_KEY),
        AsyncStorage.getItem(COLLECTION_COLUMNS_KEY),
        AsyncStorage.getItem(COLLECTION_PRICES_KEY),
      ]);
      if (savedView === 'grid-minimal' || savedView === 'grid-detailed' || savedView === 'list') setView(savedView);
      if (savedColumns) setColumns(savedColumns);
      setShowPrices(savedPrices === 'true');
    })();
  }, []);

  const saveView = async (next: CollectionView) => {
    setView(next);
    await AsyncStorage.setItem(COLLECTION_VIEW_KEY, next);
  };

  const saveColumns = async (next: string) => {
    setColumns(next);
    await AsyncStorage.setItem(COLLECTION_COLUMNS_KEY, next);
  };

  const savePrices = async (next: boolean) => {
    setShowPrices(next);
    await AsyncStorage.setItem(COLLECTION_PRICES_KEY, String(next));
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Preferences</Text>
          <Text style={styles.subtitle}>Customize how your collection is displayed.</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>COLLECTION VIEW</Text>
      <Text style={styles.sectionHelp}>Choose what information is shown with each card.</Text>
      <View style={styles.viewChoices}>
        <Choice
          icon={<LayoutGrid size={22} color={view === 'grid-minimal' ? Colors.primary : Colors.textSecondary} />}
          label="Grid Minimal"
          active={view === 'grid-minimal'}
          onPress={() => void saveView('grid-minimal')}
        />
        <Choice
          icon={<Grid3X3 size={22} color={view === 'grid-detailed' ? Colors.primary : Colors.textSecondary} />}
          label="Grid Detailed"
          active={view === 'grid-detailed'}
          onPress={() => void saveView('grid-detailed')}
        />
        <Choice
          icon={<List size={22} color={view === 'list' ? Colors.primary : Colors.textSecondary} />}
          label="List"
          active={view === 'list'}
          onPress={() => void saveView('list')}
        />
      </View>

      <Text style={styles.sectionTitle}>CARDS PER ROW</Text>
      <Text style={styles.sectionHelp}>Set grid density. Auto adapts to the available screen width.</Text>
      <View style={styles.columnChoices}>
        {COLUMN_OPTIONS.map(option => (
          <TouchableOpacity
            key={option}
            style={[styles.columnButton, columns === option && styles.active]}
            onPress={() => void saveColumns(option)}
          >
            <Text style={[styles.columnText, columns === option && styles.activeText]}>
              {option === 'auto' ? 'Auto' : option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>DISPLAY</Text>
      <View style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>Show Card Prices</Text>
          <Text style={styles.settingSubtitle}>Display individual card prices in detailed collection views.</Text>
        </View>
        <Switch
          value={showPrices}
          onValueChange={(value) => void savePrices(value)}
          trackColor={{ false: Colors.surfaceBorder, true: Colors.primaryDark }}
          thumbColor={showPrices ? Colors.primary : Colors.textSecondary}
        />
      </View>

      <View style={styles.note}>
        <Text style={styles.noteTitle}>More preferences are coming here</Text>
        <Text style={styles.noteText}>Marketplace, currency, price calculation and collection value will use this same settings area when pricing is connected.</Text>
      </View>
      </ScrollView>
    </>
  );
}

function Choice({ icon, label, active, onPress }: { icon: React.ReactNode; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.choice, active && styles.active]} onPress={onPress}>
      {icon}
      <Text style={[styles.choiceText, active && styles.activeText]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  back: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder },
  title: { fontSize: 28, fontWeight: '800', color: Colors.text },
  subtitle: { marginTop: 3, color: Colors.textSecondary, fontSize: 13 },
  sectionTitle: { marginTop: 14, color: Colors.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  sectionHelp: { color: Colors.textSecondary, fontSize: 13, marginBottom: 4 },
  viewChoices: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  choice: { minWidth: 150, flex: 1, minHeight: 82, borderRadius: 12, borderWidth: 1, borderColor: Colors.surfaceBorder, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  active: { borderColor: Colors.primary, backgroundColor: Colors.primary + '12' },
  choiceText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 13 },
  activeText: { color: Colors.primary },
  columnChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  columnButton: { minWidth: 56, height: 42, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: Colors.surfaceBorder, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  columnText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.surfaceBorder, backgroundColor: Colors.surface, padding: 16 },
  settingText: { flex: 1 },
  settingTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  settingSubtitle: { color: Colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 },
  note: { marginTop: 16, borderRadius: 12, padding: 16, backgroundColor: Colors.surface },
  noteTitle: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  noteText: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5 },
});
