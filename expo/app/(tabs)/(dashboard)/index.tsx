import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Library, Layers, Copy, TrendingUp, Palette, BarChart3, Cloud,
  Swords, History, Plus, ArrowUpDown, Sparkles, Grid3X3,
  ChevronDown, ChevronUp, Package, Crown, DollarSign, GripVertical,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { safeQueryFirst, safeQuery } from '@/utils/database';
import StatCard from '@/components/StatCard';
import { getSetNumber, getSetSortOrder } from '@/constants/sets';
import { TCGS, TCG_STORAGE_KEY, type TCGId } from '@/constants/tcgs';
import CardImage from '@/components/CardImage';
import type { SetProgress, PurchasedStarterDeck } from '@/types/database';

interface TopValueCard {
  card_id: number;
  name: string;
  version: string | null;
  ink_color: string | null;
  rarity: string | null;
  set_code: string | null;
  card_number: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  normal_price: number | null;
  foil_price: number | null;
  cm_normal_price: number | null;
  cm_foil_price: number | null;
  best_price: number;
}

type PriceSource = 'tcg' | 'cm';

type SectionId = 'top_value' | 'game_stats' | 'ink_dist' | 'rarity_dist' | 'decks' | 'purchased_decks' | 'type_dist' | 'set_progress';

const DEFAULT_SECTION_ORDER: SectionId[] = [
  'top_value', 'game_stats', 'ink_dist', 'rarity_dist', 'decks', 'purchased_decks', 'type_dist', 'set_progress',
];

const SECTION_ORDER_KEY = 'dashboard_section_order';

interface RarityDistItem {
  rarity: string;
  unique_count: number;
  total_count: number;
}

interface TypeDistItem {
  type: string;
  unique_count: number;
  total_count: number;
}

interface InkDistItem {
  ink_color: string;
  unique_count: number;
  total_count: number;
}

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Super Rare', 'Legendary', 'Epic', 'Enchanted', 'Iconic', 'Promo', 'Play', 'Foil'];
const TYPE_ORDER = ['Character', 'Action', 'Item', 'Song', 'Location'];
const ONEPIECE_TYPE_ORDER = ['Leader', 'Character', 'Event', 'Stage', 'DON!!'];

type DistMode = 'unique' | 'total';

function getPriceSymbol(source: PriceSource): string {
  return source === 'tcg' ? '$' : '\u20ac';
}

export default function DashboardScreen() {
  const { db, isReady, hasCatalog, isSyncing, syncProgress } = useDatabase();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [currentTCG, setCurrentTCG] = useState<TCGId | null>(null);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(TCG_STORAGE_KEY)
        .then((stored) => {
          if (stored) setCurrentTCG(stored as TCGId);
        })
        .catch((e) => console.log('[Dashboard] tcg load error', e));
    }, [])
  );

  const isOnePiece = currentTCG === 'onepiece';
  const isLorcana = currentTCG === 'lorcana';
  const isYugioh = currentTCG === 'yugioh';

  const currentTCGName = useMemo(() => {
    const t = TCGS.find((x) => x.id === currentTCG);
    return t?.shortName ?? 'TCG';
  }, [currentTCG]);

  const refreshAllDashboard = useCallback(async () => {
    console.log('[Dashboard] Refreshing all queries...');
    await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-ink-dist'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-dual-ink-dist'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-decks-list'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-rarity-dist'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-type-dist'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-set-progress'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-purchased-decks'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-top-value'] });
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      console.log('[Dashboard] Tab focused, refreshing...');
      void refreshAllDashboard();
    }, [refreshAllDashboard])
  );

  const handlePullToRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAllDashboard();
    setRefreshing(false);
  }, [refreshAllDashboard]);

  const [inkDistMode, setInkDistMode] = useState<DistMode>('unique');
  const [typeDistMode, setTypeDistMode] = useState<DistMode>('unique');
  const [showDualColors, setShowDualColors] = useState<boolean>(false);
  const [showPurchasedDecks, setShowPurchasedDecks] = useState<boolean>(false);
  const [showAllTopCards, setShowAllTopCards] = useState<boolean>(false);
  const [priceSource, setPriceSource] = useState<PriceSource>('tcg');
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(DEFAULT_SECTION_ORDER);
  const [reorderMode, setReorderMode] = useState<boolean>(false);

  useEffect(() => {
    void AsyncStorage.getItem(SECTION_ORDER_KEY).then(stored => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as SectionId[];
          if (Array.isArray(parsed) && parsed.length === DEFAULT_SECTION_ORDER.length) {
            setSectionOrder(parsed);
          }
        } catch {
          console.log('[Dashboard] Failed to parse stored section order');
        }
      }
    });
  }, []);

  const moveSection = useCallback((fromIdx: number, toIdx: number) => {
    setSectionOrder(prev => {
      const newOrder = [...prev];
      const [moved] = newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, moved);
      void AsyncStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(newOrder));
      return newOrder;
    });
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats', !!db, hasCatalog],
    queryFn: async () => {
      if (!db) return null;
      const totalCards = await safeQueryFirst<{ count: number }>(db, 'SELECT COUNT(*) as count FROM cards');
      const ownedUnique = await safeQueryFirst<{ count: number }>(
        db,
        'SELECT COUNT(*) as count FROM user_collection WHERE (qty + qty_foil + qty_enchanted + qty_epic + qty_promo + qty_iconic + qty_play) > 0'
      );
      const totalCopies = await safeQueryFirst<{ total: number }>(
        db,
        'SELECT COALESCE(SUM(qty + qty_foil + qty_enchanted + qty_epic + qty_promo + qty_iconic + qty_play), 0) as total FROM user_collection'
      );
      const deckCount = await safeQueryFirst<{ count: number }>(db, 'SELECT COUNT(*) as count FROM decks');

      let gameStats = { total: 0, wins: 0, losses: 0, winRate: 0 };
      try {
        const totalGames = await safeQueryFirst<{ count: number }>(db, 'SELECT COUNT(*) as count FROM game_history');
        const wins = await safeQueryFirst<{ count: number }>(db, "SELECT COUNT(*) as count FROM game_history WHERE result = 'win'");
        const losses = await safeQueryFirst<{ count: number }>(db, "SELECT COUNT(*) as count FROM game_history WHERE result = 'loss'");
        const total = totalGames?.count ?? 0;
        const w = wins?.count ?? 0;
        gameStats = {
          total,
          wins: w,
          losses: losses?.count ?? 0,
          winRate: total > 0 ? Math.round((w / total) * 100) : 0,
        };
      } catch {
        console.log('[Dashboard] game_history table not ready yet');
      }

      return {
        totalCards: totalCards?.count ?? 0,
        ownedUnique: ownedUnique?.count ?? 0,
        totalCopies: totalCopies?.total ?? 0,
        deckCount: deckCount?.count ?? 0,
        gameStats,
      };
    },
    enabled: isReady && !!db && hasCatalog,
  });

  const { data: inkDist } = useQuery({
    queryKey: ['dashboard-ink-dist', !!db, hasCatalog],
    queryFn: async () => {
      if (!db) return [];
      return safeQuery<InkDistItem>(
        db,
        `SELECT c.ink_color,
                COUNT(DISTINCT c.id) as unique_count,
                COALESCE(SUM(uc.qty + uc.qty_foil + uc.qty_enchanted + uc.qty_epic + uc.qty_promo + uc.qty_iconic + uc.qty_play), 0) as total_count
         FROM user_collection uc
         JOIN cards c ON c.id = uc.card_id
         WHERE (uc.qty + uc.qty_foil + uc.qty_enchanted + uc.qty_epic + uc.qty_promo + uc.qty_iconic + uc.qty_play) > 0
         AND c.ink_color IS NOT NULL
         AND c.ink_color NOT LIKE '%,%'
         GROUP BY c.ink_color
         ORDER BY unique_count DESC`
      );
    },
    enabled: isReady && !!db && hasCatalog,
  });

  const { data: dualColorInkDist } = useQuery({
    queryKey: ['dashboard-dual-ink-dist', !!db, hasCatalog],
    queryFn: async () => {
      if (!db) return [];
      return safeQuery<{ combo: string; unique_count: number; total_count: number }>(
        db,
        `SELECT c.ink_color as combo,
                COUNT(DISTINCT c.id) as unique_count,
                COALESCE(SUM(uc.qty + uc.qty_foil + uc.qty_enchanted + uc.qty_epic + uc.qty_promo + uc.qty_iconic + uc.qty_play), 0) as total_count
         FROM user_collection uc
         JOIN cards c ON c.id = uc.card_id
         WHERE (uc.qty + uc.qty_foil + uc.qty_enchanted + uc.qty_epic + uc.qty_promo + uc.qty_iconic + uc.qty_play) > 0
         AND c.ink_color IS NOT NULL
         AND c.ink_color LIKE '%,%'
         GROUP BY c.ink_color
         ORDER BY unique_count DESC`
      );
    },
    enabled: isReady && !!db && hasCatalog,
  });

  const { data: purchasedDecks } = useQuery({
    queryKey: ['dashboard-purchased-decks', !!db, hasCatalog],
    queryFn: async () => {
      if (!db) return [];
      return safeQuery<PurchasedStarterDeck>(
        db,
        'SELECT * FROM purchased_starter_decks ORDER BY purchased_at DESC'
      );
    },
    enabled: isReady && !!db,
  });

  const { data: topValueCardsRaw } = useQuery({
    queryKey: ['dashboard-top-value', currentTCG, !!db, hasCatalog],
    queryFn: async () => {
      if (!db) return [];
      try {
        const rows = await safeQuery<TopValueCard>(
          db,
          `SELECT c.id as card_id, c.name, c.version, c.ink_color, c.rarity, c.set_code, c.card_number,
                  i.image_url, i.thumbnail_url,
                  dp.normal_price, dp.foil_price, dp.cm_normal_price, dp.cm_foil_price,
                  0 as best_price
           FROM user_collection uc
           JOIN cards c ON c.id = uc.card_id
           JOIN dotgg_prices dp ON dp.card_id = c.id
           LEFT JOIN images i ON i.card_id = c.id
           WHERE (uc.qty + uc.qty_foil + uc.qty_enchanted + uc.qty_epic + uc.qty_promo + uc.qty_iconic + uc.qty_play) > 0
           AND (
             dp.normal_price IS NOT NULL OR dp.foil_price IS NOT NULL
             OR dp.cm_normal_price IS NOT NULL OR dp.cm_foil_price IS NOT NULL
           )`
        );
        return rows;
      } catch {
        console.log('[Dashboard] dotgg_prices table not ready yet');
        return [];
      }
    },
    enabled: isReady && !!db && hasCatalog && isLorcana,
  });

  const topValueCards = useMemo(() => {
    if (!topValueCardsRaw || topValueCardsRaw.length === 0) return [];
    return topValueCardsRaw
      .map(card => {
        let best = 0;
        if (priceSource === 'tcg') {
          best = Math.max(card.normal_price ?? 0, card.foil_price ?? 0);
        } else {
          best = Math.max(card.cm_normal_price ?? 0, card.cm_foil_price ?? 0);
        }
        return { ...card, best_price: best };
      })
      .filter(c => c.best_price > 0)
      .sort((a, b) => b.best_price - a.best_price)
      .slice(0, 5);
  }, [topValueCardsRaw, priceSource]);

  const { data: decksList } = useQuery({
    queryKey: ['dashboard-decks-list', !!db, hasCatalog],
    queryFn: async () => {
      if (!db) return [];
      return safeQuery<{ id: number; name: string; ink_profile: string | null; card_count: number }>(
        db,
        `SELECT d.id, d.name, d.ink_profile,
                (SELECT COALESCE(SUM(dc.qty), 0) FROM deck_cards dc WHERE dc.deck_id = d.id) as card_count
         FROM decks d
         ORDER BY d.name ASC`
      );
    },
    enabled: isReady && !!db && hasCatalog,
  });

  const { data: rarityDist } = useQuery({
    queryKey: ['dashboard-rarity-dist', currentTCG, !!db, hasCatalog],
    queryFn: async () => {
      if (!db) return [];
      const rows = await safeQuery<RarityDistItem>(
        db,
        `SELECT c.rarity,
                COUNT(DISTINCT c.id) as unique_count,
                COALESCE(SUM(uc.qty + uc.qty_foil + uc.qty_enchanted + uc.qty_epic + uc.qty_promo + uc.qty_iconic + uc.qty_play), 0) as total_count
         FROM user_collection uc
         JOIN cards c ON c.id = uc.card_id
         WHERE (uc.qty + uc.qty_foil + uc.qty_enchanted + uc.qty_epic + uc.qty_promo + uc.qty_iconic + uc.qty_play) > 0
         AND c.rarity IS NOT NULL
         GROUP BY c.rarity`
      );

      if (!isLorcana) {
        return rows.sort((a, b) => a.rarity.localeCompare(b.rarity));
      }

      const userTypeRows = await safeQuery<{ user_type: string; unique_count: number; total_count: number }>(
        db,
        `SELECT 'Epic' as user_type, COUNT(DISTINCT c.id) as unique_count, COALESCE(SUM(uc.qty_epic), 0) as total_count
         FROM user_collection uc JOIN cards c ON c.id = uc.card_id WHERE uc.qty_epic > 0
         UNION ALL
         SELECT 'Enchanted', COUNT(DISTINCT c.id), COALESCE(SUM(uc.qty_enchanted), 0)
         FROM user_collection uc JOIN cards c ON c.id = uc.card_id WHERE uc.qty_enchanted > 0
         UNION ALL
         SELECT 'Iconic', COUNT(DISTINCT c.id), COALESCE(SUM(uc.qty_iconic), 0)
         FROM user_collection uc JOIN cards c ON c.id = uc.card_id WHERE uc.qty_iconic > 0
         UNION ALL
         SELECT 'Promo', COUNT(DISTINCT c.id), COALESCE(SUM(uc.qty_promo), 0)
         FROM user_collection uc JOIN cards c ON c.id = uc.card_id WHERE uc.qty_promo > 0
         UNION ALL
         SELECT 'Play', COUNT(DISTINCT c.id), COALESCE(SUM(uc.qty_play), 0)
         FROM user_collection uc JOIN cards c ON c.id = uc.card_id WHERE uc.qty_play > 0`
      );

      const foilRow = await safeQueryFirst<{ unique_count: number; total_count: number }>(
        db,
        `SELECT COUNT(DISTINCT c.id) as unique_count, COALESCE(SUM(uc.qty_foil), 0) as total_count
         FROM user_collection uc
         JOIN cards c ON c.id = uc.card_id
         WHERE uc.qty_foil > 0`
      );

      const rowMap = new Map<string, RarityDistItem>();
      for (const r of rows) {
        rowMap.set(r.rarity, { ...r });
      }

      for (const ut of userTypeRows) {
        if (ut.total_count > 0) {
          const existing = rowMap.get(ut.user_type);
          if (existing) {
            existing.unique_count = Math.max(existing.unique_count, ut.unique_count);
            existing.total_count = Math.max(existing.total_count, ut.total_count);
          } else {
            rowMap.set(ut.user_type, { rarity: ut.user_type, unique_count: ut.unique_count, total_count: ut.total_count });
          }
        }
      }

      const allRarities = RARITY_ORDER.map(r => {
        const existing = rowMap.get(r);
        return existing ?? { rarity: r, unique_count: 0, total_count: 0 };
      });

      if (foilRow && foilRow.unique_count > 0) {
        const foilIdx = allRarities.findIndex(r => r.rarity === 'Foil');
        if (foilIdx >= 0) {
          allRarities[foilIdx] = { rarity: 'Foil', unique_count: foilRow.unique_count, total_count: foilRow.total_count };
        }
      }

      return allRarities;
    },
    enabled: isReady && !!db && hasCatalog,
  });

  const { data: typeDist } = useQuery({
    queryKey: ['dashboard-type-dist', currentTCG, !!db, hasCatalog],
    queryFn: async () => {
      if (!db) return [];
      const rows = await safeQuery<TypeDistItem>(
        db,
        `SELECT c.type,
                COUNT(DISTINCT c.id) as unique_count,
                COALESCE(SUM(uc.qty + uc.qty_foil + uc.qty_enchanted + uc.qty_epic + uc.qty_promo + uc.qty_iconic + uc.qty_play), 0) as total_count
         FROM user_collection uc
         JOIN cards c ON c.id = uc.card_id
         WHERE (uc.qty + uc.qty_foil + uc.qty_enchanted + uc.qty_epic + uc.qty_promo + uc.qty_iconic + uc.qty_play) > 0
         AND c.type IS NOT NULL
         GROUP BY c.type`
      );
      const order = isOnePiece ? ONEPIECE_TYPE_ORDER : isYugioh ? ['Monster', 'Spell', 'Trap'] : TYPE_ORDER;
      const orderMap = new Map(order.map((v, i) => [v, i]));
      return rows.sort((a, b) => (orderMap.get(a.type) ?? 999) - (orderMap.get(b.type) ?? 999));
    },
    enabled: isReady && !!db && hasCatalog,
  });

  const { data: setProgress } = useQuery({
    queryKey: ['dashboard-set-progress', !!db, hasCatalog],
    queryFn: async () => {
      if (!db) return [];
      return safeQuery<SetProgress>(
        db,
        `SELECT c.set_code,
                COALESCE(s.name, c.set_code) as set_name,
                COUNT(DISTINCT CASE WHEN uc.card_id IS NOT NULL AND (uc.qty + uc.qty_foil + uc.qty_enchanted + uc.qty_epic + uc.qty_promo + uc.qty_iconic + uc.qty_play) > 0 THEN c.id END) as owned,
                COUNT(DISTINCT c.id) as total
         FROM cards c
         LEFT JOIN sets s ON s.set_code = c.set_code
         LEFT JOIN user_collection uc ON uc.card_id = c.id
         WHERE c.set_code IS NOT NULL
         GROUP BY c.set_code
         ORDER BY COALESCE(s.release_date, '9999') ASC, c.set_code ASC`
      );
    },
    enabled: isReady && !!db && hasCatalog,
  });

  type SetSortMode = 'release' | 'alpha' | 'most_owned' | 'least_owned';
  const [setSortMode, setSetSortMode] = useState<SetSortMode>('release');

  const sortedSetProgress = useMemo(() => {
    if (!setProgress) return [];
    const sorted = [...setProgress];
    switch (setSortMode) {
      case 'alpha':
        return sorted.sort((a, b) => a.set_name.localeCompare(b.set_name));
      case 'most_owned':
        return sorted.sort((a, b) => b.owned - a.owned);
      case 'least_owned':
        return sorted.sort((a, b) => a.owned - b.owned);
      case 'release':
      default:
        return sorted.sort((a, b) => getSetSortOrder(a.set_name) - getSetSortOrder(b.set_name));
    }
  }, [setProgress, setSortMode]);

  const SORT_OPTIONS: { key: SetSortMode; label: string }[] = [
    { key: 'release', label: 'Release' },
    { key: 'alpha', label: 'A-Z' },
    { key: 'most_owned', label: 'Most' },
    { key: 'least_owned', label: 'Least' },
  ];

  if (!isReady || isSyncing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>
          {isSyncing
            ? syncProgress
              ? `Syncing cards... ${syncProgress.current}/${syncProgress.total}`
              : 'Fetching cards from API...'
            : 'Loading database...'}
        </Text>
        {isSyncing && (
          <View style={styles.syncInfo}>
            <Cloud size={16} color={Colors.textMuted} />
            <Text style={styles.syncInfoText}>
              {currentTCG === 'yugioh'
                ? 'Importing Yu-Gi-Oh! catalog from YGOPRODeck'
                : currentTCG === 'onepiece'
                  ? 'Importing One Piece catalog'
                  : 'Downloading from lorcana-api.com'}
            </Text>
          </View>
        )}
      </View>
    );
  }

  const gs = stats?.gameStats;

  const renderDistToggle = (mode: DistMode, setMode: (m: DistMode) => void) => (
    <View style={styles.distToggle}>
      <TouchableOpacity
        style={[styles.distChip, mode === 'unique' && styles.distChipActive]}
        onPress={() => setMode('unique')}
      >
        <Text style={[styles.distChipText, mode === 'unique' && styles.distChipTextActive]}>Unique</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.distChip, mode === 'total' && styles.distChipActive]}
        onPress={() => setMode('total')}
      >
        <Text style={[styles.distChipText, mode === 'total' && styles.distChipTextActive]}>Total</Text>
      </TouchableOpacity>
    </View>
  );

  const renderReorderControls = (sectionIdx: number) => {
    if (!reorderMode) return null;
    return (
      <View style={styles.reorderControls}>
        <TouchableOpacity
          style={[styles.reorderBtn, sectionIdx === 0 && styles.reorderBtnDisabled]}
          onPress={() => sectionIdx > 0 && moveSection(sectionIdx, sectionIdx - 1)}
          disabled={sectionIdx === 0}
        >
          <ChevronUp size={16} color={sectionIdx === 0 ? Colors.textMuted : Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.reorderBtn, sectionIdx === sectionOrder.length - 1 && styles.reorderBtnDisabled]}
          onPress={() => sectionIdx < sectionOrder.length - 1 && moveSection(sectionIdx, sectionIdx + 1)}
          disabled={sectionIdx === sectionOrder.length - 1}
        >
          <ChevronDown size={16} color={sectionIdx === sectionOrder.length - 1 ? Colors.textMuted : Colors.primary} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderTopValue = (sectionIdx: number) => {
    if ((topValueCards?.length ?? 0) === 0) return null;
    const sym = getPriceSymbol(priceSource);
    return (
      <View key="top_value" style={[styles.section, reorderMode && styles.sectionReorder]}>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowAllTopCards(!showAllTopCards)}
            activeOpacity={0.7}
          >
            <Crown size={18} color={Colors.warning} />
            <Text style={styles.sectionTitle}>Most Valuable</Text>
            {(topValueCards?.length ?? 0) > 1 && (
              showAllTopCards ? <ChevronUp size={16} color={Colors.textMuted} /> : <ChevronDown size={16} color={Colors.textMuted} />
            )}
          </TouchableOpacity>
          <View style={styles.sectionHeaderRight}>
            <View style={styles.priceSourceToggle}>
              <TouchableOpacity
                style={[styles.priceSourceChip, priceSource === 'tcg' && styles.priceSourceChipActive]}
                onPress={() => setPriceSource('tcg')}
              >
                <Text style={[styles.priceSourceText, priceSource === 'tcg' && styles.priceSourceTextActive]}>TCG</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.priceSourceChip, priceSource === 'cm' && styles.priceSourceChipActive]}
                onPress={() => setPriceSource('cm')}
              >
                <Text style={[styles.priceSourceText, priceSource === 'cm' && styles.priceSourceTextActive]}>CM</Text>
              </TouchableOpacity>
            </View>
            {renderReorderControls(sectionIdx)}
          </View>
        </View>

        {topValueCards?.slice(0, showAllTopCards ? 5 : 1).map((card, index) => {
          const priceLabel = sym + card.best_price.toFixed(2);
          const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32', Colors.textSecondary, Colors.textSecondary];
          return (
            <TouchableOpacity
              key={card.card_id}
              style={[styles.topCardItem, index === 0 && styles.topCardItemFirst]}
              onPress={() => router.push(`/card/${card.card_id}`)}
              activeOpacity={0.7}
            >
              <View style={[styles.topCardRank, { backgroundColor: (rankColors[index] ?? Colors.textSecondary) + '20' }]}>
                <Text style={[styles.topCardRankText, { color: rankColors[index] ?? Colors.textSecondary }]}>#{index + 1}</Text>
              </View>
              <CardImage
                cardId={card.card_id}
                imageUrl={card.image_url}
                thumbnailUrl={card.thumbnail_url}
                size="small"
                style={styles.topCardImage}
              />
              <View style={styles.topCardInfo}>
                <Text style={styles.topCardName} numberOfLines={1}>{card.name}</Text>
                {card.version && <Text style={styles.topCardVersion} numberOfLines={1}>{card.version}</Text>}
                <View style={styles.topCardMeta}>
                  {card.ink_color && (
                    <View style={[styles.topCardInkDot, { backgroundColor: Colors.ink[card.ink_color] ?? Colors.textMuted }]} />
                  )}
                  {card.rarity && (
                    <Text style={[styles.topCardRarity, { color: Colors.rarity[card.rarity] ?? Colors.textSecondary }]}>
                      {card.rarity}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.topCardPriceBox}>
                <DollarSign size={12} color={Colors.success} />
                <Text style={styles.topCardPrice}>{priceLabel}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {!showAllTopCards && (topValueCards?.length ?? 0) > 1 && (
          <TouchableOpacity
            style={styles.topCardExpandHint}
            onPress={() => setShowAllTopCards(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.topCardExpandText}>Show top {topValueCards?.length ?? 0} cards</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderGameStats = (sectionIdx: number) => {
    if (!gs || gs.total === 0) return null;
    return (
      <TouchableOpacity key="game_stats" style={[styles.section, reorderMode && styles.sectionReorder]} onPress={() => router.push('/game-history')} activeOpacity={0.7}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeader}>
            <Swords size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Game Stats</Text>
          </View>
          {renderReorderControls(sectionIdx)}
        </View>
        <View style={styles.gameStatsRow}>
          <View style={styles.gameStatItem}>
            <Text style={styles.gameStatValue}>{gs.total}</Text>
            <Text style={styles.gameStatLabel}>Games</Text>
          </View>
          <View style={styles.gameStatItem}>
            <Text style={[styles.gameStatValue, { color: Colors.success }]}>{gs.wins}</Text>
            <Text style={styles.gameStatLabel}>Wins</Text>
          </View>
          <View style={styles.gameStatItem}>
            <Text style={[styles.gameStatValue, { color: Colors.danger }]}>{gs.losses}</Text>
            <Text style={styles.gameStatLabel}>Losses</Text>
          </View>
          <View style={styles.gameStatItem}>
            <Text style={[styles.gameStatValue, { color: Colors.primary }]}>{gs.winRate}%</Text>
            <Text style={styles.gameStatLabel}>Win Rate</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderInkDist = (sectionIdx: number) => {
    if ((inkDist?.length ?? 0) === 0) return null;
    return (
      <View key="ink_dist" style={[styles.section, reorderMode && styles.sectionReorder]}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeader}>
            <Palette size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>{isOnePiece ? 'Color Distribution' : isYugioh ? 'Attribute Distribution' : 'Ink Distribution'}</Text>
          </View>
          <View style={styles.sectionHeaderRight}>
            {renderDistToggle(inkDistMode, setInkDistMode)}
            {renderReorderControls(sectionIdx)}
          </View>
        </View>
        <View style={styles.inkGrid}>
          {inkDist?.map((ink) => {
            const color = Colors.ink[ink.ink_color] ?? Colors.textSecondary;
            const count = inkDistMode === 'unique' ? ink.unique_count : ink.total_count;
            const maxCount = Math.max(...(inkDist?.map(i => inkDistMode === 'unique' ? i.unique_count : i.total_count) ?? [1]));
            const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
            return (
              <View key={ink.ink_color} style={styles.inkRow}>
                <View style={styles.inkLabel}>
                  <View style={[styles.inkDot, { backgroundColor: color }]} />
                  <Text style={styles.inkName}>{ink.ink_color}</Text>
                </View>
                <View style={styles.inkBarContainer}>
                  <View style={[styles.inkBar, { width: `${barWidth}%`, backgroundColor: color }]} />
                </View>
                <Text style={[styles.inkCount, { color }]}>{count}</Text>
              </View>
            );
          })}
        </View>
        {(dualColorInkDist?.length ?? 0) > 0 && (
          <>
            <TouchableOpacity
              style={styles.dualToggle}
              onPress={() => setShowDualColors(!showDualColors)}
              activeOpacity={0.7}
            >
              <Sparkles size={14} color={Colors.primaryLight} />
              <Text style={styles.dualToggleText}>Dual Colors</Text>
              {showDualColors ? <ChevronUp size={14} color={Colors.textMuted} /> : <ChevronDown size={14} color={Colors.textMuted} />}
            </TouchableOpacity>
            {showDualColors && (
              <View style={styles.dualGrid}>
                {dualColorInkDist?.map((dc) => {
                  const inks = dc.combo.split(',').map(s => s.trim());
                  const count = inkDistMode === 'unique' ? dc.unique_count : dc.total_count;
                  return (
                    <View key={dc.combo} style={styles.dualRow}>
                      <View style={styles.dualDots}>
                        {inks.map((ink, i) => (
                          <View key={i} style={[styles.dualDot, { backgroundColor: Colors.ink[ink] ?? Colors.textMuted }]} />
                        ))}
                      </View>
                      <Text style={styles.dualName}>{inks.join(' / ')}</Text>
                      <Text style={styles.dualCount}>{count}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  const renderRarityDist = (sectionIdx: number) => {
    if ((rarityDist?.length ?? 0) === 0) return null;
    return (
      <View key="rarity_dist" style={[styles.section, reorderMode && styles.sectionReorder]}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeader}>
            <Sparkles size={18} color={Colors.warning} />
            <Text style={styles.sectionTitle}>Rarity Distribution</Text>
          </View>
          {renderReorderControls(sectionIdx)}
        </View>
        <View style={styles.rarityGrid}>
          {rarityDist?.map((r) => {
            const color = Colors.rarity[r.rarity] ?? Colors.textSecondary;
            return (
              <View key={r.rarity} style={styles.rarityItem}>
                <View style={[styles.rarityDot, { backgroundColor: color }]} />
                <Text style={styles.rarityName}>{r.rarity}</Text>
                <Text style={[styles.rarityCount, { color }]}>{r.unique_count}</Text>
                <Text style={styles.rarityTotal}>/ {r.total_count}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.rarityLegend}>
          <Text style={styles.rarityLegendText}>unique / total copies</Text>
        </View>
      </View>
    );
  };

  const renderDecks = (sectionIdx: number) => {
    if ((decksList?.length ?? 0) === 0) return null;
    return (
      <View key="decks" style={[styles.section, reorderMode && styles.sectionReorder]}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeader}>
            <Layers size={18} color={Colors.warning} />
            <Text style={styles.sectionTitle}>Decks</Text>
          </View>
          {renderReorderControls(sectionIdx)}
        </View>
        <View style={styles.decksGrid}>
          {decksList?.map((deck) => {
            const inks = deck.ink_profile?.split(',').map(s => s.trim()) ?? [];
            return (
              <TouchableOpacity
                key={deck.id}
                style={styles.deckItem}
                onPress={() => router.push(`/deck/${deck.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.deckInkDots}>
                  {inks.map((ink, i) => (
                    <View key={i} style={[styles.deckInkDot, { backgroundColor: Colors.ink[ink] ?? Colors.textMuted }]} />
                  ))}
                </View>
                <Text style={styles.deckName} numberOfLines={1}>{deck.name}</Text>
                <Text style={styles.deckCardCount}>{deck.card_count} cards</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderPurchasedDecks = (sectionIdx: number) => {
    if ((purchasedDecks?.length ?? 0) === 0) return null;
    return (
      <View key="purchased_decks" style={[styles.section, reorderMode && styles.sectionReorder]}>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowPurchasedDecks(!showPurchasedDecks)}
            activeOpacity={0.7}
          >
            <Package size={18} color={Colors.accent} />
            <Text style={styles.sectionTitle}>Purchased Starter Decks</Text>
            <View style={styles.purchasedBadge}>
              <Text style={styles.purchasedBadgeText}>{purchasedDecks?.length ?? 0}</Text>
            </View>
            {showPurchasedDecks ? <ChevronUp size={16} color={Colors.textMuted} /> : <ChevronDown size={16} color={Colors.textMuted} />}
          </TouchableOpacity>
          {renderReorderControls(sectionIdx)}
        </View>
        {showPurchasedDecks && (
          <View style={styles.purchasedGrid}>
            {purchasedDecks?.map((pd) => {
              const inks = pd.ink_profile.split(',').map(s => s.trim());
              return (
                <View key={pd.id} style={styles.purchasedItem}>
                  <View style={styles.purchasedDots}>
                    {inks.map((ink, i) => (
                      <View key={i} style={[styles.purchasedDot, { backgroundColor: Colors.ink[ink] ?? Colors.textMuted }]} />
                    ))}
                  </View>
                  <View style={styles.purchasedItemInfo}>
                    <Text style={styles.purchasedItemName} numberOfLines={1}>{pd.deck_name}</Text>
                    <Text style={styles.purchasedItemSet}>{pd.set_name}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderTypeDist = (sectionIdx: number) => {
    if ((typeDist?.length ?? 0) === 0) return null;
    return (
      <View key="type_dist" style={[styles.section, reorderMode && styles.sectionReorder]}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeader}>
            <Grid3X3 size={18} color={Colors.accent} />
            <Text style={styles.sectionTitle}>Type Distribution</Text>
          </View>
          <View style={styles.sectionHeaderRight}>
            {renderDistToggle(typeDistMode, setTypeDistMode)}
            {renderReorderControls(sectionIdx)}
          </View>
        </View>
        <View style={styles.inkGrid}>
          {typeDist?.map((t) => {
            const count = typeDistMode === 'unique' ? t.unique_count : t.total_count;
            const maxCount = Math.max(...(typeDist?.map(i => typeDistMode === 'unique' ? i.unique_count : i.total_count) ?? [1]));
            const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const typeColors: Record<string, string> = {
              Character: '#3498DB',
              Action: '#E74C3C',
              Item: '#F2994A',
              Song: '#9B59B6',
              Location: '#27AE60',
            };
            const color = typeColors[t.type] ?? Colors.textSecondary;
            return (
              <View key={t.type} style={styles.inkRow}>
                <View style={styles.inkLabel}>
                  <View style={[styles.inkDot, { backgroundColor: color }]} />
                  <Text style={styles.inkName}>{t.type}</Text>
                </View>
                <View style={styles.inkBarContainer}>
                  <View style={[styles.inkBar, { width: `${barWidth}%`, backgroundColor: color }]} />
                </View>
                <Text style={[styles.inkCount, { color }]}>{count}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderSetProgress = (sectionIdx: number) => {
    if ((setProgress?.length ?? 0) === 0) return null;
    return (
      <View key="set_progress" style={[styles.section, reorderMode && styles.sectionReorder]}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeader}>
            <BarChart3 size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Set Progress</Text>
          </View>
          {renderReorderControls(sectionIdx)}
        </View>
        <View style={styles.sortRow}>
          <ArrowUpDown size={13} color={Colors.textMuted} />
          {SORT_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.sortChip, setSortMode === opt.key && styles.sortChipActive]}
              onPress={() => setSetSortMode(opt.key)}
            >
              <Text style={[styles.sortChipText, setSortMode === opt.key && styles.sortChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {sortedSetProgress.map((set) => {
          const pct = set.total > 0 ? Math.round((set.owned / set.total) * 100) : 0;
          const setNum = getSetNumber(set.set_name);
          return (
            <View key={set.set_code} style={styles.setRow}>
              <View style={styles.setInfo}>
                <View style={styles.setNameRow}>
                  {setNum !== null ? (
                    <View style={styles.setNumBadge}>
                      <Text style={styles.setNumText}>S{setNum}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.setName} numberOfLines={1}>{set.set_name}</Text>
                </View>
                <Text style={styles.setCount}>{set.owned}/{set.total}</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.pctText}>{pct}%</Text>
            </View>
          );
        })}
      </View>
    );
  };

  const sectionRenderers: Record<SectionId, (idx: number) => React.ReactNode> = {
    top_value: renderTopValue,
    game_stats: renderGameStats,
    ink_dist: renderInkDist,
    rarity_dist: renderRarityDist,
    decks: renderDecks,
    purchased_decks: renderPurchasedDecks,
    type_dist: renderTypeDist,
    set_progress: renderSetProgress,
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handlePullToRefresh}
          tintColor={Colors.primary}
          colors={[Colors.primary]}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>{currentTCGName} Collection</Text>
        <Text style={styles.subtitle}>
          {hasCatalog ? `${stats?.totalCards ?? 0} cards in catalog` : 'Sync cards from the API in Settings'}
        </Text>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickBtn} onPress={() => router.push('/log-game')}>
          <View style={[styles.quickIcon, { backgroundColor: Colors.success + '20' }]}>
            <Plus size={18} color={Colors.success} />
          </View>
          <Text style={styles.quickText}>Log Game</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => router.push('/game-history')}>
          <View style={[styles.quickIcon, { backgroundColor: Colors.warning + '20' }]}>
            <History size={18} color={Colors.warning} />
          </View>
          <Text style={styles.quickText}>History</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickBtn, reorderMode && { borderColor: Colors.primary, backgroundColor: Colors.primary + '12' }]}
          onPress={() => {
            setReorderMode(!reorderMode);
            if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }}
        >
          <View style={[styles.quickIcon, { backgroundColor: Colors.primary + '20' }]}>
            <GripVertical size={18} color={Colors.primary} />
          </View>
          <Text style={styles.quickText}>{reorderMode ? 'Done' : 'Reorder'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        <StatCard
          title="Unique Owned"
          value={stats?.ownedUnique ?? 0}
          icon={<Library size={20} color={Colors.primary} />}
          color={Colors.primary}
        />
        <StatCard
          title="Total Catalog"
          value={stats?.totalCards ?? 0}
          icon={<Copy size={20} color={Colors.accent} />}
          color={Colors.accent}
        />
      </View>
      <View style={styles.statsGrid}>
        <StatCard
          title="Total Copies"
          value={stats?.totalCopies ?? 0}
          icon={<TrendingUp size={20} color={Colors.successLight} />}
          color={Colors.success}
        />
        <StatCard
          title="Decks"
          value={stats?.deckCount ?? 0}
          icon={<Layers size={20} color={Colors.warning} />}
          color={Colors.warning}
        />
      </View>

      {sectionOrder.map((sectionId, idx) => sectionRenderers[sectionId](idx))}

      {!hasCatalog && (
        <View style={styles.noCatalog}>
          <Cloud size={32} color={Colors.textMuted} />
          <Text style={styles.noCatalogTitle}>No Cards Synced</Text>
          <Text style={styles.noCatalogText}>
            Go to Settings and tap Sync Cards from API to download the card catalog for the selected game.
          </Text>
        </View>
      )}

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: Colors.background,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  syncInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  syncInfoText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  header: {
    marginBottom: 4,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginTop: 4,
  },
  sectionReorder: {
    borderColor: Colors.primary + '40',
    borderStyle: 'dashed' as const,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  reorderControls: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
    marginLeft: 6,
  },
  reorderBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  reorderBtnDisabled: {
    backgroundColor: Colors.surfaceLight,
    opacity: 0.4,
  },
  priceSourceToggle: {
    flexDirection: 'row' as const,
    gap: 4,
  },
  priceSourceChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  priceSourceChipActive: {
    backgroundColor: Colors.warning + '25',
    borderColor: Colors.warning,
  },
  priceSourceText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  priceSourceTextActive: {
    color: Colors.warning,
  },
  gameStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  gameStatItem: {
    alignItems: 'center',
    gap: 2,
  },
  gameStatValue: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  gameStatLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  distToggle: {
    flexDirection: 'row',
    gap: 4,
  },
  distChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  distChipActive: {
    backgroundColor: Colors.primary + '25',
    borderColor: Colors.primary,
  },
  distChipText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  distChipTextActive: {
    color: Colors.primary,
  },
  inkGrid: {
    gap: 8,
  },
  inkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inkLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 90,
  },
  inkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  inkName: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  inkBarContainer: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceLight,
    overflow: 'hidden' as const,
  },
  inkBar: {
    height: 8,
    borderRadius: 4,
  },
  inkCount: {
    fontSize: 13,
    fontWeight: '700' as const,
    width: 36,
    textAlign: 'right' as const,
  },
  dualGrid: {
    gap: 8,
  },
  dualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
  },
  dualDots: {
    flexDirection: 'row',
    gap: 3,
  },
  dualDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dualName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  dualCount: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  rarityGrid: {
    gap: 6,
  },
  rarityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  rarityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rarityName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  rarityCount: {
    fontSize: 14,
    fontWeight: '700' as const,
    width: 36,
    textAlign: 'right' as const,
  },
  rarityTotal: {
    fontSize: 12,
    color: Colors.textMuted,
    width: 40,
  },
  rarityLegend: {
    alignItems: 'flex-end',
  },
  rarityLegendText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: 'italic' as const,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  setInfo: {
    width: 130,
  },
  setNameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  setNumBadge: {
    backgroundColor: Colors.primary + '20',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  setNumText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  setName: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '500' as const,
    flex: 1,
  },
  setCount: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  progressBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceLight,
    overflow: 'hidden' as const,
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  pctText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.primaryLight,
    width: 36,
    textAlign: 'right' as const,
  },
  noCatalog: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginTop: 16,
  },
  noCatalogTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  noCatalogText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 18,
  },
  sortRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginBottom: 4,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  sortChipActive: {
    backgroundColor: Colors.primary + '25',
    borderColor: Colors.primary,
  },
  sortChipText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  sortChipTextActive: {
    color: Colors.primary,
  },
  dualToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    marginTop: 4,
  },
  dualToggleText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.primaryLight,
  },
  decksGrid: {
    gap: 8,
  },
  deckItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
  },
  deckInkDots: {
    flexDirection: 'row' as const,
    gap: 3,
  },
  deckInkDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  deckName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  deckCardCount: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.textMuted,
  },
  purchasedBadge: {
    backgroundColor: Colors.accent + '25',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  purchasedBadgeText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.accent,
  },
  purchasedGrid: {
    gap: 6,
  },
  purchasedItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
  },
  purchasedDots: {
    flexDirection: 'row' as const,
    gap: 3,
  },
  purchasedDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  purchasedItemInfo: {
    flex: 1,
    gap: 1,
  },
  purchasedItemName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  purchasedItemSet: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  topCardItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
  },
  topCardItemFirst: {
    backgroundColor: Colors.warning + '12',
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  topCardRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  topCardRankText: {
    fontSize: 12,
    fontWeight: '800' as const,
  },
  topCardImage: {
    borderRadius: 4,
  },
  topCardInfo: {
    flex: 1,
    gap: 2,
  },
  topCardName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  topCardVersion: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: 'italic' as const,
  },
  topCardMeta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    marginTop: 1,
  },
  topCardInkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  topCardRarity: {
    fontSize: 10,
    fontWeight: '600' as const,
  },
  topCardPriceBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
    backgroundColor: Colors.success + '18',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  topCardPrice: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: Colors.success,
  },
  topCardExpandHint: {
    alignItems: 'center' as const,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    marginTop: 2,
  },
  topCardExpandText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.primaryLight,
  },
});
