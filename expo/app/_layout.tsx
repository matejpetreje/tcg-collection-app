import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DatabaseProvider } from "@/providers/DatabaseProvider";
import { TCGProvider, useTCG } from "@/providers/TCGProvider";
import Colors from "@/constants/colors";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { tcg, ready } = useTCG();

  useEffect(() => {
    if (!ready) return;
    const first = segments[0] as string | undefined;
    if (!tcg && first !== 'tcg-select') {
      router.replace('/tcg-select');
    }
  }, [ready, tcg, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: { color: Colors.text, fontWeight: '600' as const },
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="tcg-select"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
        }}
      />
      <Stack.Screen
        name="card/[cardId]"
        options={{
          title: "Card Detail",
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="deck/[deckId]"
        options={{
          title: "Deck",
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="starter-deck/[deckId]"
        options={{
          title: "Starter Deck",
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="community-deck/[uuid]"
        options={{
          title: "Community Deck",
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="community-decks-search"
        options={{
          title: "Community Decks",
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="deck-form"
        options={{
          title: "New Deck",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="add-card"
        options={{
          title: "Add Card",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="lore-counter"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
        }}
      />
      <Stack.Screen
        name="log-game"
        options={{
          title: "Log Game",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="game-history"
        options={{
          title: "Game History",
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="scan-card"
        options={{
          title: "Scan Card",
          presentation: "fullScreenModal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="player-profile-qr"
        options={{
          title: "Player QR",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="scan-player-qr"
        options={{
          title: "Scan Player QR",
          presentation: "fullScreenModal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="share-game-history"
        options={{
          title: "Share History",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="scan-history-qr"
        options={{
          title: "Scan History QR",
          presentation: "fullScreenModal",
          headerShown: false,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <TCGProvider>
          <DatabaseProvider>
            <RootLayoutNav />
          </DatabaseProvider>
        </TCGProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
