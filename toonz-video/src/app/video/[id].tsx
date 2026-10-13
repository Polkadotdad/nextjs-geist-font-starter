import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { api, type Video } from "../../lib/api";
import { useSession } from "../../lib/session";
import { colors, radius, space } from "../../theme";

const POLL_MS = 3000;

export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refreshCredits } = useSession();
  const [video, setVideo] = useState<Video | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "share" | null>(null);

  // Poll until the server finishes (or fails) the video.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const v = await api.getVideo(id);
        if (cancelled) return;
        setVideo(v);
        setError(null);
        if (v.status === "failed") void refreshCredits(); // the server refunds failed videos
        if (v.status === "queued" || v.status === "running") timer = setTimeout(tick, POLL_MS);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        timer = setTimeout(tick, POLL_MS * 2);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, refreshCredits]);

  const player = useVideoPlayer(video?.videoUrl ?? null, (p) => {
    p.loop = true;
    p.play();
  });

  async function downloadToCache(): Promise<File> {
    const file = new File(Paths.cache, `toonz-${id}.mp4`);
    if (file.exists) return file;
    return File.downloadFileAsync(video!.videoUrl!, file, { idempotent: true });
  }

  async function save() {
    setBusy("save");
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow Toonz Video to add videos to your gallery in Settings.");
        return;
      }
      const file = await downloadToCache();
      await MediaLibrary.Asset.create(file.uri);
      Alert.alert("Saved", "Your video is in your gallery.");
    } catch (err) {
      Alert.alert("Couldn't save", (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    setBusy("share");
    try {
      const file = await downloadToCache();
      await Sharing.shareAsync(file.uri, { mimeType: "video/mp4", dialogTitle: "Share your Toonz video" });
    } catch (err) {
      Alert.alert("Couldn't share", (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function report() {
    const send = (reason: string) =>
      api
        .reportVideo(id, reason)
        .then(() => Alert.alert("Thanks", "We'll review this video."))
        .catch((err: Error) => Alert.alert("Couldn't send report", err.message));
    Alert.alert("Report this video", "What's wrong with it?", [
      { text: "Offensive or harmful", onPress: () => send("offensive") },
      { text: "Copies someone else's work", onPress: () => send("copyright") },
      { text: "Something else", onPress: () => send("other") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  if (!video) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.errorText}>{error}</Text> : <ActivityIndicator color={colors.primary} />}
      </View>
    );
  }

  if (video.status === "failed") {
    return (
      <View style={[styles.center, { padding: space.lg, gap: space.md }]}>
        <Text style={styles.bigEmoji}>😵</Text>
        <Text style={styles.title}>This one didn't work out</Text>
        <Text style={styles.body}>{video.error}</Text>
        <Button label="Try another idea" onPress={() => router.dismissTo("/")} style={{ alignSelf: "stretch" }} />
      </View>
    );
  }

  if (video.status !== "done") {
    const percent = Math.round(video.progress * 100);
    return (
      <View style={[styles.center, { padding: space.lg, gap: space.md }]}>
        <Text style={styles.bigEmoji}>✏️</Text>
        <Text style={styles.title}>{video.step}…</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(percent, 4)}%` }]} />
        </View>
        <Text style={styles.body}>
          Usually takes 3–5 minutes. You can leave this screen. Find it later in My videos.
        </Text>
        <Text style={styles.prompt}>“{video.prompt}”</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.doneContent}>
        <VideoView player={player} style={styles.player} contentFit="contain" nativeControls />
        {video.title && <Text style={styles.title}>{video.title}</Text>}
        <View style={styles.actions}>
          <Button label="Save to gallery" onPress={save} loading={busy === "save"} disabled={busy !== null} style={{ flex: 1 }} />
          <Button
            label="Share"
            variant="secondary"
            onPress={share}
            loading={busy === "share"}
            disabled={busy !== null}
            style={{ flex: 1 }}
          />
        </View>
        <Button label="Make another" variant="ghost" onPress={() => router.dismissTo("/")} />
        <Button label="Report video" variant="ghost" onPress={report} />
        <Text style={styles.disclaimer}>Made with AI. Characters and voices are generated and not real people.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bigEmoji: { fontSize: 56 },
  title: { fontSize: 22, fontWeight: "900", color: colors.ink, textAlign: "center" },
  body: { fontSize: 15, color: colors.muted, textAlign: "center" },
  prompt: { fontSize: 15, color: colors.ink, fontStyle: "italic", textAlign: "center" },
  errorText: { color: colors.danger, padding: space.lg, textAlign: "center" },
  track: {
    alignSelf: "stretch",
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: colors.primary },
  doneContent: { padding: space.md, gap: space.md },
  player: { width: "100%", aspectRatio: 9 / 16, maxHeight: 560, borderRadius: radius.md, backgroundColor: "#000" },
  actions: { flexDirection: "row", gap: space.sm },
  disclaimer: { fontSize: 12, color: colors.muted, textAlign: "center" },
});
