import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Button } from "../components/Button";
import { api, API_URL, type Video } from "../lib/api";
import { languageByCode } from "../lib/languages";
import { useSession } from "../lib/session";
import { colors, radius, space } from "../theme";

const STATUS_LABEL: Record<Video["status"], { text: string; color: string }> = {
  queued: { text: "Waiting", color: colors.muted },
  running: { text: "Making…", color: colors.primary },
  done: { text: "Ready", color: colors.success },
  failed: { text: "Failed", color: colors.danger },
};

export default function VideosScreen() {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshCredits } = useSession();

  function confirmDelete() {
    Alert.alert(
      "Delete my data?",
      "This permanently deletes your videos, prompts and remaining credits from Toonz servers.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteMyData();
              setVideos([]);
              await refreshCredits();
              Alert.alert("Deleted", "Your data has been removed.");
            } catch (err) {
              Alert.alert("Couldn't delete", (err as Error).message);
            }
          },
        },
      ],
    );
  }

  const load = useCallback(async () => {
    try {
      setVideos(await api.listVideos());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <FlatList
      data={videos ?? []}
      keyExtractor={(v) => v.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
      ListFooterComponent={
        <View style={styles.footer}>
          <Button label="Privacy policy" variant="ghost" onPress={() => Linking.openURL(`${API_URL}/privacy`)} />
          <Button label="Terms of use" variant="ghost" onPress={() => Linking.openURL(`${API_URL}/terms`)} />
          <Button label="Delete my data" variant="ghost" onPress={confirmDelete} />
        </View>
      }
      ListEmptyComponent={
        videos ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No videos yet</Text>
            <Text style={styles.emptyText}>Your cartoon reels will show up here.</Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => {
        const status = STATUS_LABEL[item.status];
        return (
          <Pressable
            onPress={() => router.push(`/video/${item.id}`)}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.title} numberOfLines={2}>
                {item.title ?? item.prompt}
              </Text>
              <Text style={styles.meta}>
                {languageByCode(item.language).name} · {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: space.md, gap: space.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  title: { fontSize: 16, fontWeight: "700", color: colors.ink },
  meta: { fontSize: 13, color: colors.muted },
  status: { fontWeight: "800", fontSize: 14 },
  error: { color: colors.danger, marginBottom: space.sm },
  empty: { alignItems: "center", marginTop: 80, gap: space.sm },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: colors.ink },
  emptyText: { color: colors.muted },
  footer: { marginTop: space.xl, opacity: 0.8 },
});
