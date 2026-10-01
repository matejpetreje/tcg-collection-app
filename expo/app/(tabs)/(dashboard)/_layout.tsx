import { Stack } from "expo-router";
import React from "react";
import Colors from "@/constants/colors";
import TCGSwitcherButton from "@/components/TCGSwitcherButton";

export default function DashboardLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '700' as const },
        contentStyle: { backgroundColor: Colors.background },
        headerRight: () => <TCGSwitcherButton />,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Dashboard" }} />
    </Stack>
  );
}
