import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Modal } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download, Upload, ChevronRight, AlertTriangle, Cloud, User, X, Check, Sparkles,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { useTCG } from '@/providers/TCGProvider';
import { safeQuery, safeRun, backupCardIdMapping, getSavedCardIdMapping, buildV12IdBridge, fallbackRecoverV12Ids } from '@/utils/database';
import { RESET_USER_DATA_SQL, RESET_CATALOG_SQL } from '@/constants/schema';
import { TCGS } from '@/constants/tcgs';
import { getTCG } from '@/tcg/registry';
import { importLogiaOnePieceCollection } from '@/utils/logia-import';

const PLAYERS_STORAGE_KEY = 'lorcana_players';
const PRIMARY_PLAYER_KEY = 'lorcana_primary_player';

interface SavedPlayer {
  id: string;
  name: string;
  createdAt: number;
}

export default function SettingsScreen() {
  const { db, isReady, hasCatalog, catalogCount, isSyncing, syncProgress, lastSync, syncCards, refreshCatalog } = useDatabase();
  const { tcg } = useTCG();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>([]);
  const [primaryPlayer, setPrimaryPlayer] = useState<string | null>(null);
  const [showPlayerPicker, setShowPlayerPicker] = useState<boolean>(false);
  const currentGame = tcg ? getTCG(tcg) : null;

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(PLAYERS_STORAGE_KEY);
        if (stored) setSavedPlayers(JSON.parse(stored));
        const primary = await AsyncStorage.getItem(PRIMARY_PLAYER_KEY);
        if (primary) setPrimaryPlayer(primary);
      } catch (e) {
        console.log('[Settings] Error loading players:', e);
      }
    })();
  }, []);

  const selectPrimaryPlayer = useCallback(async (playerName: string | null) => {
    try {
      if (playerName) {
        await AsyncStorage.setItem(PRIMARY_PLAYER_KEY, playerName);
      } else {
        await AsyncStorage.removeItem(PRIMARY_PLAYER_KEY);
      }
      setPrimaryPlayer(playerName);
      setShowPlayerPicker(false);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      console.log('[Settings] Error saving primary player:', e);
    }
  }, []);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const count = await syncCards();
      return count;
    },
    onSuccess: (count) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries();
      Alert.alert('Sync Complete', `Successfully synced ${count} cards from the API.`);
    },
    onError: (error: Error) => {
      Alert.alert('Sync Error', error.message);
    },
  });

  const exportData = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('Database not ready');
      // Join with cards table to include unique_id / set_code+card_number so import can
      // remap card_ids correctly even after a catalog re-sync (AUTOINCREMENT IDs change).
      const collection = await safeQuery(
        db,
        `SELECT uc.*, c.unique_id, c.set_code, c.card_number
         FROM user_collection uc LEFT JOIN cards c ON c.id = uc.card_id`
      );
      const printingCollection = await safeQuery(
        db,
        `SELECT pc.*, c.unique_id, c.card_number
         FROM card_printing_collection pc
         LEFT JOIN cards c ON c.id = pc.card_id
         WHERE pc.qty > 0`
      );
      const decksData = await safeQuery(db, 'SELECT * FROM decks');
      const deckCards = await safeQuery(
        db,
        `SELECT dc.*, c.unique_id, c.set_code, c.card_number
         FROM deck_cards dc LEFT JOIN cards c ON c.id = dc.card_id`
      );
      const wishlist = await safeQuery(
        db,
        `SELECT w.*, c.unique_id, c.set_code, c.card_number
         FROM wishlist w LEFT JOIN cards c ON c.id = w.card_id`
      );
      const tags = await safeQuery(db, 'SELECT * FROM tags');
      const cardTags = await safeQuery(
        db,
        `SELECT ct.*, c.unique_id, c.set_code, c.card_number
         FROM card_tags ct LEFT JOIN cards c ON c.id = ct.card_id`
      );

      let gameHistory: unknown[] = [];
      try {
        gameHistory = await safeQuery(db, 'SELECT * FROM game_history');
      } catch {
        console.log('[Export] game_history not available');
      }

      const exportObj = {
        version: '1.4',
        tcg: tcg ?? 'lorcana',
        exported_at: new Date().toISOString(),
        user_collection: collection,
        card_printing_collection: printingCollection,
        decks: decksData,
        deck_cards: deckCards,
        wishlist,
        tags,
        card_tags: cardTags,
        game_history: gameHistory,
      };

      const json = JSON.stringify(exportObj, null, 2);
      await Clipboard.setStringAsync(json);
      return json.length;
    },
    onSuccess: (size) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Exported', `User data copied to clipboard (${Math.round(size / 1024)} KB). Paste it into a file to save.`);
    },
    onError: (error: Error) => {
      Alert.alert('Export Error', error.message);
    },
  });

  const importData = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('Database not ready');
      const clipboardContent = await Clipboard.getStringAsync();
      if (!clipboardContent) throw new Error('Clipboard is empty. Copy a JSON export first.');

      let data: any;
      try {
        data = JSON.parse(clipboardContent);
      } catch {
        throw new Error('Invalid JSON in clipboard');
      }

      if (!data.version) throw new Error('Invalid export format');

      const exportTcg: string | undefined = data.tcg;
      const currentTcg = tcg ?? 'lorcana';
      if (exportTcg && exportTcg !== currentTcg) {
        const fromName = TCGS.find(t => t.id === exportTcg)?.name ?? exportTcg;
        const toName = TCGS.find(t => t.id === currentTcg)?.name ?? currentTcg;
        throw new Error(`This export is for ${fromName}, but you are in the ${toName} section. Switch to ${fromName} before importing.`);
      }
      if (!exportTcg && data.version !== '1.1') {
        throw new Error('Export does not specify a TCG. Cannot safely import.');
      }

      console.log('[Import] Clearing all user data before import...');
      await safeRun(db, 'PRAGMA foreign_keys = OFF');
      const resetStatements = RESET_USER_DATA_SQL.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of resetStatements) {
        try {
          await safeRun(db, stmt);
        } catch (e) {
          console.log('[Import] DELETE failed (ignoring):', (e as Error).message);
        }
      }
      await safeRun(db, 'PRAGMA foreign_keys = ON');
      console.log('[Import] User data cleared, starting fresh import...');

      const existingCardRows = await safeQuery<{ id: number; unique_id: string | null; set_code: string | null; card_number: string | null }>(
        db,
        'SELECT id, unique_id, set_code, card_number FROM cards'
      );
      const validCardIds = new Set<number>(existingCardRows.map(r => r.id));
      const byUniqueId = new Map<string, number>();
      const bySetNum = new Map<string, number>();
      for (const r of existingCardRows) {
        if (r.unique_id) byUniqueId.set(String(r.unique_id), r.id);
        if (r.set_code && r.card_number) bySetNum.set(`${r.set_code}|${r.card_number}`, r.id);
      }
      console.log('[Import] Catalog has', validCardIds.size, 'cards (', byUniqueId.size, 'with unique_id)');

      // Try to load the old card_id → new card_id bridge for v1.2 imports.
      const oldIdToUniqueId = await getSavedCardIdMapping(currentTcg);
      const v12Bridge = Object.keys(oldIdToUniqueId).length > 0
        ? await buildV12IdBridge(db, oldIdToUniqueId)
        : new Map<number, number>();
      console.log('[Import] v1.2 bridge has', v12Bridge.size, 'resolved entries');

      // Resolve a row's card_id to the CURRENT catalog id.
      // Prefer unique_id, then set_code+card_number, then v1.2 bridge (old_id → new_id), fall back to raw card_id.
      const resolveCardId = (row: { card_id?: number; unique_id?: string | null; set_code?: string | null; card_number?: string | null }): number | null => {
        if (row.unique_id) {
          const mapped = byUniqueId.get(String(row.unique_id));
          if (mapped != null) return mapped;
        }
        if (row.set_code && row.card_number) {
          const mapped = bySetNum.get(`${row.set_code}|${row.card_number}`);
          if (mapped != null) return mapped;
        }
        // v1.2 bridge: old card_id → unique_id → current card_id
        if (row.card_id != null && v12Bridge.has(Number(row.card_id))) {
          return v12Bridge.get(Number(row.card_id))!;
        }
        if (row.card_id != null && validCardIds.has(Number(row.card_id))) return Number(row.card_id);
        return null;
      };

      let skippedCollection = 0;
      let skippedDeckCards = 0;
      let skippedWishlist = 0;
      let skippedCardTags = 0;
      let failed = 0;
      const skippedCollectionIds: number[] = [];

      if (data.user_collection?.length) {
        for (const item of data.user_collection) {
          const newCardId = resolveCardId(item);
          if (newCardId == null) {
            skippedCollection++;
            if (item.card_id != null) skippedCollectionIds.push(Number(item.card_id));
            continue;
          }
          try {
            await safeRun(
              db,
              `INSERT OR REPLACE INTO user_collection (card_id, qty, qty_foil, qty_enchanted, qty_epic, qty_promo, qty_iconic, qty_play, condition, language, note, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
              [newCardId, item.qty ?? 0, item.qty_foil ?? 0, item.qty_enchanted ?? 0, item.qty_epic ?? 0, item.qty_promo ?? 0, item.qty_iconic ?? 0, item.qty_play ?? 0, item.condition, item.language, item.note]
            );
          } catch (e) {
            failed++;
            console.log('[Import] user_collection insert failed:', e);
          }
        }
      }

      // Second pass: fallback recovery for v1.2 exports with no id_mapping backup
      if (skippedCollectionIds.length > 0 && v12Bridge.size === 0) {
        const fallbackBridge = await fallbackRecoverV12Ids(db, skippedCollectionIds);
        if (fallbackBridge.size > 0) {
          console.log(`[Import] Fallback recovery resolved ${fallbackBridge.size} skipped cards`);
          for (const item of data.user_collection) {
            if (item.card_id != null && fallbackBridge.has(Number(item.card_id))) {
              const newCardId = fallbackBridge.get(Number(item.card_id))!;
              try {
                await safeRun(
                  db,
                  `INSERT OR REPLACE INTO user_collection (card_id, qty, qty_foil, qty_enchanted, qty_epic, qty_promo, qty_iconic, qty_play, condition, language, note, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                  [newCardId, item.qty ?? 0, item.qty_foil ?? 0, item.qty_enchanted ?? 0, item.qty_epic ?? 0, item.qty_promo ?? 0, item.qty_iconic ?? 0, item.qty_play ?? 0, item.condition, item.language, item.note]
                );
                skippedCollection--;
              } catch (e) {
                failed++;
                console.log('[Import] Fallback recovery insert failed:', e);
              }
            }
          }
        }
      }

      if (data.card_printing_collection?.length) {
        for (const item of data.card_printing_collection) {
          const newCardId = resolveCardId(item);
          if (newCardId == null || !item.printing_key || !item.set_code) {
            skippedCollection++;
            continue;
          }
          try {
            await safeRun(
              db,
              `INSERT OR REPLACE INTO card_printing_collection
                (card_id, printing_key, set_code, set_name, rarity, qty, note, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
              [
                newCardId,
                item.printing_key,
                item.set_code,
                item.set_name ?? null,
                item.rarity ?? null,
                item.qty ?? 0,
                item.note ?? null,
              ]
            );
          } catch (e) {
            failed++;
            console.log('[Import] card_printing_collection insert failed:', e);
          }
        }
      }

      const validDeckIds = new Set<number>();
      if (data.decks?.length) {
        for (const deck of data.decks) {
          try {
            await safeRun(
              db,
              `INSERT INTO decks (id, name, format, ink_profile, note, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
              [deck.id, deck.name, deck.format, deck.ink_profile, deck.note, deck.created_at]
            );
            validDeckIds.add(Number(deck.id));
          } catch (e) {
            failed++;
            console.log('[Import] deck insert failed:', e);
          }
        }
      }

      if (data.deck_cards?.length) {
        for (const dc of data.deck_cards) {
          const newCardId = resolveCardId(dc);
          if (newCardId == null || !validDeckIds.has(Number(dc.deck_id))) { skippedDeckCards++; continue; }
          try {
            await safeRun(
              db,
              `INSERT OR REPLACE INTO deck_cards (deck_id, card_id, qty, is_sideboard) VALUES (?, ?, ?, ?)`,
              [dc.deck_id, newCardId, dc.qty ?? 1, dc.is_sideboard ?? 0]
            );
          } catch (e) {
            failed++;
            console.log('[Import] deck_cards insert failed:', e);
          }
        }
      }

      if (data.wishlist?.length) {
        for (const w of data.wishlist) {
          const newCardId = resolveCardId(w);
          if (newCardId == null) { skippedWishlist++; continue; }
          try {
            await safeRun(
              db,
              `INSERT OR REPLACE INTO wishlist (card_id, target_qty, priority, note, created_at)
               VALUES (?, ?, ?, ?, datetime('now'))`,
              [newCardId, w.target_qty ?? 1, w.priority ?? 2, w.note]
            );
          } catch (e) {
            failed++;
            console.log('[Import] wishlist insert failed:', e);
          }
        }
      }

      const validTagIds = new Set<number>();
      if (data.tags?.length) {
        for (const t of data.tags) {
          try {
            await safeRun(db, 'INSERT INTO tags (id, name) VALUES (?, ?)', [t.id, t.name]);
            validTagIds.add(Number(t.id));
          } catch (e) {
            failed++;
            console.log('[Import] tag insert failed:', e);
          }
        }
      }

      if (data.card_tags?.length) {
        for (const ct of data.card_tags) {
          const newCardId = resolveCardId(ct);
          if (newCardId == null || !validTagIds.has(Number(ct.tag_id))) { skippedCardTags++; continue; }
          try {
            await safeRun(db, 'INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)', [newCardId, ct.tag_id]);
          } catch (e) {
            failed++;
            console.log('[Import] card_tags insert failed:', e);
          }
        }
      }

      if (data.game_history?.length) {
        for (const gh of data.game_history) {
          const deckIdValue = gh.deck_id != null && validDeckIds.has(Number(gh.deck_id)) ? gh.deck_id : null;
          try {
            await safeRun(
              db,
              `INSERT INTO game_history (id, deck_id, result, opponent_name, opponent_deck, notes, played_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [gh.id, deckIdValue, gh.result, gh.opponent_name, gh.opponent_deck, gh.notes, gh.played_at]
            );
          } catch (e) {
            console.log('[Import] game_history insert failed:', e);
          }
        }
      }

      const skippedTotal = skippedCollection + skippedDeckCards + skippedWishlist + skippedCardTags;
      const notes = `Imported ${data.user_collection?.length ?? 0} base collection rows / ${data.card_printing_collection?.length ?? 0} printing rows / ${data.decks?.length ?? 0} decks. Skipped ${skippedTotal} (no matching cards in catalog). Failed: ${failed}.`;

      // Detect catastrophic skip (old v1.2 export + catalog has shifted AUTOINCREMENT ids).
      const totalRows = (data.user_collection?.length ?? 0) + (data.deck_cards?.length ?? 0) + (data.wishlist?.length ?? 0) + (data.card_tags?.length ?? 0);
      const hasUniqueIds = (data.user_collection ?? []).some((r: any) => r?.unique_id);
      const allSkipped = totalRows > 0 && skippedTotal === totalRows;
      if (allSkipped && !hasUniqueIds) {
        throw new Error(
          'Your export is an older format (v1.2) without stable card identifiers, and the current catalog uses different internal IDs.\n\nFix: Go to "Reset Everything" → choose "Reset & Re-sync". This will re-download the catalog with IDs starting from 1 (matching your export). Then import again.'
        );
      }

      await safeRun(
        db,
        "INSERT INTO import_log (imported_at, source, notes) VALUES (datetime('now'), 'clipboard', ?)",
        [notes]
      );

      console.log('[Import] Import complete.', notes);
      return { skippedTotal, failed };
    },
    onSuccess: (result) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries();
      const r = result as { skippedTotal: number; failed: number };
      const warn = r.skippedTotal > 0
        ? `\n\n${r.skippedTotal} rows skipped because their cards are not in the current catalog. Sync the catalog first, then re-import to restore them.`
        : '';
      Alert.alert('Imported', `User data imported successfully. Previous data was replaced.${warn}`);
    },
    onError: (error: Error) => {
      Alert.alert('Import Error', error.message);
    },
  });

  const importLogia = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('Database not ready');
      if (tcg !== 'onepiece') {
        throw new Error('Logia CSV import is currently available for One Piece only.');
      }

      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (picked.canceled || !picked.assets?.length) {
        return null;
      }

      const asset = picked.assets[0];
      let csvText = '';

      const webFile = (asset as typeof asset & { file?: File }).file;
      if (webFile && typeof webFile.text === 'function') {
        csvText = await webFile.text();
      } else {
        const response = await fetch(asset.uri);
        if (!response.ok) {
          throw new Error(`Could not read selected CSV file (HTTP ${response.status}).`);
        }
        csvText = await response.text();
      }

      return importLogiaOnePieceCollection(db, csvText);
    },
    onSuccess: (result) => {
      if (!result) return;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void queryClient.invalidateQueries();

      const skipped = result.skippedRows > 0
        ? `\n\nSkipped rows: ${result.skippedRows}.${result.skippedPreview.length ? `\nExamples:\n${result.skippedPreview.join('\n')}` : ''}`
        : '';
      const ambiguous = result.ambiguousRows > 0
        ? `\n\n${result.ambiguousRows} rows matched more than one catalog artwork; the closest match was selected.`
        : '';

      Alert.alert(
        'Logia Import Complete',
        `Imported ${result.importedCopies} copies across ${result.importedCards} catalog cards from ${result.matchedRows}/${result.totalRows} CSV rows.${skipped}${ambiguous}`
      );
    },
    onError: (error: Error) => {
      Alert.alert('Logia Import Error', error.message);
    },
  });

  const { mutate: doResetData, isPending: isResetting } = useMutation({
    mutationFn: async (opts: { resync: boolean }) => {
      if (!db) throw new Error('Database not ready');
      // Backup old card_id → unique_id mapping before clearing catalog.
      // This allows v1.2 imports to remap old IDs after a re-sync.
      const currentTcg = tcg ?? 'lorcana';
      await backupCardIdMapping(db, currentTcg);
      const userStmts = RESET_USER_DATA_SQL.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of userStmts) {
        await safeRun(db, stmt);
      }
      const catalogStmts = RESET_CATALOG_SQL.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of catalogStmts) {
        await safeRun(db, stmt);
      }
      await refreshCatalog();
      if (opts.resync) {
        const count = await syncCards();
        return { resynced: true, count };
      }
      return { resynced: false, count: 0 };
    },
    onSuccess: (result) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      void queryClient.invalidateQueries();
      if (result.resynced) {
        Alert.alert('Reset Complete', `All data wiped and ${result.count} cards re-downloaded from API.`);
      } else {
        Alert.alert('Reset Complete', 'All data and catalog wiped. Tap "Sync Cards from API" to re-download the catalog.');
      }
    },
    onError: (error: Error) => {
      Alert.alert('Reset Error', error.message);
    },
  });

  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset Everything',
      'This will delete ALL your collection, decks, wishlist, tags, AND the card catalog/sync state for this TCG. Then it will re-download the catalog from the API. This cannot be undone!',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset only', style: 'destructive', onPress: () => doResetData({ resync: false }) },
        { text: 'Reset & Re-sync', style: 'destructive', onPress: () => doResetData({ resync: true }) },
      ]
    );
  }, [doResetData]);

  const formatLastSync = useCallback((iso: string | null) => {
    if (!iso) return 'Never';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }, []);

  if (!isReady) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Card Database</Text>

        <TouchableOpacity
          style={styles.row}
          onPress={() => syncMutation.mutate()}
          disabled={isSyncing || syncMutation.isPending}
        >
          <View style={[styles.rowIcon, { backgroundColor: Colors.primary + '20' }]}>
            <Cloud size={18} color={Colors.primary} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Sync Cards from API</Text>
            <Text style={styles.rowSubtitle}>
              {isSyncing && syncProgress
                ? `Syncing... ${syncProgress.current}/${syncProgress.total}`
                : isSyncing
                ? 'Connecting to API...'
                : `Last sync: ${formatLastSync(lastSync)}`}
            </Text>
          </View>
          {isSyncing ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <ChevronRight size={16} color={Colors.textMuted} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>

        <TouchableOpacity
          style={styles.row}
          onPress={() => exportData.mutate()}
          disabled={exportData.isPending}
        >
          <View style={[styles.rowIcon, { backgroundColor: Colors.accent + '20' }]}>
            <Upload size={18} color={Colors.accent} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Export User Data</Text>
            <Text style={styles.rowSubtitle}>Copy collection, decks, wishlist as JSON</Text>
          </View>
          {exportData.isPending ? <ActivityIndicator size="small" color={Colors.accent} /> : <ChevronRight size={16} color={Colors.textMuted} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={() => {
            Alert.alert(
              'Import Data',
              'Copy your JSON export to clipboard first, then tap Import. WARNING: This will replace ALL existing user data (collection, decks, wishlist, game history).',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Import', onPress: () => importData.mutate() },
              ]
            );
          }}
          disabled={importData.isPending}
        >
          <View style={[styles.rowIcon, { backgroundColor: Colors.success + '20' }]}>
            <Download size={18} color={Colors.success} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Import User Data</Text>
            <Text style={styles.rowSubtitle}>Replace all data from JSON in clipboard</Text>
          </View>
          {importData.isPending ? <ActivityIndicator size="small" color={Colors.success} /> : <ChevronRight size={16} color={Colors.textMuted} />}
        </TouchableOpacity>

        {tcg === 'onepiece' && (
          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              Alert.alert(
                'Import Logia Collection',
                'Choose the CSV exported from Logia. Importing will delete every card currently marked as owned in this One Piece collection and replace ownership with the contents of the selected CSV. Decks, wishlist and game history are left untouched.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Choose CSV & Replace', style: 'destructive', onPress: () => importLogia.mutate() },
                ]
              );
            }}
            disabled={importLogia.isPending}
          >
            <View style={[styles.rowIcon, { backgroundColor: Colors.primary + '20' }]}>
              <Download size={18} color={Colors.primary} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Import from Logia CSV</Text>
              <Text style={styles.rowSubtitle}>Replace owned One Piece cards with a Logia CSV export</Text>
            </View>
            {importLogia.isPending
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <ChevronRight size={16} color={Colors.textMuted} />}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TCG</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push({ pathname: '/tcg-select', params: { from: 'settings' } })}
        >
          <View style={[styles.rowIcon, { backgroundColor: Colors.primary + '20' }]}>
            <Sparkles size={18} color={Colors.primary} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Current TCG</Text>
            <Text style={styles.rowSubtitle}>
              {currentGame?.name ?? 'Not selected'} — tap to switch
            </Text>
          </View>
          <ChevronRight size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {tcg === 'lorcana' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Player</Text>
          <TouchableOpacity
            style={styles.row}
            onPress={() => setShowPlayerPicker(true)}
          >
            <View style={[styles.rowIcon, { backgroundColor: Colors.primary + '20' }]}>
              <User size={18} color={Colors.primary} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Primary Player</Text>
              <Text style={styles.rowSubtitle}>
                {primaryPlayer ?? 'Not set — tap to select'}
              </Text>
            </View>
            <ChevronRight size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reset</Text>
        <TouchableOpacity style={styles.row} onPress={handleReset} disabled={isResetting || isSyncing}>
          <View style={[styles.rowIcon, { backgroundColor: Colors.danger + '20' }]}>
            <AlertTriangle size={18} color={Colors.danger} />
          </View>
          <View style={styles.rowContent}>
            <Text style={[styles.rowTitle, { color: Colors.danger }]}>Reset Everything</Text>
            <Text style={styles.rowSubtitle}>Wipe user data + catalog + sync state for this TCG, then re-download.</Text>
          </View>
          {isResetting ? <ActivityIndicator size="small" color={Colors.danger} /> : <ChevronRight size={16} color={Colors.textMuted} />}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.aboutCard}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Catalog Status</Text>
            <Text style={[styles.aboutValue, { color: hasCatalog ? Colors.success : Colors.warning }]}>
              {hasCatalog ? 'Loaded' : 'Not Synced'}
            </Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Cards in Catalog</Text>
            <Text style={styles.aboutValue}>{catalogCount}</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Data Source</Text>
            <Text style={styles.aboutValue}>
              {currentGame?.catalogSource === 'lorcana-api'
                ? 'lorcana-api.com'
                : currentGame?.catalogSource === 'optcgapi'
                  ? 'optcgapi.com'
                  : currentGame?.catalogSource === 'ygoprodeck'
                    ? 'YGOPRODeck'
                    : currentGame?.catalogSource === 'scryfall'
                      ? 'Scryfall'
                      : 'Not connected'}
            </Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Last Sync</Text>
            <Text style={styles.aboutValue}>{formatLastSync(lastSync)}</Text>
          </View>
        </View>
      </View>

      <View style={{ height: 40 }} />

      <Modal visible={tcg === 'lorcana' && showPlayerPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Primary Player</Text>
              <TouchableOpacity onPress={() => setShowPlayerPicker(false)}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDesc}>
              Select who owns this app. Game history will be tracked from this player's perspective.
            </Text>
            <TouchableOpacity
              style={[styles.playerOption, primaryPlayer === null && styles.playerOptionActive]}
              onPress={() => selectPrimaryPlayer(null)}
            >
              <Text style={[styles.playerOptionText, primaryPlayer === null && styles.playerOptionTextActive]}>None (default)</Text>
              {primaryPlayer === null && <Check size={16} color={Colors.primary} />}
            </TouchableOpacity>
            {savedPlayers.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.playerOption, primaryPlayer === p.name && styles.playerOptionActive]}
                onPress={() => selectPrimaryPlayer(p.name)}
              >
                <View style={styles.playerOptionAvatar}>
                  <Text style={styles.playerOptionAvatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={[styles.playerOptionText, primaryPlayer === p.name && styles.playerOptionTextActive]}>{p.name}</Text>
                {primaryPlayer === p.name && <Check size={16} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
            {savedPlayers.length === 0 && (
              <Text style={styles.noPlayersText}>No saved players. Create players in the Lore Counter first.</Text>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    gap: 12,
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
  modalDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  playerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  playerOptionActive: {
    backgroundColor: Colors.primary + '15',
    borderColor: Colors.primary + '50',
  },
  playerOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  playerOptionTextActive: {
    color: Colors.primary,
  },
  playerOptionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerOptionAvatarText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  noPlayersText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    paddingVertical: 12,
  },
  content: {
    padding: 16,
    gap: 20,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    paddingLeft: 4,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  rowSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  aboutCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aboutLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  aboutValue: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
  },
});
