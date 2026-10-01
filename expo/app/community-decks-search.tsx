import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Search, X, ChevronRight, TrendingUp, Eye, Heart, Layers } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { fetchAllDecks, fetchTrendingDecks, type LorcanaDeckSummary } from '@/utils/lorcana-decks-api';
import EmptyState from '@/components/EmptyState';

type SortMode = 'trending' | 'views' | 'likes' | 'recent';

export default function CommunityDecksSearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const router = useRouter();
  const initialQ = (params.q ?? '').toString();
  const [query, setQuery] = useState<string>(initialQ);
  const [debounced, setDebounced] = useState<string>(initialQ);
  const [sort, setSort] = useState<SortMode>('trending');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const hasQuery = debounced.length >= 1;

  const { data: trending } = useQuery({
    queryKey: ['lorcana-trending-decks'],
    queryFn: fetchTrendingDecks,
    staleTime: 1000 * 60 * 30,
  });

  const { data: all, isLoading: allLoading } = useQuery({
    queryKey: ['lorcana-all-decks'],
    queryFn: fetchAllDecks,
    enabled: hasQuery,
    staleTime: 1000 * 60 * 60 * 6,
    gcTime: 1000 * 60 * 60 * 6,
  });

  const results = useMemo<LorcanaDeckSummary[]>(() => {
    const source = hasQuery ? (all ?? []) : (trending ?? []);
    const q = debounced.toLowerCase();
    const filtered = hasQuery
      ? source.filter((d) => {
          const name = (d.name ?? '').toLowerCase();
          const creator = (d.creator_name ?? '').toLowerCase();
          return name.includes(q) || creator.includes(q);
        })
      : source;
    const sorted = [...filtered].sort((a, b) => {
      switch (sort) {
        case 'views':
          return (b.views ?? 0) - (a.views ?? 0);
        case 'likes':
          return (b.likes ?? 0) - (a.likes ?? 0);
        case 'recent':
          return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
        case 'trending':
        default:
          return (b.likes ?? 0) + (b.views ?? 0) / 100 - ((a.likes ?? 0) + (a.views ?? 0) / 100);
      }
    });
    return sorted.slice(0, hasQuery ? 200 : 100);
  }, [hasQuery, all, trending, debounced, sort]);

  const renderItem = ({ item }: { item: LorcanaDeckSummary }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/community-deck/${item.uuid}`)}
      activeOpacity={0.7}
    >
      <View style={styles.icon}>
        <TrendingUp size={14} color={Colors.primary} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.creator} numberOfLines={1}>
            {item.creator_name ?? 'Unknown'} • {item.cardsCount}
          </Text>
          {item.views !== undefined ? (
            <View style={styles.metaChip}>
              <Eye size={9} color={Colors.textMuted} />
              <Text style={styles.metaText}>{item.views}</Text>
            </View>
          ) : null}
          {item.likes !== undefined ? (
            <View style={styles.metaChip}>
              <Heart size={9} color={Colors.textMuted} />
              <Text style={styles.metaText}>{item.likes}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <ChevronRight size={14} color={Colors.textMuted} />
    </TouchableOpacity>
  );

  const sortOptions: { id: SortMode; label: string }[] = [
    { id: 'trending', label: 'Trending' },
    { id: 'likes', label: 'Likes' },
    { id: 'views', label: 'Views' },
    { id: 'recent', label: 'Recent' },
  ];

  const loading = hasQuery && allLoading && !all;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Community Decks' }} />

      <View style={styles.searchWrap}>
        <Search size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search decks by name or creator…"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.sortRow}>
        {sortOptions.map((opt) => {
          const active = sort === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.sortChip, active && styles.sortChipActive]}
              onPress={() => setSort(opt.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.sortText, active && styles.sortTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.hint}>
        {hasQuery
          ? `${results.length} result${results.length === 1 ? '' : 's'} for "${debounced}"`
          : `Top ${results.length} trending`}
      </Text>

      <FlatList
        data={results}
        renderItem={renderItem}
        keyExtractor={(item) => item.uuid}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <EmptyState
              icon={<Layers size={26} color={Colors.textMuted} />}
              title={hasQuery ? 'No decks found' : 'No decks'}
              message={hasQuery ? 'Try a different name or creator.' : 'Pull trending decks first.'}
            />
          )
        }
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  searchInput: {
    flex: 1, color: Colors.text, fontSize: 14,
    paddingVertical: 0,
  },
  sortRow: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: 16, paddingTop: 10,
  },
  sortChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  sortChipActive: {
    backgroundColor: Colors.primary + '25',
    borderColor: Colors.primary,
  },
  sortText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' as const },
  sortTextActive: { color: Colors.primary },
  hint: {
    fontSize: 11, color: Colors.textMuted,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4,
  },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: Colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  icon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '600' as const, color: Colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  creator: { fontSize: 11, color: Colors.textMuted, flexShrink: 1 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  metaText: { fontSize: 11, color: Colors.textMuted },
});
