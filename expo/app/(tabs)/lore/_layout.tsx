import { Stack } from "expo-router";
import React from "react";
import Colors from "@/constants/colors";
import TCGSwitcherButton from "@/components/TCGSwitcherButton";

export default function LoreLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '600' as const },
        headerRight: () => <TCGSwitcherButton />,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Lore Counter" }} />
    </Stack>
  );
}
