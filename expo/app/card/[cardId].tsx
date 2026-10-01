import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Linking,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, HeartOff, Layers, Tag, ChevronDown, ChevronUp, Droplets, DropletOff, MoreHorizontal, ExternalLink, TrendingUp, TrendingDown, BarChart3, DollarSign, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { useTCG } from '@/providers/TCGProvider';
import { safeQueryFirst, safeQuery, safeRun } from '@/utils/database';
import { fetchAndCacheCardmarketPrice, hasCardmarketCredentials, type CardmarketPriceData } from '@/utils/cardmarket';
import { fetchAndCacheDotggPrice, type DotggPriceData } from '@/utils/dotgg';
import CardImage from '@/components/CardImage';
import QuantityControl from '@/components/QuantityControl';
import InkBadge from '@/components/InkBadge';
import type { CardWithDetails, CardAbility, CardSubtype, WishlistItem, Deck } from '@/types/database';

export default function CardDetailScreen() {
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { db } = useDatabase();
  const { tcg } = useTCG();
  const isOnePiece = tcg === 'onepiece';
  const [showNote, setShowNote] = useState<boolean>(false);
  const [noteText, setNoteText] = useState<string>('');
  const [showDeckPicker, setShowDeckPicker] = useState<boolean>(false);
  const [showMoreTypes, setShowMoreTypes] = useState<boolean>(false);

  const cardIdNum = parseInt(cardId ?? '0', 10);

  const { data: card, isLoading } = useQuery({
    queryKey: ['card-detail', cardIdNum, !!db],
    queryFn: async () => {
      if (!db) return null;
      return safeQueryFirst<CardWithDetails>(
        db,
        `SELECT c.*, COALESCE(uc.qty, 0) as qty, COALESCE(uc.qty_foil, 0) as qty_foil,
                COALESCE(uc.qty_enchanted, 0) as qty_enchanted,
                COALESCE(uc.qty_epic, 0) as qty_epic, COALESCE(uc.qty_promo, 0) as qty_promo,
                COALESCE(uc.qty_iconic, 0) as qty_iconic, COALESCE(uc.qty_play, 0) as qty_play,
                i.image_url, i.thumbnail_url, s.name as set_name, s.release_date,
                COALESCE(uc.qty, 0) + COALESCE(uc.qty_foil, 0) + COALESCE(uc.qty_enchanted, 0)
                + COALESCE(uc.qty_epic, 0) + COALESCE(uc.qty_promo, 0)
                + COALESCE(uc.qty_iconic, 0) + COALESCE(uc.qty_play, 0) as total_owned,
                uc.condition, uc.language, uc.note
         FROM cards c
         LEFT JOIN user_collection uc ON uc.card_id = c.id
         LEFT JOIN images i ON i.card_id = c.id
         LEFT JOIN sets s ON s.set_code = c.set_code
         WHERE c.id = ?`,
        [cardIdNum]
      );
    },
    enabled: !!db && cardIdNum > 0,
  });

  const { data: abilities } = useQuery({
    queryKey: ['card-abilities', cardIdNum, !!db],
    queryFn: async () => {
      if (!db) return [];
      return safeQuery<CardAbility>(db, 'SELECT * FROM abilities WHERE card_id = ?', [cardIdNum]);
    },
    enabled: !!db && cardIdNum > 0,
  });

  const { data: subtypes } = useQuery({
    queryKey: ['card-subtypes', cardIdNum, !!db],
    queryFn: async () => {
      if (!db) return [];
      return safeQuery<CardSubtype>(db, 'SELECT * FROM subtypes WHERE card_id = ?', [cardIdNum]);
    },
    enabled: !!db && cardIdNum > 0,
  });

  const { data: otherPrintings } = useQuery({
    queryKey: ['card-printings', card?.card_number, cardIdNum, !!db],
    queryFn: async () => {
      if (!db || !card?.card_number) return [];
      return safeQuery<CardWithDetails>(
        db,
        `SELECT c.*, COALESCE(uc.qty, 0) as qty, COALESCE(uc.qty_foil, 0) as qty_foil,
                COALESCE(uc.qty_enchanted, 0) as qty_enchanted, COALESCE(uc.qty_epic, 0) as qty_epic,
                COALESCE(uc.qty_promo, 0) as qty_promo, COALESCE(uc.qty_iconic, 0) as qty_iconic,
                COALESCE(uc.qty_play, 0) as qty_play, i.image_url, i.thumbnail_url,
                s.name as set_name, s.release_date,
                COALESCE(uc.qty, 0) + COALESCE(uc.qty_foil, 0) + COALESCE(uc.qty_enchanted, 0)
                + COALESCE(uc.qty_epic, 0) + COALESCE(uc.qty_promo, 0)
                + COALESCE(uc.qty_iconic, 0) + COALESCE(uc.qty_play, 0) as total_owned
         FROM cards c
         LEFT JOIN user_collection uc ON uc.card_id = c.id
         LEFT JOIN images i ON i.card_id = c.id
         LEFT JOIN sets s ON s.set_code = c.set_code
         WHERE c.card_number = ? AND c.id <> ?
         ORDER BY c.id`,
        [card.card_number, cardIdNum]
      );
    },
    enabled: !!db && !!card?.card_number,
  });

  const { data: wishlistItem } = useQuery({
    queryKey: ['wishlist-item', cardIdNum, !!db],
    queryFn: async () => {
      if (!db) return null;
      return safeQueryFirst<WishlistItem>(db, 'SELECT * FROM wishlist WHERE card_id = ?', [cardIdNum]);
    },
    enabled: !!db && cardIdNum > 0,
  });

  const showCardmarket = hasCardmarketCredentials();

  const { data: cmPrices, isLoading: cmLoading } = useQuery({
    queryKey: ['cardmarket-price', cardIdNum, card?.name],
    queryFn: async (): Promise<CardmarketPriceData | null> => {
      if (!db || !card) return null;
      return fetchAndCacheCardmarketPrice(db, cardIdNum, card.name, card.set_name);
    },
    enabled: !!db && !!card && showCardmarket,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const { data: dotggPrices, isLoading: dotggLoading } = useQuery({
    queryKey: ['dotgg-price', cardIdNum, card?.set_name, card?.card_number, tcg],
    queryFn: async (): Promise<DotggPriceData | null> => {
      if (!db || !card) return null;
      return fetchAndCacheDotggPrice(db, cardIdNum, card.set_name, card.card_number, tcg);
    },
    enabled: !!db && !!card,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const { data: decks } = useQuery({
    queryKey: ['decks-list', !!db],
    queryFn: async () => {
      if (!db) return [];
      return safeQuery<Deck>(db, 'SELECT * FROM decks ORDER BY name');
    },
    enabled: !!db && showDeckPicker,
  });

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['card-detail', cardIdNum] });
    void queryClient.invalidateQueries({ queryKey: ['collection'] });
    void queryClient.invalidateQueries({ queryKey: ['collection-count'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-ink-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-set-progress'] });
  }, [queryClient, cardIdNum]);

  type QtyField = 'qty' | 'qty_foil' | 'qty_enchanted' | 'qty_epic' | 'qty_promo' | 'qty_iconic' | 'qty_play';
  const updateQty = useMutation({
    mutationFn: async ({ field, delta }: { field: QtyField; delta: number }) => {
      if (!db) return;
      await safeRun(
        db,
        `INSERT INTO user_collection (card_id, ${field}, updated_at)
         VALUES (?, MAX(0, ?), datetime('now'))
         ON CONFLICT(card_id) DO UPDATE SET
         ${field} = MAX(0, ${field} + ?),
         updated_at = datetime('now')`,
        [cardIdNum, Math.max(0, delta), delta]
      );
    },
    onSuccess: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      invalidateAll();
    },
  });

  const toggleWishlist = useMutation({
    mutationFn: async () => {
      if (!db) return;
      if (wishlistItem) {
        await safeRun(db, 'DELETE FROM wishlist WHERE card_id = ?', [cardIdNum]);
      } else {
        await safeRun(db, 'INSERT OR IGNORE INTO wishlist (card_id, target_qty, priority) VALUES (?, 1, 2)', [cardIdNum]);
      }
    },
    onSuccess: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      void queryClient.invalidateQueries({ queryKey: ['wishlist-item', cardIdNum] });
      void queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    },
  });

  const addToDeck = useMutation({
    mutationFn: async (deckId: number) => {
      if (!db) return;
      await safeRun(
        db,
        `INSERT INTO deck_cards (deck_id, card_id, qty, is_sideboard) VALUES (?, ?, 1, 0)
         ON CONFLICT(deck_id, card_id, is_sideboard) DO UPDATE SET qty = qty + 1`,
        [deckId, cardIdNum]
      );
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDeckPicker(false);
      void queryClient.invalidateQueries({ queryKey: ['deck-cards'] });
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
    },
  });

  const saveNote = useMutation({
    mutationFn: async () => {
      if (!db) return;
      await safeRun(
        db,
        `INSERT INTO user_collection (card_id, note, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(card_id) DO UPDATE SET note = ?, updated_at = datetime('now')`,
        [cardIdNum, noteText, noteText]
      );
    },
    onSuccess: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      invalidateAll();
      setShowNote(false);
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!card) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>Card not found</Text>
      </View>
    );
  }

  const cardNote = card.note ?? null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Stack.Screen options={{ title: card.name }} />

      <View style={styles.imageContainer}>
        <CardImage
          cardId={card.id}
          imageUrl={card.image_url}
          thumbnailUrl={card.thumbnail_url}
          size="large"
        />
      </View>

      <View style={styles.titleSection}>
        <Text style={styles.name}>{card.name}</Text>
        {card.version && <Text style={styles.version}>{card.version}</Text>}
        {card.card_number && (
          <Text style={styles.cardNumberText}>#{card.card_number} · {card.set_code ?? ''}</Text>
        )}
      </View>

      <View style={styles.metaRow}>
        {card.ink_color && <InkBadge inkColor={card.ink_color} size="medium" />}
        {card.cost !== null && (
          <View style={styles.costCircle}>
            <Text style={styles.costCircleText}>{card.cost}</Text>
          </View>
        )}
        {card.rarity && (
          <Text style={[styles.rarityLabel, { color: Colors.rarity[card.rarity] ?? Colors.textSecondary }]}>
            {card.rarity}
          </Text>
        )}
        {card.type && <Text style={styles.typeLabel}>{card.type}</Text>}
      </View>

      {(subtypes?.length ?? 0) > 0 && (
        <Text style={styles.subtypes}>
          {subtypes?.map(s => s.subtype).join(' / ')}
        </Text>
      )}

      <View style={styles.statsRow}>
        {card.cost != null && (
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: Colors.primary }]}>{card.cost}</Text>
            <Text style={styles.statLabel}>COST</Text>
          </View>
        )}
        {card.strength != null && card.strength !== 0 && (
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{card.strength}</Text>
            <Text style={styles.statLabel}>ATK</Text>
          </View>
        )}
        {card.willpower != null && card.willpower !== 0 && (
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{card.willpower}</Text>
            <Text style={styles.statLabel}>{isOnePiece ? 'COUNTER' : 'HP'}</Text>
          </View>
        )}
        {card.lore != null && (
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: Colors.accent }]}>{card.lore}</Text>
            <Text style={styles.statLabel}>{isOnePiece ? 'LIFE' : 'LORE'}</Text>
          </View>
        )}
      </View>

      {!isOnePiece && (
      <View style={styles.inkableRow}>
        {card.inkable === 1 ? (
          <>
            <Droplets size={18} color={Colors.accent} />
            <Text style={[styles.inkableText, { color: Colors.accent }]}>Inkable</Text>
          </>
        ) : (
          <>
            <DropletOff size={18} color={Colors.textMuted} />
            <Text style={[styles.inkableText, { color: Colors.textMuted }]}>Not Inkable</Text>
          </>
        )}
      </View>
      )}

      {card.body_text && (
        <View style={styles.textCard}>
          <Text style={styles.bodyText}>{card.body_text}</Text>
        </View>
      )}

      {(abilities?.length ?? 0) > 0 && (
        <View style={styles.textCard}>
          <Text style={styles.cardSectionTitle}>Abilities</Text>
          {abilities?.map((a, i) => (
            <View key={i} style={styles.abilityItem}>
              {a.ability_name && <Text style={styles.abilityName}>{a.ability_name}</Text>}
              {a.ability_text && <Text style={styles.abilityText}>{a.ability_text}</Text>}
            </View>
          ))}
        </View>
      )}

      {card.flavor_text && (
        <View style={styles.textCard}>
          <Text style={styles.flavorText}>{card.flavor_text}</Text>
        </View>
      )}

      {card.set_name && (
        <View style={styles.setInfo}>
          <Text style={styles.setLabel}>Set</Text>
          <Text style={styles.setName}>{card.set_name} ({card.set_code})</Text>
          {card.release_date && <Text style={styles.setDate}>{card.release_date}</Text>}
        </View>
      )}

      {(otherPrintings?.length ?? 0) > 0 && (
        <View style={styles.printingsSection}>
          <Text style={styles.sectionTitle}>Other Printings / Arts</Text>
          <Text style={styles.printingsHint}>Same card, different printing or artwork.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.printingsRow}>
            {otherPrintings?.map(printing => (
              <TouchableOpacity
                key={printing.id}
                style={styles.printingCard}
                onPress={() => router.replace(`/card/${printing.id}`)}
              >
                <CardImage
                  cardId={printing.id}
                  imageUrl={printing.image_url}
                  thumbnailUrl={printing.thumbnail_url}
                  size="medium"
                />
                <Text style={styles.printingLabel} numberOfLines={1}>{printing.version || printing.rarity || 'Alternate'}</Text>
                {(printing.total_owned ?? 0) > 0 && (
                  <Text style={styles.printingOwned}>Owned: {printing.total_owned}</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.collectionSection}>
        <Text style={styles.sectionTitle}>Collection</Text>
        <View style={styles.qtyRow}>
          <QuantityControl
            label="Classic"
            value={card.qty}
            onIncrement={() => updateQty.mutate({ field: 'qty', delta: 1 })}
            onDecrement={() => updateQty.mutate({ field: 'qty', delta: -1 })}
            color={Colors.accent}
          />
          <QuantityControl
            label="Foil"
            value={card.qty_foil}
            onIncrement={() => updateQty.mutate({ field: 'qty_foil', delta: 1 })}
            onDecrement={() => updateQty.mutate({ field: 'qty_foil', delta: -1 })}
            color={Colors.primaryLight}
          />
        </View>

        <TouchableOpacity
          style={styles.moreToggle}
          onPress={() => setShowMoreTypes(!showMoreTypes)}
        >
          <MoreHorizontal size={16} color={Colors.textSecondary} />
          <Text style={styles.moreToggleText}>More variants</Text>
          {showMoreTypes ? <ChevronUp size={14} color={Colors.textMuted} /> : <ChevronDown size={14} color={Colors.textMuted} />}
        </TouchableOpacity>

        {showMoreTypes && (
          <View style={styles.moreTypesGrid}>
            <View style={styles.qtyRow}>
              <QuantityControl
                label="Epic"
                value={card.qty_epic}
                onIncrement={() => updateQty.mutate({ field: 'qty_epic', delta: 1 })}
                onDecrement={() => updateQty.mutate({ field: 'qty_epic', delta: -1 })}
                color={Colors.rarity.Epic ?? '#FF6B35'}
              />
              <QuantityControl
                label="Enchanted"
                value={card.qty_enchanted}
                onIncrement={() => updateQty.mutate({ field: 'qty_enchanted', delta: 1 })}
                onDecrement={() => updateQty.mutate({ field: 'qty_enchanted', delta: -1 })}
                color={Colors.dangerLight}
              />
            </View>
            <View style={styles.qtyRow}>
              <QuantityControl
                label="Promo"
                value={card.qty_promo}
                onIncrement={() => updateQty.mutate({ field: 'qty_promo', delta: 1 })}
                onDecrement={() => updateQty.mutate({ field: 'qty_promo', delta: -1 })}
                color={Colors.rarity.Promo ?? '#1ABC9C'}
              />
              <QuantityControl
                label="Iconic"
                value={card.qty_iconic}
                onIncrement={() => updateQty.mutate({ field: 'qty_iconic', delta: 1 })}
                onDecrement={() => updateQty.mutate({ field: 'qty_iconic', delta: -1 })}
                color={Colors.rarity.Iconic ?? '#FFD700'}
              />
            </View>
            <View style={styles.qtyRowCenter}>
              <QuantityControl
                label="Play"
                value={card.qty_play}
                onIncrement={() => updateQty.mutate({ field: 'qty_play', delta: 1 })}
                onDecrement={() => updateQty.mutate({ field: 'qty_play', delta: -1 })}
                color={Colors.accent}
              />
            </View>
          </View>
        )}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, wishlistItem && styles.actionBtnActive]}
          onPress={() => toggleWishlist.mutate()}
        >
          {wishlistItem ? (
            <HeartOff size={18} color={Colors.danger} />
          ) : (
            <Heart size={18} color={Colors.text} />
          )}
          <Text style={[styles.actionBtnText, wishlistItem && { color: Colors.danger }]}>
            {wishlistItem ? 'Remove Wishlist' : 'Add to Wishlist'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setShowDeckPicker(!showDeckPicker)}
        >
          <Layers size={18} color={Colors.text} />
          <Text style={styles.actionBtnText}>Add to Deck</Text>
        </TouchableOpacity>
      </View>

      {showDeckPicker && (
        <View style={styles.deckPicker}>
          {(decks?.length ?? 0) === 0 ? (
            <Text style={styles.noDeckText}>No decks yet. Create one first.</Text>
          ) : (
            decks?.map(d => (
              <TouchableOpacity
                key={d.id}
                style={styles.deckPickerItem}
                onPress={() => addToDeck.mutate(d.id)}
              >
                <Text style={styles.deckPickerName}>{d.name}</Text>
                <Text style={styles.deckPickerFormat}>{d.format ?? 'No format'}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      <TouchableOpacity
        style={styles.noteToggle}
        onPress={() => {
          setNoteText(cardNote ?? '');
          setShowNote(!showNote);
        }}
      >
        <Tag size={16} color={Colors.textSecondary} />
        <Text style={styles.noteToggleText}>
          {cardNote ? 'Edit Note' : 'Add Note'}
        </Text>
        {showNote ? <ChevronUp size={16} color={Colors.textMuted} /> : <ChevronDown size={16} color={Colors.textMuted} />}
      </TouchableOpacity>

      {showNote && (
        <View style={styles.noteBox}>
          <TextInput
            style={styles.noteInput}
            value={noteText}
            onChangeText={setNoteText}
            placeholder="Write a note..."
            placeholderTextColor={Colors.textMuted}
            multiline
            testID="card-note-input"
          />
          <TouchableOpacity style={styles.saveNoteBtn} onPress={() => saveNote.mutate()}>
            <Text style={styles.saveNoteBtnText}>Save Note</Text>
          </TouchableOpacity>
        </View>
      )}

      {showCardmarket && (
        <View style={styles.cmSection}>
          <View style={styles.cmHeader}>
            <Text style={styles.cmTitle}>Cardmarket</Text>
            {cmLoading && <ActivityIndicator size="small" color={Colors.primary} />}
          </View>
          {cmPrices ? (
            <>
              <View style={styles.cmPriceGrid}>
                <View style={styles.cmPriceItem}>
                  <View style={styles.cmPriceIconRow}>
                    <BarChart3 size={14} color={Colors.accent} />
                    <Text style={styles.cmPriceLabel}>AVG</Text>
                  </View>
                  <Text style={styles.cmPriceValue}>
                    {cmPrices.avgPrice != null ? `€${cmPrices.avgPrice.toFixed(2)}` : '—'}
                  </Text>
                </View>
                <View style={styles.cmPriceItem}>
                  <View style={styles.cmPriceIconRow}>
                    <TrendingUp size={14} color={Colors.primaryLight} />
                    <Text style={styles.cmPriceLabel}>Trend</Text>
                  </View>
                  <Text style={styles.cmPriceValue}>
                    {cmPrices.trendPrice != null ? `€${cmPrices.trendPrice.toFixed(2)}` : '—'}
                  </Text>
                </View>
                <View style={styles.cmPriceItem}>
                  <View style={styles.cmPriceIconRow}>
                    <TrendingDown size={14} color={Colors.success} />
                    <Text style={styles.cmPriceLabel}>Lowest</Text>
                  </View>
                  <Text style={styles.cmPriceValue}>
                    {cmPrices.lowPrice != null ? `€${cmPrices.lowPrice.toFixed(2)}` : '—'}
                  </Text>
                </View>
              </View>
              {cmPrices.websiteUrl && (
                <TouchableOpacity
                  style={styles.cmLinkBtn}
                  onPress={() => {
                    if (cmPrices.websiteUrl) {
                      void Linking.openURL(cmPrices.websiteUrl);
                    }
                  }}
                  testID="cardmarket-link"
                >
                  <ExternalLink size={16} color={Colors.primary} />
                  <Text style={styles.cmLinkText}>Open on Cardmarket</Text>
                </TouchableOpacity>
              )}
            </>
          ) : !cmLoading ? (
            <Text style={styles.cmNoData}>Price data not available</Text>
          ) : null}
        </View>
      )}

      <View style={styles.dgSection}>
        <View style={styles.dgHeader}>
          <View style={styles.dgTitleRow}>
            <DollarSign size={16} color={Colors.accent} />
            <Text style={styles.dgTitle}>Market Prices</Text>
          </View>
          {dotggLoading && <ActivityIndicator size="small" color={Colors.accent} />}
          {dotggPrices?.priceDate && (
            <Text style={styles.dgDateText}>{dotggPrices.priceDate}</Text>
          )}
        </View>
        {dotggPrices ? (
          <>
            {(dotggPrices.normalPrice != null || dotggPrices.foilPrice != null || dotggPrices.coldFoilPrice != null) && (
              <View style={styles.dgMarketBlock}>
                <Text style={styles.dgMarketLabel}>TCGPlayer</Text>
                <View style={styles.dgPriceGrid}>
                  {dotggPrices.normalPrice != null && (
                    <View style={styles.dgPriceItem}>
                      <Text style={styles.dgPriceType}>Normal</Text>
                      <Text style={styles.dgPriceValue}>${dotggPrices.normalPrice.toFixed(2)}</Text>
                    </View>
                  )}
                  {dotggPrices.foilPrice != null && (
                    <View style={styles.dgPriceItem}>
                      <View style={styles.dgFoilRow}>
                        <Sparkles size={10} color={Colors.primaryLight} />
                        <Text style={styles.dgPriceType}>Foil</Text>
                      </View>
                      <Text style={styles.dgPriceValue}>${dotggPrices.foilPrice.toFixed(2)}</Text>
                    </View>
                  )}
                  {dotggPrices.coldFoilPrice != null && (
                    <View style={styles.dgPriceItem}>
                      <View style={styles.dgFoilRow}>
                        <Sparkles size={10} color={Colors.accentLight} />
                        <Text style={styles.dgPriceType}>Cold Foil</Text>
                      </View>
                      <Text style={styles.dgPriceValue}>${dotggPrices.coldFoilPrice.toFixed(2)}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
            {(dotggPrices.cmNormalPrice != null || dotggPrices.cmFoilPrice != null) && (
              <View style={styles.dgMarketBlock}>
                <Text style={styles.dgMarketLabel}>Cardmarket</Text>
                <View style={styles.dgPriceGrid}>
                  {dotggPrices.cmNormalPrice != null && (
                    <View style={styles.dgPriceItem}>
                      <Text style={styles.dgPriceType}>Normal</Text>
                      <Text style={styles.dgPriceValue}>€{dotggPrices.cmNormalPrice.toFixed(2)}</Text>
                    </View>
                  )}
                  {dotggPrices.cmFoilPrice != null && (
                    <View style={styles.dgPriceItem}>
                      <View style={styles.dgFoilRow}>
                        <Sparkles size={10} color={Colors.primaryLight} />
                        <Text style={styles.dgPriceType}>Foil</Text>
                      </View>
                      <Text style={styles.dgPriceValue}>€{dotggPrices.cmFoilPrice.toFixed(2)}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
            {dotggPrices.normalPrice == null && dotggPrices.foilPrice == null && dotggPrices.coldFoilPrice == null && dotggPrices.cmNormalPrice == null && dotggPrices.cmFoilPrice == null && (
              <Text style={styles.dgNoData}>No price data available</Text>
            )}
            <Text style={styles.dgSourceText}>Data from DotGG</Text>
          </>
        ) : !dotggLoading ? (
          <Text style={styles.dgNoData}>Price data not available for this card</Text>
        ) : null}
      </View>

      <View style={{ height: 40 }} />
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
    gap: 14,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  imageContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  titleSection: {
    alignItems: 'center',
    gap: 4,
  },
  name: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center' as const,
  },
  version: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontStyle: 'italic' as const,
  },
  cardNumberText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '500' as const,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  costCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  costCircleText: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  rarityLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
  typeLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  subtypes: {
    textAlign: 'center' as const,
    color: Colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic' as const,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  inkableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  inkableText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  textCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 8,
  },
  bodyText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  cardSectionTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.primary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  abilityItem: {
    gap: 2,
  },
  abilityName: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  abilityText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  flavorText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic' as const,
    lineHeight: 18,
  },
  setInfo: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 4,
  },
  setLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  setName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  setDate: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  printingsSection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 14,
    gap: 6,
  },
  printingsHint: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  printingsRow: {
    gap: 12,
    paddingTop: 8,
    paddingBottom: 2,
  },
  printingCard: {
    width: 120,
    gap: 5,
  },
  printingLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  printingOwned: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700' as const,
  },
  collectionSection: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  qtyRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  actionBtnActive: {
    borderColor: Colors.danger + '50',
    backgroundColor: Colors.danger + '15',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  deckPicker: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden' as const,
  },
  deckPickerItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  deckPickerName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  deckPickerFormat: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  noDeckText: {
    padding: 14,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center' as const,
  },
  noteToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  noteToggleText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  noteBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  noteInput: {
    color: Colors.text,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top' as const,
  },
  saveNoteBtn: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveNoteBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.background,
  },
  moreToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    marginTop: 4,
  },
  moreToggleText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  moreTypesGrid: {
    gap: 14,
  },
  qtyRowCenter: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
  },
  cmSection: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  cmHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  cmTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  cmPriceGrid: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
  },
  cmPriceItem: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center' as const,
    gap: 6,
  },
  cmPriceIconRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  cmPriceLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  cmPriceValue: {
    fontSize: 17,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  cmLinkBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.primary + '18',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  cmLinkText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  cmNoData: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    paddingVertical: 8,
  },
  dgSection: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.accent + '30',
  },
  dgHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  dgTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  dgTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  dgDateText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500' as const,
  },
  dgMarketBlock: {
    gap: 8,
  },
  dgMarketLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  dgPriceGrid: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  dgPriceItem: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center' as const,
    gap: 4,
  },
  dgPriceType: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textMuted,
  },
  dgFoilRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
  },
  dgPriceValue: {
    fontSize: 17,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  dgNoData: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    paddingVertical: 8,
  },
  dgSourceText: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'right' as const,
    fontStyle: 'italic' as const,
  },
});
