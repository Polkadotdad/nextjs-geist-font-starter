import { router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { useSession } from "../lib/session";
import { colors, radius } from "../theme";

export function CreditsPill() {
  const { credits } = useSession();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${credits ?? 0} credits. Buy more`}
      onPress={() => router.push("/credits")}
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.text}>🎬 {credits ?? "–"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  text: { fontWeight: "800", fontSize: 15, color: colors.ink },
});
