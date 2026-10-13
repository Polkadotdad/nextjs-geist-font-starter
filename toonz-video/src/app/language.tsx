import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LANGUAGES } from "../lib/languages";
import { useSession } from "../lib/session";
import { colors, radius, space } from "../theme";

export default function LanguageScreen() {
  const { language, setLanguage } = useSession();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LANGUAGES;
    return LANGUAGES.filter((l) => l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q));
  }, [query]);

  return (
    <View style={styles.container}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search languages"
        placeholderTextColor={colors.muted}
        style={styles.search}
        autoCorrect={false}
      />
      <FlatList
        data={results}
        keyExtractor={(l) => l.code}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const selected = item.code === language;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                setLanguage(item.code);
                router.back();
              }}
              style={({ pressed }) => [styles.row, selected && styles.selected, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.native}>{item.nativeName}</Text>
              <Text style={styles.name}>{item.name}</Text>
              {selected && <Text style={styles.check}>✓</Text>}
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No matching language yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space.md, gap: space.sm },
  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: 14,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  selected: { backgroundColor: "#FFE9C2" },
  native: { fontSize: 18, fontWeight: "700", color: colors.ink },
  name: { fontSize: 15, color: colors.muted, flex: 1 },
  check: { fontSize: 18, fontWeight: "900", color: colors.primary },
  empty: { textAlign: "center", color: colors.muted, marginTop: space.lg },
});
