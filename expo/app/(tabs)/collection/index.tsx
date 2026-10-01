import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Search, SlidersHorizontal, X, Check, Library, Camera, Lock, Unlock } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { useTCG } from '@/providers/TCGProvider';
import { safeQuery } from '@/utils/database';
import CardListItem from '@/components/CardListItem';
import EmptyState from '@/components/EmptyState';
import type { CardWithDetails, CollectionFilters } from '@/types/database';

const PAGE_SIZE = 40;

const INK_ORDER = ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'];
const RARITY_ORDER = [
  // Lorcana
  'Common', 'Uncommon', 'Rare', 'Super Rare', 'Legendary', 'Epic', 'Enchanted', 'Iconic', 'Promo',
  // One Piece
  'C', 'UC', 'R', 'SR', 'SEC', 'L', 'PR', 'TR',
];
const TYPE_ORDER = ['Character', 'Action', 'Item', 'Song', 'Location'];
const ONEPIECE_TYPES = ['Leader', 'Character', 'Event', 'Stage', 'DON!!'];

function sortByOrder(items: string[], order: string[]): string[] {
  const orderMap = new Map(order.map((v, i) => [v, i]));
  return [...items].sort((a, b) => {
    const ai = orderMap.get(a) ?? 999;
    const bi = orderMap.get(b) ?? 999;
    return ai - bi;
  });
}

export default function CollectionScreen() {
  const router = useRouter();
  const { db, isReady, hasCatalog } = useDatabase();
  const { tcg } = useTCG();
  const isOnePiece = tcg === 'onepiece';
  const [filters, setFilters] = useState<CollectionFilters>({
    search: '',
    inkColors: [],
    cardTypes: [],
    rarities: [],
    setCodes: [],
    variantTypes: [],
    onlyOwned: false,
    onlyMissing: false,
    strengths: [],
    counters: [],
    lives: [],
  });
  const [page, setPage] = useState<number>(0);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [editLocked, setEditLocked] = useState<boolean>(true);

  const buildQuery = useCallback((mode: 'list' | 'count' | 'totalCopies') => {
    let sql: string;
    if (mode === 'totalCopies') {
      sql = `SELECT COALESCE(SUM(COALESCE(uc.qty, 0) + COALESCE(uc.qty_foil, 0) + COALESCE(uc.qty_enchanted, 0) + COALESCE(uc.qty_epic, 0) + COALESCE(uc.qty_promo, 0) + COALESCE(uc.qty_iconic, 0) + COALESCE(uc.qty_play, 0)), 0) as total_copies`;
    } else if (mode === 'count') {
      sql = 'SELECT COUNT(DISTINCT c.id) as count';
    } else {
      sql = `SELECT DISTINCT c.id, c.name, c.version, c.ink_color, c.cost, c.rarity, c.type, c.set_code,
                c.card_number, c.strength, c.willpower, c.lore, c.inkable,
                COALESCE(uc.qty, 0) as qty, COALESCE(uc.qty_foil, 0) as qty_foil,
                COALESCE(uc.qty_enchanted, 0) as qty_enchanted,
                COALESCE(uc.qty_epic, 0) as qty_epic, COALESCE(uc.qty_promo, 0) as qty_promo,
                COALESCE(uc.qty_iconic, 0) as qty_iconic, COALESCE(uc.qty_play, 0) as qty_play,
                i.image_url, i.thumbnail_url, s.name as set_name, s.release_date,
                COALESCE(uc.qty, 0) + COALESCE(uc.qty_foil, 0) + COALESCE(uc.qty_enchanted, 0)
                + COALESCE(uc.qty_epic, 0) + COALESCE(uc.qty_promo, 0)
                + COALESCE(uc.qty_iconic, 0) + COALESCE(uc.qty_play, 0) as total_owned`;
    }

    sql += ` FROM cards c
             LEFT JOIN user_collection uc ON uc.card_id = c.id
             LEFT JOIN images i ON i.card_id = c.id
             LEFT JOIN sets s ON s.set_code = c.set_code
             WHERE 1=1`;

    const params: unknown[] = [];

    if (filters.search.trim()) {
      sql += ` AND c.name LIKE ?`;
      params.push(`%${filters.search.trim()}%`);
    }
    if (filters.inkColors.length > 0) {
      sql += ` AND c.ink_color IN (${filters.inkColors.map(() => '?').join(',')})`;
      params.push(...filters.inkColors);
    }
    if (filters.cardTypes.length > 0) {
      sql += ` AND c.type IN (${filters.cardTypes.map(() => '?').join(',')})`;
      params.push(...filters.cardTypes);
    }
    if (filters.rarities.length > 0) {
      const rarityPlaceholders = filters.rarities.map(() => '?').join(',');
      const variantMap: Record<string, string> = {
        'Epic': 'COALESCE(uc.qty_epic, 0) > 0',
        'Enchanted': 'COALESCE(uc.qty_enchanted, 0) > 0',
        'Promo': 'COALESCE(uc.qty_promo, 0) > 0',
        'Iconic': 'COALESCE(uc.qty_iconic, 0) > 0',
        'Play': 'COALESCE(uc.qty_play, 0) > 0',
      };
      const variantConditions = filters.rarities
        .map(r => variantMap[r])
        .filter(Boolean);
      if (variantConditions.length > 0) {
        sql += ` AND (c.rarity IN (${rarityPlaceholders}) OR ${variantConditions.join(' OR ')})`;
      } else {
        sql += ` AND c.rarity IN (${rarityPlaceholders})`;
      }
      params.push(...filters.rarities);
    }
    if (filters.setCodes.length > 0) {
      sql += ` AND c.set_code IN (${filters.setCodes.map(() => '?').join(',')})`;
      params.push(...filters.setCodes);
    }
    if (isOnePiece && filters.strengths.length > 0) {
      sql += ` AND c.strength IN (${filters.strengths.map(() => '?').join(',')})`;
      params.push(...filters.strengths);
    }
    if (isOnePiece && filters.counters.length > 0) {
      sql += ` AND c.willpower IN (${filters.counters.map(() => '?').join(',')})`;
      params.push(...filters.counters);
    }
    if (isOnePiece && filters.lives.length > 0) {
      sql += ` AND c.lore IN (${filters.lives.map(() => '?').join(',')})`;
      params.push(...filters.lives);
    }
    if (filters.variantTypes.length > 0) {
      const variantMap: Record<string, string> = {
        'Classic': 'COALESCE(uc.qty, 0) > 0',
        'Foil': 'COALESCE(uc.qty_foil, 0) > 0',
        'Epic': 'COALESCE(uc.qty_epic, 0) > 0',
        'Enchanted': 'COALESCE(uc.qty_enchanted, 0) > 0',
        'Promo': 'COALESCE(uc.qty_promo, 0) > 0',
        'Iconic': 'COALESCE(uc.qty_iconic, 0) > 0',
        'Play': 'COALESCE(uc.qty_play, 0) > 0',
      };
      const conditions = filters.variantTypes.map(v => variantMap[v]).filter(Boolean);
      if (conditions.length > 0) {
        sql += ` AND (${conditions.join(' OR ')})`;
      }
    }
    if (filters.onlyOwned) {
      sql += ` AND (COALESCE(uc.qty, 0) + COALESCE(uc.qty_foil, 0) + COALESCE(uc.qty_enchanted, 0) + COALESCE(uc.qty_epic, 0) + COALESCE(uc.qty_promo, 0) + COALESCE(uc.qty_iconic, 0) + COALESCE(uc.qty_play, 0)) > 0`;
    }
    if (filters.onlyMissing) {
      sql += ` AND (uc.card_id IS NULL OR (COALESCE(uc.qty, 0) + COALESCE(uc.qty_foil, 0) + COALESCE(uc.qty_enchanted, 0) + COALESCE(uc.qty_epic, 0) + COALESCE(uc.qty_promo, 0) + COALESCE(uc.qty_iconic, 0) + COALESCE(uc.qty_play, 0)) = 0)`;
    }

    if (mode === 'list') {
      sql += ` ORDER BY c.name ASC LIMIT ? OFFSET ?`;
      params.push(PAGE_SIZE, page * PAGE_SIZE);
    }

    return { sql, params };
  }, [filters, page, isOnePiece]);

  const { data: cards, isLoading } = useQuery({
    queryKey: ['collection', filters, page, !!db],
    queryFn: async () => {
      if (!db) return [];
      const { sql, params } = buildQuery('list');
      return safeQuery<CardWithDetails>(db, sql, params);
    },
    enabled: isReady && !!db && hasCatalog,
  });

  const { data: totalCount } = useQuery({
    queryKey: ['collection-count', filters, !!db],
    queryFn: async () => {
      if (!db) return 0;
      const { sql, params } = buildQuery('count');
      const result = await safeQuery<{ count: number }>(db, sql, params);
      return result[0]?.count ?? 0;
    },
    enabled: isReady && !!db && hasCatalog,
  });

  const { data: totalCopiesCount } = useQuery({
    queryKey: ['collection-total-copies', filters, !!db],
    queryFn: async () => {
      if (!db) return 0;
      const { sql, params } = buildQuery('totalCopies');
      const result = await safeQuery<{ total_copies: number }>(db, sql, params);
      return result[0]?.total_copies ?? 0;
    },
    enabled: isReady && !!db && hasCatalog && filters.onlyOwned,
  });

  const { data: filterOptions } = useQuery({
    queryKey: ['filter-options', !!db, isOnePiece],
    queryFn: async () => {
      if (!db) return { inks: [], types: [], rarities: [], sets: [], strengths: [], counters: [], lives: [] };
      const inks = await safeQuery<{ ink_color: string }>(db, 'SELECT DISTINCT ink_color FROM cards WHERE ink_color IS NOT NULL ORDER BY ink_color');
      const types = await safeQuery<{ type: string }>(db, 'SELECT DISTINCT type FROM cards WHERE type IS NOT NULL ORDER BY type');
      const rarities = await safeQuery<{ rarity: string }>(db, 'SELECT DISTINCT rarity FROM cards WHERE rarity IS NOT NULL ORDER BY rarity');
      const sets = await safeQuery<{ set_code: string; release_date: string | null }>(
        db,
        `SELECT DISTINCT c.set_code, s.release_date
         FROM cards c LEFT JOIN sets s ON s.set_code = c.set_code
         WHERE c.set_code IS NOT NULL
         ORDER BY COALESCE(s.release_date, '9999') ASC`
      );
      const allTypes = types.map(t => t.type);
      const filteredTypes = isOnePiece
        ? allTypes.filter(t => ONEPIECE_TYPES.includes(t))
        : allTypes;
      const statValues = isOnePiece
        ? await Promise.all([
            safeQuery<{ v: number }>(db, 'SELECT DISTINCT strength as v FROM cards WHERE strength IS NOT NULL ORDER BY strength'),
            safeQuery<{ v: number }>(db, 'SELECT DISTINCT willpower as v FROM cards WHERE willpower IS NOT NULL ORDER BY willpower'),
            safeQuery<{ v: number }>(db, 'SELECT DISTINCT lore as v FROM cards WHERE lore IS NOT NULL ORDER BY lore'),
          ])
        : [[], [], []] as { v: number }[][];
      return {
        inks: sortByOrder(inks.map(i => i.ink_color), INK_ORDER),
        types: sortByOrder(filteredTypes, isOnePiece ? ONEPIECE_TYPES : TYPE_ORDER),
        rarities: sortByOrder(rarities.map(r => r.rarity), RARITY_ORDER),
        sets: sets.map(s => s.set_code),
        strengths: statValues[0].map(r => r.v),
        counters: statValues[1].map(r => r.v),
        lives: statValues[2].map(r => r.v),
      };
    },
    enabled: isReady && !!db && hasCatalog,
  });

  const handleSearch = useCallback((text: string) => {
    setFilters(prev => ({ ...prev, search: text }));
    setPage(0);
  }, []);

  const toggleFilterItem = useCallback((key: keyof CollectionFilters, item: string) => {
    setFilters(prev => {
      const arr = prev[key] as string[];
      const newArr = arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];
      return { ...prev, [key]: newArr };
    });
    setPage(0);
  }, []);

  const toggleStatFilter = useCallback((key: 'strengths' | 'counters' | 'lives', value: number) => {
    setFilters(prev => {
      const arr = prev[key];
      const newArr = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
      return { ...prev, [key]: newArr };
    });
    setPage(0);
  }, []);

  const hasActiveFilters = useMemo(() => {
    return filters.inkColors.length > 0 || filters.cardTypes.length > 0 ||
      filters.rarities.length > 0 || filters.setCodes.length > 0 ||
      (!isOnePiece && filters.variantTypes.length > 0) || filters.onlyOwned || filters.onlyMissing ||
      filters.strengths.length > 0 || filters.counters.length > 0 || filters.lives.length > 0;
  }, [filters, isOnePiece]);

  const handleLoadMore = useCallback(() => {
    if ((cards?.length ?? 0) >= PAGE_SIZE) {
      setPage(prev => prev + 1);
    }
  }, [cards?.length]);

  const renderCard = useCallback(({ item }: { item: CardWithDetails }) => (
    <CardListItem card={item} showQuickAdd={!editLocked} />
  ), [editLocked]);

  const keyExtractor = useCallback((item: CardWithDetails) => item.id.toString(), []);

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!hasCatalog) {
    return (
      <EmptyState
        icon={<Library size={28} color={Colors.textMuted} />}
        title="No Cards Synced"
        message="Go to Settings and sync cards from the API to browse and manage your collection."
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => router.push('/scan-card')}
          testID="scan-card-button"
        >
          <Camera size={18} color={Colors.primary} />
        </TouchableOpacity>
        <View style={styles.searchBox}>
          <Search size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search cards..."
            placeholderTextColor={Colors.textMuted}
            value={filters.search}
            onChangeText={handleSearch}
            testID="collection-search"
          />
          {filters.search.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <X size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, hasActiveFilters && styles.filterBtnActive]}
          onPress={() => setShowFilters(true)}
          testID="filter-button"
        >
          <SlidersHorizontal size={18} color={hasActiveFilters ? Colors.background : Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleChip, filters.onlyOwned && styles.toggleChipActive]}
          onPress={() => {
            setFilters(prev => ({ ...prev, onlyOwned: !prev.onlyOwned, onlyMissing: false }));
            setPage(0);
          }}
        >
          <Text style={[styles.toggleChipText, filters.onlyOwned && styles.toggleChipTextActive]}>Owned</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleChip, filters.onlyMissing && styles.toggleChipActive]}
          onPress={() => {
            setFilters(prev => ({ ...prev, onlyMissing: !prev.onlyMissing, onlyOwned: false }));
            setPage(0);
          }}
        >
          <Text style={[styles.toggleChipText, filters.onlyMissing && styles.toggleChipTextActive]}>Missing</Text>
        </TouchableOpacity>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>
            {filters.onlyOwned
              ? `${totalCount ?? 0} Unique / ${totalCopiesCount ?? 0} Total`
              : `${totalCount ?? 0} cards`
            }
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.lockBtn, !editLocked && styles.lockBtnUnlocked]}
          onPress={() => setEditLocked(prev => !prev)}
          testID="collection-lock-btn"
        >
          {editLocked ? (
            <Lock size={14} color={Colors.textMuted} />
          ) : (
            <Unlock size={14} color={Colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={cards}
        renderItem={renderCard}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <EmptyState
              icon={<Search size={28} color={Colors.textMuted} />}
              title="No Cards Found"
              message="Try adjusting your search or filters."
            />
          )
        }
        testID="collection-list"
      />

      <Modal visible={showFilters} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <X size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <FilterSection
                title="Ink Color"
                items={filterOptions?.inks ?? []}
                selected={filters.inkColors}
                onToggle={(item) => toggleFilterItem('inkColors', item)}
                colorMap={Colors.ink}
              />
              <FilterSection
                title="Card Type"
                items={filterOptions?.types ?? []}
                selected={filters.cardTypes}
                onToggle={(item) => toggleFilterItem('cardTypes', item)}
              />
              <FilterSection
                title="Rarity"
                items={filterOptions?.rarities ?? []}
                selected={filters.rarities}
                onToggle={(item) => toggleFilterItem('rarities', item)}
                colorMap={Colors.rarity}
              />
              {!isOnePiece && (
                <FilterSection
                  title="Variant Type"
                  items={['Classic', 'Foil', 'Epic', 'Enchanted', 'Promo', 'Iconic', 'Play']}
                  selected={filters.variantTypes}
                  onToggle={(item) => toggleFilterItem('variantTypes', item)}
                  colorMap={{
                    Classic: Colors.accent,
                    Foil: Colors.primaryLight,
                    Epic: '#FF6B35',
                    Enchanted: Colors.dangerLight,
                    Promo: '#1ABC9C',
                    Iconic: '#FFD700',
                    Play: Colors.accent,
                  }}
                />
              )}
              {isOnePiece && (
                <>
                  <FilterSection
                    title="Attack"
                    items={(filterOptions?.strengths ?? []).map(String)}
                    selected={filters.strengths.map(String)}
                    onToggle={(item) => toggleStatFilter('strengths', Number(item))}
                  />
                  <FilterSection
                    title="Counter"
                    items={(filterOptions?.counters ?? []).map(String)}
                    selected={filters.counters.map(String)}
                    onToggle={(item) => toggleStatFilter('counters', Number(item))}
                  />
                  <FilterSection
                    title="Life"
                    items={(filterOptions?.lives ?? []).map(String)}
                    selected={filters.lives.map(String)}
                    onToggle={(item) => toggleStatFilter('lives', Number(item))}
                  />
                </>
              )}
              <FilterSection
                title="Set"
                items={filterOptions?.sets ?? []}
                selected={filters.setCodes}
                onToggle={(item) => toggleFilterItem('setCodes', item)}
              />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => {
                  setFilters(prev => ({ ...prev, inkColors: [], cardTypes: [], rarities: [], setCodes: [], variantTypes: [], strengths: [], counters: [], lives: [] }));
                  setPage(0);
                }}
              >
                <Text style={styles.clearBtnText}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={() => setShowFilters(false)}>
                <Text style={styles.applyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FilterSection({ title, items, selected, onToggle, colorMap }: {
  title: string;
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
  colorMap?: Record<string, string>;
}) {
  if (items.length === 0) return null;
  return (
    <View style={filterStyles.section}>
      <Text style={filterStyles.title}>{title}</Text>
      <View style={filterStyles.chips}>
        {items.map((item) => {
          const isSelected = selected.includes(item);
          const itemColor = colorMap?.[item];
          return (
            <TouchableOpacity
              key={item}
              style={[
                filterStyles.chip,
                isSelected && filterStyles.chipActive,
                isSelected && itemColor ? { backgroundColor: itemColor + '30', borderColor: itemColor } : undefined,
              ]}
              onPress={() => onToggle(item)}
            >
              {isSelected && <Check size={12} color={itemColor ?? Colors.primary} />}
              <Text style={[
                filterStyles.chipText,
                isSelected && { color: itemColor ?? Colors.primary },
              ]}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const filterStyles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  title: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surfaceLight,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '20',
  },
  chipText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  searchInput: {
    flex: 1,
    height: 40,
    color: Colors.text,
    fontSize: 15,
  },
  scanBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  filterBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  filterBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  toggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
    alignItems: 'center',
  },
  toggleChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  toggleChipActive: {
    backgroundColor: Colors.primary + '25',
    borderColor: Colors.primary,
  },
  toggleChipText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  toggleChipTextActive: {
    color: Colors.primary,
  },
  countBadge: {
    marginLeft: 'auto',
  },
  countText: {
    fontSize: 12,
    color: Colors.textMuted,
  },

  lockBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  lockBtnUnlocked: {
    backgroundColor: Colors.primary + '15',
    borderColor: Colors.primary + '40',
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  modalScroll: {
    padding: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  clearBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  clearBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  applyBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  applyBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.background,
  },
});
