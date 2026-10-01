import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, ActivityIndicator, FlatList,
  Platform, Alert, Animated,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Zap, ZapOff, RotateCcw, Plus, Check, ScanLine, X, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { generateObject } from '@rork-ai/toolkit-sdk';
import { z } from 'zod';
import Colors from '@/constants/colors';
import { getSetNumber } from '@/constants/sets';
import { useDatabase } from '@/providers/DatabaseProvider';
import { safeQuery, safeRun } from '@/utils/database';
import CardImage from '@/components/CardImage';
import type { CardWithDetails } from '@/types/database';

type ScanStep = 'camera' | 'analyzing' | 'results';

interface IdentifiedCard {
  name: string;
  set_name?: string;
  card_number?: string;
  ink_color?: string;
}

export default function ScanCardScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db } = useDatabase();
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<ScanStep>('camera');
  const [torch, setTorch] = useState<boolean>(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [matchedCards, setMatchedCards] = useState<CardWithDetails[]>([]);
  const [addedCardIds, setAddedCardIds] = useState<Set<number>>(new Set());
  const [foilAddedCardIds, setFoilAddedCardIds] = useState<Set<number>>(new Set());
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef<boolean>(false);
  const [identifiedInfo, setIdentifiedInfo] = useState<IdentifiedCard | null>(null);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [_cameraError, setCameraError] = useState<string | null>(null);

  const scanLineAnim = useRef(new Animated.Value(0)).current;

  const startScanAnimation = useCallback(() => {
    scanLineAnim.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [scanLineAnim]);

  React.useEffect(() => {
    if (step === 'camera') {
      startScanAnimation();
    }
  }, [step, startScanAnimation]);

  const analyzeMutation = useMutation({
    mutationFn: async (base64Image: string) => {
      console.log('[Scan] Sending image to AI for identification...');

      const result = await generateObject({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: `data:image/jpg;base64,${base64Image}`,
              },
              {
                type: 'text',
                text: `This is a photo of a Disney Lorcana trading card. Please identify:
1. First, read the card NAME exactly as printed on the card (the main title text).
2. Then identify the card's INK COLOR by carefully examining the card border/frame color:
   - Amber: warm YELLOW or ORANGE border, golden tones
   - Amethyst: PURPLE or VIOLET border
   - Emerald: GREEN border
   - Ruby: RED border
   - Sapphire: BLUE border
   - Steel: GREY, SILVER, or METALLIC border — this is NOT yellow/orange. Steel has a cold, neutral grey/silver tone. Do NOT confuse Steel with Amber.
   IMPORTANT: If the border looks grey, silver, or metallic, the color is Steel, NOT Amber. Only choose Amber if the border is clearly warm yellow/orange/golden.
3. If visible, note the set name and card number.
If this is not a Lorcana card or you cannot identify it, set name to "unknown".`,
              },
            ],
          },
        ],
        schema: z.object({
          name: z.string().describe('The exact name of the card as printed on it'),
          ink_color: z.string().optional().describe('The ink color detected from the card frame: Amber, Amethyst, Emerald, Ruby, Sapphire, or Steel'),
          set_name: z.string().optional().describe('The set name if visible'),
          card_number: z.string().optional().describe('The card number if visible'),
        }),
      });

      console.log('[Scan] AI identified:', result);
      return result;
    },
    onSuccess: async (identified) => {
      setIdentifiedInfo(identified);

      if (!db || identified.name === 'unknown') {
        setMatchedCards([]);
        setStep('results');
        return;
      }

      const searchName = identified.name.trim();
      const inkFilter = identified.ink_color?.trim() ?? null;
      console.log('[Scan] Searching DB for:', searchName, 'ink:', inkFilter);

      let inkClause = '';
      const baseParams: unknown[] = [`%${searchName}%`];
      if (inkFilter) {
        inkClause = ' AND c.ink_color = ?';
        baseParams.push(inkFilter);
      }

      let results = await safeQuery<CardWithDetails>(
        db,
        `SELECT c.id, c.name, c.version, c.ink_color, c.cost, c.rarity, c.type, c.set_code,
                c.card_number, c.strength, c.willpower, c.lore, c.inkable,
                COALESCE(uc.qty, 0) as qty, COALESCE(uc.qty_foil, 0) as qty_foil,
                COALESCE(uc.qty_enchanted, 0) as qty_enchanted,
                COALESCE(uc.qty_epic, 0) as qty_epic, COALESCE(uc.qty_promo, 0) as qty_promo,
                COALESCE(uc.qty_iconic, 0) as qty_iconic, COALESCE(uc.qty_play, 0) as qty_play,
                i.image_url, i.thumbnail_url, s.name as set_name, s.release_date,
                COALESCE(uc.qty, 0) + COALESCE(uc.qty_foil, 0) + COALESCE(uc.qty_enchanted, 0)
                + COALESCE(uc.qty_epic, 0) + COALESCE(uc.qty_promo, 0)
                + COALESCE(uc.qty_iconic, 0) + COALESCE(uc.qty_play, 0) as total_owned
         FROM cards c
         LEFT JOIN user_collection uc ON uc.card_id = c.id
         LEFT JOIN images i ON i.card_id = c.id
         LEFT JOIN sets s ON s.set_code = c.set_code
         WHERE c.name LIKE ?${inkClause}
         ORDER BY c.name ASC
         LIMIT 20`,
        baseParams
      );

      if (results.length === 0 && inkFilter) {
        results = await safeQuery<CardWithDetails>(
          db,
          `SELECT c.id, c.name, c.version, c.ink_color, c.cost, c.rarity, c.type, c.set_code,
                  c.card_number, c.strength, c.willpower, c.lore, c.inkable,
                  COALESCE(uc.qty, 0) as qty, COALESCE(uc.qty_foil, 0) as qty_foil,
                  COALESCE(uc.qty_enchanted, 0) as qty_enchanted,
                  COALESCE(uc.qty_epic, 0) as qty_epic, COALESCE(uc.qty_promo, 0) as qty_promo,
                  COALESCE(uc.qty_iconic, 0) as qty_iconic, COALESCE(uc.qty_play, 0) as qty_play,
                  i.image_url, i.thumbnail_url, s.name as set_name, s.release_date,
                  COALESCE(uc.qty, 0) + COALESCE(uc.qty_foil, 0) + COALESCE(uc.qty_enchanted, 0)
                  + COALESCE(uc.qty_epic, 0) + COALESCE(uc.qty_promo, 0)
                  + COALESCE(uc.qty_iconic, 0) + COALESCE(uc.qty_play, 0) as total_owned
           FROM cards c
           LEFT JOIN user_collection uc ON uc.card_id = c.id
           LEFT JOIN images i ON i.card_id = c.id
           LEFT JOIN sets s ON s.set_code = c.set_code
           WHERE c.name LIKE ?
           ORDER BY c.name ASC
           LIMIT 20`,
          [`%${searchName}%`]
        );
      }

      if (results.length === 0) {
        const words = searchName.split(/[\s\-,]+/).filter(w => w.length > 2);
        if (words.length > 0) {
          const likeClause = words.map(() => 'c.name LIKE ?').join(' OR ');
          const likeParams = words.map(w => `%${w}%`);
          results = await safeQuery<CardWithDetails>(
            db,
            `SELECT c.id, c.name, c.version, c.ink_color, c.cost, c.rarity, c.type, c.set_code,
                    c.card_number, c.strength, c.willpower, c.lore, c.inkable,
                    COALESCE(uc.qty, 0) as qty, COALESCE(uc.qty_foil, 0) as qty_foil,
                    COALESCE(uc.qty_enchanted, 0) as qty_enchanted,
                    COALESCE(uc.qty_epic, 0) as qty_epic, COALESCE(uc.qty_promo, 0) as qty_promo,
                    COALESCE(uc.qty_iconic, 0) as qty_iconic, COALESCE(uc.qty_play, 0) as qty_play,
                    i.image_url, i.thumbnail_url, s.name as set_name, s.release_date,
                    COALESCE(uc.qty, 0) + COALESCE(uc.qty_foil, 0) + COALESCE(uc.qty_enchanted, 0)
                    + COALESCE(uc.qty_epic, 0) + COALESCE(uc.qty_promo, 0)
                    + COALESCE(uc.qty_iconic, 0) + COALESCE(uc.qty_play, 0) as total_owned
             FROM cards c
             LEFT JOIN user_collection uc ON uc.card_id = c.id
             LEFT JOIN images i ON i.card_id = c.id
             LEFT JOIN sets s ON s.set_code = c.set_code
             WHERE ${likeClause}
             ORDER BY c.name ASC
             LIMIT 20`,
            likeParams
          );
        }
      }

      console.log('[Scan] Found', results.length, 'matching cards');
      setMatchedCards(results);
      setStep('results');
    },
    onError: (error) => {
      console.error('[Scan] AI analysis error:', error);
      Alert.alert('Scan Error', 'Could not identify the card. Please try again.');
      setStep('camera');
    },
  });

  const addToCollectionMutation = useMutation({
    mutationFn: async ({ cardId, foil }: { cardId: number; foil: boolean }) => {
      if (!db) throw new Error('Database not ready');
      if (foil) {
        await safeRun(
          db,
          `INSERT INTO user_collection (card_id, qty, qty_foil, qty_enchanted, qty_epic, qty_promo, qty_iconic, qty_play, updated_at)
           VALUES (?, 0, 1, 0, 0, 0, 0, 0, datetime('now'))
           ON CONFLICT(card_id) DO UPDATE SET qty_foil = qty_foil + 1, updated_at = datetime('now')`,
          [cardId]
        );
      } else {
        await safeRun(
          db,
          `INSERT INTO user_collection (card_id, qty, qty_foil, qty_enchanted, qty_epic, qty_promo, qty_iconic, qty_play, updated_at)
           VALUES (?, 1, 0, 0, 0, 0, 0, 0, datetime('now'))
           ON CONFLICT(card_id) DO UPDATE SET qty = qty + 1, updated_at = datetime('now')`,
          [cardId]
        );
      }
      return { cardId, foil };
    },
    onSuccess: ({ cardId, foil }) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (foil) {
        setFoilAddedCardIds(prev => new Set(prev).add(cardId));
      } else {
        setAddedCardIds(prev => new Set(prev).add(cardId));
      }
      void queryClient.invalidateQueries({ queryKey: ['collection'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const handleCameraReady = useCallback(() => {
    console.log('[Scan] Camera is ready');
    setCameraReady(true);
    setCameraError(null);
  }, []);

  const handleMountError = useCallback((event: { message: string }) => {
    console.error('[Scan] Camera mount error:', event.message);
    setCameraError(event.message);
  }, []);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) {
      console.log('[Scan] cameraRef.current is null, waiting...');
      Alert.alert('Camera not ready', 'Please wait a moment and try again.');
      return;
    }

    if (!cameraReady) {
      console.log('[Scan] Camera not ready yet');
      Alert.alert('Camera not ready', 'Please wait for the camera to initialize.');
      return;
    }

    if (isCapturing) {
      console.log('[Scan] Already capturing, ignoring...');
      return;
    }

    setIsCapturing(true);

    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (Platform.OS === 'android') {
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      if (!cameraRef.current) {
        console.log('[Scan] cameraRef became null after delay');
        Alert.alert('Error', 'Camera lost connection. Please go back and try again.');
        setIsCapturing(false);
        return;
      }

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: Platform.OS === 'android' ? 0.5 : 0.7,
        exif: false,
        skipProcessing: Platform.OS === 'android',
      });

      if (!photo?.base64) {
        console.log('[Scan] Photo returned without base64');
        Alert.alert('Error', 'Failed to capture photo. Please try again.');
        setIsCapturing(false);
        return;
      }

      console.log('[Scan] Photo captured, size:', photo.base64.length);
      setStep('analyzing');
      setIsCapturing(false);
      analyzeMutation.mutate(photo.base64);
    } catch (error) {
      console.error('[Scan] Capture error:', error);
      setIsCapturing(false);
      if (Platform.OS === 'android' && cameraRef.current) {
        console.log('[Scan] Android capture failed, retrying with lower quality...');
        try {
          await new Promise(resolve => setTimeout(resolve, 500));
          if (!cameraRef.current) {
            throw new Error('Camera ref lost');
          }
          const retryPhoto = await cameraRef.current.takePictureAsync({
            base64: true,
            quality: 0.3,
            exif: false,
            skipProcessing: true,
          });
          if (retryPhoto?.base64) {
            console.log('[Scan] Retry succeeded, size:', retryPhoto.base64.length);
            setStep('analyzing');
            analyzeMutation.mutate(retryPhoto.base64);
            return;
          }
        } catch (retryError) {
          console.error('[Scan] Retry also failed:', retryError);
        }
      }
      Alert.alert('Error', 'Failed to take photo. Hold the camera steady and try again.');
    }
  }, [analyzeMutation, cameraReady, isCapturing]);

  const handleRetry = useCallback(() => {
    setStep('camera');
    setMatchedCards([]);
    setIdentifiedInfo(null);
    setAddedCardIds(new Set());
    setFoilAddedCardIds(new Set());
    setCameraReady(false);
    setIsCapturing(false);
  }, []);

  const handleAddPressIn = useCallback((cardId: number) => {
    isLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      addToCollectionMutation.mutate({ cardId, foil: true });
    }, 2000);
  }, [addToCollectionMutation]);

  const handleAddPressOut = useCallback((cardId: number) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (!isLongPressRef.current) {
      addToCollectionMutation.mutate({ cardId, foil: false });
    }
    isLongPressRef.current = false;
  }, [addToCollectionMutation]);

  const renderMatchCard = useCallback(({ item }: { item: CardWithDetails }) => {
    const inkColor = Colors.ink[item.ink_color ?? ''] ?? Colors.textMuted;
    const isAdded = addedCardIds.has(item.id);
    const isFoilAdded = foilAddedCardIds.has(item.id);
    const totalOwned = item.total_owned ?? 0;

    return (
      <View style={resultStyles.card}>
        <Pressable
          style={({ pressed }) => [resultStyles.cardMain, pressed && { opacity: 0.6 }]}
          onPress={() => {
            console.log('[Scan] Opening card detail:', item.id);
            router.push(`/card/${item.id}`);
          }}
        >
          <CardImage cardId={item.id} imageUrl={item.image_url} thumbnailUrl={item.thumbnail_url} size="small" />
          <View style={resultStyles.cardInfo}>
            <Text style={resultStyles.cardName} numberOfLines={1}>{item.name}</Text>
            <View style={resultStyles.cardMeta}>
              <View style={[resultStyles.inkDot, { backgroundColor: inkColor }]} />
              {item.cost !== null && <Text style={resultStyles.costText}>{item.cost}</Text>}
              {item.strength !== null && <Text style={resultStyles.statText}>STR {item.strength}</Text>}
              {item.willpower !== null && <Text style={resultStyles.statText}>WIL {item.willpower}</Text>}
            </View>
            <View style={resultStyles.cardMeta}>
              <Text style={resultStyles.typeText}>{item.type ?? ''}</Text>
              <Text style={resultStyles.setText}>{item.set_name ? `S${getSetNumber(item.set_name) ?? '?'} · ` : ''}{item.set_code}{item.card_number ? ` #${item.card_number}` : ''}</Text>
            </View>
            {totalOwned > 0 && (
              <View style={resultStyles.ownedBadge}>
                <Text style={resultStyles.ownedText}>Owned: {totalOwned}</Text>
              </View>
            )}
          </View>
        </Pressable>
        <Pressable
          style={[resultStyles.addBtn, isAdded && resultStyles.addBtnDone, isFoilAdded && resultStyles.addBtnFoil]}
          onPressIn={() => handleAddPressIn(item.id)}
          onPressOut={() => handleAddPressOut(item.id)}
          disabled={addToCollectionMutation.isPending}
        >
          {isFoilAdded ? (
            <Sparkles size={18} color={Colors.rarity.Foil} />
          ) : isAdded ? (
            <Check size={18} color={Colors.success} />
          ) : (
            <Plus size={18} color={Colors.text} />
          )}
          <Text style={resultStyles.addBtnHint}>{isFoilAdded ? 'Foil' : isAdded ? '' : 'Hold 2s\nfor foil'}</Text>
        </Pressable>
      </View>
    );
  }, [addedCardIds, foilAddedCardIds, addToCollectionMutation, router, handleAddPressIn, handleAddPressOut]);

  if (_cameraError) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Scan Card' }} />
        <View style={styles.permissionBox}>
          <Camera size={48} color={Colors.danger} />
          <Text style={styles.permissionTitle}>Camera Error</Text>
          <Text style={styles.permissionText}>{_cameraError}</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={() => { setCameraError(null); setCameraReady(false); }}>
            <Text style={styles.permissionBtnText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
            <Text style={styles.cancelBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Scan Card' }} />
        <View style={styles.webFallback}>
          <Camera size={48} color={Colors.textMuted} />
          <Text style={styles.webFallbackTitle}>Camera Scanning</Text>
          <Text style={styles.webFallbackText}>
            Card scanning via camera is only available on mobile devices. Please use the Expo Go app on your phone.
          </Text>
          <TouchableOpacity style={styles.webBackBtn} onPress={() => router.back()}>
            <Text style={styles.webBackBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Scan Card' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Scan Card' }} />
        <View style={styles.permissionBox}>
          <Camera size={48} color={Colors.primary} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to scan your Lorcana cards. The photo is analyzed by AI to identify the card.
          </Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Grant Camera Access</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'analyzing') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Analyzing...' }} />
        <View style={styles.analyzingBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.analyzingTitle}>Identifying Card...</Text>
          <Text style={styles.analyzingText}>AI is analyzing the photo to find your card</Text>
        </View>
      </View>
    );
  }

  if (step === 'results') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Scan Results' }} />
        <View style={resultStyles.header}>
          {identifiedInfo && identifiedInfo.name !== 'unknown' ? (
            <>
              <Text style={resultStyles.identifiedLabel}>AI identified:</Text>
              <Text style={resultStyles.identifiedName}>{identifiedInfo.name}</Text>
              {identifiedInfo.ink_color && (
                <Text style={[resultStyles.identifiedSet, { color: Colors.ink[identifiedInfo.ink_color] ?? Colors.textSecondary }]}>{identifiedInfo.ink_color}</Text>
              )}
              {identifiedInfo.set_name && (
                <Text style={resultStyles.identifiedSet}>{identifiedInfo.set_name}</Text>
              )}
            </>
          ) : (
            <Text style={resultStyles.identifiedLabel}>Could not identify the card</Text>
          )}
          <Text style={resultStyles.matchCount}>
            {matchedCards.length > 0
              ? `${matchedCards.length} matching card${matchedCards.length > 1 ? 's' : ''} found`
              : 'No matching cards in your catalog'
            }
          </Text>
        </View>

        <FlatList
          data={matchedCards}
          renderItem={renderMatchCard}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={resultStyles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={resultStyles.emptyBox}>
              <Text style={resultStyles.emptyText}>
                No cards found. Make sure you have synced your card catalog in Settings.
              </Text>
            </View>
          }
        />

        <View style={resultStyles.footer}>
          <TouchableOpacity style={resultStyles.retryBtn} onPress={handleRetry}>
            <RotateCcw size={18} color={Colors.text} />
            <Text style={resultStyles.retryBtnText}>Scan Another</Text>
          </TouchableOpacity>
          <TouchableOpacity style={resultStyles.doneBtn} onPress={() => router.back()}>
            <Text style={resultStyles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 280],
  });

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Scan Card', headerTransparent: true, headerTintColor: Colors.white, headerShown: false }} />

      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        enableTorch={torch}
        onCameraReady={handleCameraReady}
        onMountError={handleMountError}
      >
        <View style={styles.overlay}>
          <View style={styles.overlayTop} />
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              <Animated.View
                style={[
                  styles.scanLine,
                  { transform: [{ translateY: scanLineTranslateY }] },
                ]}
              />
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.closeButtonRow}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => router.back()}
              testID="scan-close-btn"
            >
              <X size={22} color={Colors.white} />
            </TouchableOpacity>
          </View>
          <View style={styles.overlayBottom}>
            <Text style={styles.instructionText}>
              Position the Lorcana card within the frame
            </Text>

            <View style={styles.controlsRow}>
              <TouchableOpacity
                style={styles.controlBtn}
                onPress={() => setTorch(t => !t)}
              >
                {torch ? (
                  <Zap size={22} color={Colors.warning} />
                ) : (
                  <ZapOff size={22} color={Colors.white} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.captureBtn, isCapturing && { opacity: 0.5 }]}
                onPress={handleCapture}
                disabled={isCapturing}
                testID="scan-capture-btn"
              >
                <View style={styles.captureBtnInner}>
                  <ScanLine size={28} color={Colors.white} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.controlBtn}
                onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
              >
                <RotateCcw size={22} color={Colors.white} />
              </TouchableOpacity>
            </View>
          </View>
          {isCapturing && (
            <View style={styles.capturingOverlay}>
              <ActivityIndicator size="large" color={Colors.white} />
              <Text style={styles.capturingText}>Capturing...</Text>
            </View>
          )}
        </View>
      </CameraView>
    </View>
  );
}

const resultStyles = StyleSheet.create({
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    gap: 4,
  },
  identifiedLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500' as const,
  },
  identifiedName: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  identifiedSet: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  matchCount: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  costText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  statText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500' as const,
  },
  typeText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  setText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginLeft: 'auto' as const,
  },
  ownedBadge: {
    alignSelf: 'flex-start' as const,
    backgroundColor: Colors.accent + '20',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
  },
  ownedText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.accent,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  addBtnDone: {
    backgroundColor: Colors.success + '20',
    borderColor: Colors.success,
  },
  addBtnFoil: {
    backgroundColor: Colors.rarity.Foil + '25',
    borderColor: Colors.rarity.Foil,
  },
  addBtnHint: {
    fontSize: 7,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    lineHeight: 9,
    marginTop: 1,
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
  footer: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  retryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  doneBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.background,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayMiddle: {
    flexDirection: 'row',
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  scanFrame: {
    width: 280,
    height: 380,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  corner: {
    position: 'absolute' as const,
    width: 28,
    height: 28,
    borderColor: Colors.primary,
    borderWidth: 3,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomRightRadius: 8,
  },
  scanLine: {
    position: 'absolute' as const,
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: Colors.primary,
    opacity: 0.7,
    borderRadius: 1,
    top: 40,
  },
  closeButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    paddingTop: 24,
    gap: 28,
  },
  instructionText: {
    fontSize: 15,
    color: Colors.white,
    fontWeight: '500' as const,
    textAlign: 'center' as const,
    opacity: 0.9,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 40,
  },
  controlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  captureBtnInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 16,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    marginTop: 8,
  },
  permissionText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
  permissionBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    marginTop: 8,
  },
  permissionBtnText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.background,
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  cancelBtnText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  analyzingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  analyzingTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  analyzingText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  webFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 16,
  },
  webFallbackTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    marginTop: 8,
  },
  webFallbackText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
  webBackBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginTop: 8,
  },
  webBackBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  capturingOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  capturingText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
});
