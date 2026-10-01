import React, { useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Layers, Sparkles } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { useTCG } from '@/providers/TCGProvider';
import { safeQuery } from '@/utils/database';
import { getStarterDecks } from '@/constants/starterDecks';
import {
  fetchOfficialDeck, getOfficialCardLookup,
} from '@/utils/lorcana-official-decks-api';
import CardImage from '@/components/CardImage';
import EmptyState from '@/components/EmptyState';

interface DeckCardRow {
  id: number;
  name: string;
  cost: number | null;
  type: string | null;
  rarity: string | null;
  ink_color: string | null;
  card_number: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  qty?: number;
}

export default function StarterDeckContentsScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const router = useRouter();
  const { db, isReady, hasCatalog } = useDatabase();
  const { tcg } = useTCG();

  const meta = getStarterDecks(tcg).find(d => d.id === deckId || d.setCode === (deckId ?? '').toUpperCase());
  const isOnePiece = tcg === 'onepiece';

  if (isOnePiece) {
    return <OnePieceStarterDeckView deckId={deckId ?? ''} meta={meta} db={db} ready={isReady && hasCatalog} router={router} />;
  }
  return <LorcanaStarterDeckView deckId={deckId ?? ''} meta={meta} db={db} ready={isReady && hasCatalog} router={router} />;
}

// ---------- One Piece ----------

function OnePieceStarterDeckView({ deckId, meta, db, ready, router }: {
  deckId: string;
  meta: ReturnType<typeof getStarterDecks>[number] | undefined;
  db: ReturnType<typeof useDatabase>['db'];
  ready: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const setCode = (meta?.setCode ?? deckId).toUpperCase();
  const title = meta ? `${meta.set} ${meta.setNumber}: ${meta.name}` : setCode;

  const { data: cards, isLoading } = useQuery({
    queryKey: ['starter-deck-cards', setCode, !!db],
    queryFn: async () => {
      if (!db || !setCode) return [];
      return safeQuery<DeckCardRow>(
        db,
        `SELECT c.id, c.name, c.cost, c.type, c.rarity, c.ink_color, c.card_number,
                i.image_url, i.thumbnail_url
         FROM cards c
         LEFT JOIN images i ON i.card_id = c.id
         WHERE c.set_code = ?
         ORDER BY
           CASE WHEN c.type = 'Leader' THEN 0 ELSE 1 END,
           COALESCE(c.cost, 0) ASC,
           c.card_number ASC`,
        [setCode]
      );
    },
    enabled: ready && !!db && !!setCode,
  });

  const total = cards?.length ?? 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: meta?.name ?? setCode }} />
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <Text style={styles.subtitle}>
          {total} unique card{total === 1 ? '' : 's'}
          {meta?.inkProfile ? `  •  ${meta.inkProfile}` : ''}
        </Text>
      </View>
      <FlatList
        data={cards ?? []}
        renderItem={({ item }) => <CardRow item={item} onPress={() => router.push(`/card/${item.id}`)} />}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <EmptyState
              icon={<Layers size={28} color={Colors.textMuted} />}
              title="No cards found"
              message="Sync the catalog from Settings to load this starter deck."
            />
          )
        }
      />
    </View>
  );
}

// ---------- Lorcana ----------

/**
 * Loads the deck directly from lorcanajson.org (the only source with an
 * official starter / gateway / quest deck index). Cards are mapped through
 * lorcanajson's global id -> our local `(set_code, card_number)` catalog.
 * Unmappable cards (e.g. sets we haven't synced yet) are shown as stubs.
 */
function LorcanaStarterDeckView({ deckId, meta, db, ready, router }: {
  deckId: string;
  meta: ReturnType<typeof getStarterDecks>[number] | undefined;
  db: ReturnType<typeof useDatabase>['db'];
  ready: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const officialId = meta?.officialDeckId ?? deckId;
  const title = meta ? `${meta.set}: ${meta.name}` : deckId;
  const typeLabel = meta?.deckType ?? 'Starter Deck';

  const { data: deck, isLoading: deckLoading, error: deckError } = useQuery({
    queryKey: ['lorcana-official-deck', officialId],
    queryFn: () => fetchOfficialDeck(officialId),
    staleTime: 1000 * 60 * 60 * 24,
    enabled: !!officialId,
  });

  const { data: lookup, isLoading: lookupLoading } = useQuery({
    queryKey: ['lorcana-official-cards-lookup'],
    queryFn: getOfficialCardLookup,
    staleTime: 1000 * 60 * 60 * 12,
    gcTime: 1000 * 60 * 60 * 24,
  });

  const { data: resolved } = useQuery({
    queryKey: ['lorcana-official-deck-resolved', officialId, !!db, !!lookup, deck?.cards.length ?? 0],
    queryFn: async (): Promise<DeckCardRow[]> => {
      if (!db || !deck || !lookup) return [];
      const rows: DeckCardRow[] = [];
      for (const ref of deck.cards) {
        const lk = lookup.get(ref.id);
        if (!lk) {
          // Card belongs to a set we haven't synced (e.g. Winterspell, Quest Q2).
          rows.push({
            id: -ref.id,
            name: `Card #${ref.id}`,
            cost: null, type: null, rarity: null, ink_color: null,
            card_number: null, image_url: null, thumbnail_url: null,
            qty: ref.amount,
          });
          continue;
        }
        const found = await safeQuery<DeckCardRow>(
          db,
          `SELECT c.id, c.name, c.cost, c.type, c.rarity, c.ink_color, c.card_number,
                  i.image_url, i.thumbnail_url
           FROM cards c
           LEFT JOIN images i ON i.card_id = c.id
           WHERE c.set_code = ? AND c.card_number = ?
           LIMIT 1`,
          [lk.setCode, lk.cardNumber]
        );
        const r = found[0];
        if (r) {
          rows.push({ ...r, qty: ref.amount });
        } else {
          rows.push({
            id: -ref.id,
            name: lk.name ?? `Card #${ref.id}`,
            cost: null, type: null, rarity: lk.rarity ?? null, ink_color: null,
            card_number: lk.cardNumber, image_url: null, thumbnail_url: null,
            qty: ref.amount,
          });
        }
      }
      rows.sort((a, b) => {
        const at = a.type === 'Location' ? 2 : a.type === 'Item' ? 1 : 0;
        const bt = b.type === 'Location' ? 2 : b.type === 'Item' ? 1 : 0;
        if (at !== bt) return at - bt;
        return (a.cost ?? 0) - (b.cost ?? 0);
      });
      return rows;
    },
    enabled: ready && !!db && !!deck && !!lookup,
  });

  const total = useMemo(() => deck?.cards.reduce((s, c) => s + c.amount, 0) ?? 0, [deck]);
  const unique = deck?.cards.length ?? 0;
  const isLoading = deckLoading || lookupLoading;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: meta?.name ?? officialId }} />
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <Text style={styles.subtitle}>
          {unique > 0
            ? `${unique} unique • ${total} total${meta?.inkProfile ? `  •  ${meta.inkProfile}` : ''}`
            : meta?.inkProfile ?? ''}
        </Text>
        <View style={styles.tagRow}>
          <View style={styles.tag}>
            <Sparkles size={10} color={Colors.primary} />
            <Text style={styles.tagText}>{typeLabel}</Text>
          </View>
          <Text style={styles.sourceNote} numberOfLines={1}>
            Source: lorcanajson.org · {officialId}
          </Text>
        </View>
      </View>

      <FlatList
        data={resolved ?? []}
        renderItem={({ item }) => (
          <CardRow
            item={item}
            onPress={() => { if (item.id > 0) router.push(`/card/${item.id}`); }}
            qty={item.qty}
          />
        )}
        keyExtractor={(item, idx) => `${item.id}-${idx}`}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : deckError ? (
            <EmptyState
              icon={<Layers size={28} color={Colors.textMuted} />}
              title="Couldn't reach lorcanajson.org"
              message={(deckError as Error).message}
            />
          ) : (
            <EmptyState
              icon={<Layers size={28} color={Colors.textMuted} />}
              title="No cards"
              message="This deck has no card data."
            />
          )
        }
      />
    </View>
  );
}

// ---------- Shared ----------

function CardRow({ item, onPress, qty }: { item: DeckCardRow; onPress: () => void; qty?: number }) {
  const rarityColor = Colors.rarity[item.rarity ?? ''] ?? Colors.textSecondary;
  const inkColor = Colors.ink[item.ink_color ?? ''] ?? Colors.textMuted;
  return (
    <TouchableOpacity style={styles.cardRow} onPress={onPress} activeOpacity={0.7}>
      <CardImage cardId={item.id} imageUrl={item.image_url} thumbnailUrl={item.thumbnail_url} size="small" />
      <View style={styles.info}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.dot, { backgroundColor: inkColor }]} />
          {item.cost !== null && <Text style={styles.cost}>{item.cost}</Text>}
          {item.type ? <Text style={styles.type}>{item.type}</Text> : null}
          {item.rarity ? (
            <Text style={[styles.rarity, { color: rarityColor }]}>{item.rarity}</Text>
          ) : null}
        </View>
        {item.card_number ? (
          <Text style={styles.cardNumber}>{item.card_number}</Text>
        ) : null}
      </View>
      {qty !== undefined ? (
        <View style={styles.qtyBadge}>
          <Text style={styles.qtyText}>×{qty}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  sourceNote: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: 'italic' as const,
    flex: 1,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: Colors.primary + '20',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  variantsRow: {
    paddingBottom: 8,
  },
  variantChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    maxWidth: 220,
    gap: 3,
  },
  variantChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '15',
  },
  variantChipText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  variantChipTextActive: {
    color: Colors.primary,
  },
  variantChipStats: {
    flexDirection: 'row',
    gap: 6,
  },
  variantChipMeta: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cost: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  type: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  rarity: {
    fontSize: 11,
    fontWeight: '700' as const,
    marginLeft: 'auto' as const,
  },
  cardNumber: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  qtyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.primary + '25',
  },
  qtyText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  searchBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
});
