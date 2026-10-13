import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CreditsPill } from "../components/CreditsPill";
import { SessionProvider } from "../lib/session";
import { colors } from "../theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTintColor: colors.ink,
            headerTitleStyle: { fontWeight: "800" },
            contentStyle: { backgroundColor: colors.background },
            headerRight: () => <CreditsPill />,
          }}
        >
          <Stack.Screen name="index" options={{ title: "Toonz Video" }} />
          <Stack.Screen name="videos" options={{ title: "My videos" }} />
          <Stack.Screen name="video/[id]" options={{ title: "" }} />
          <Stack.Screen name="language" options={{ title: "Language", presentation: "modal", headerRight: undefined }} />
          <Stack.Screen name="credits" options={{ title: "Get credits", presentation: "modal", headerRight: undefined }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
