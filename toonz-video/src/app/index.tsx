import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../components/Button";
import { api, ApiError } from "../lib/api";
import { languageByCode } from "../lib/languages";
import { useSession } from "../lib/session";
import { colors, radius, space } from "../theme";

const IDEAS = [
  "Teacher catches a student sleeping in class",
  "Mom finds my report card hidden under the bed",
  "Street cricket match, the ball breaks uncle's window",
  "Boss asks for weekend work on Friday evening",
  "Grandma learns to send voice notes",
  "Exam result day, dad is waiting at the door",
];

const MAX_PROMPT = 500;

export default function CreateScreen() {
  const { credits, setCredits, language, error } = useSession();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lang = languageByCode(language);
  const tooShort = prompt.trim().length < 5;

  async function create() {
    if (credits === 0) {
      router.push("/credits");
      return;
    }
    setSubmitting(true);
    try {
      const { video, credits: left } = await api.createVideo(prompt.trim(), language);
      setCredits(left);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPrompt("");
      router.push(`/video/${video.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) router.push("/credits");
      else Alert.alert("Couldn't start your video", (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>Type an idea.{"\n"}Get a cartoon reel.</Text>
          <Text style={styles.sub}>Characters, voices and captions are made for you in about 3–5 minutes.</Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.inputCard}>
            <TextInput
              value={prompt}
              onChangeText={(t) => setPrompt(t.slice(0, MAX_PROMPT))}
              placeholder="e.g. Teacher catches a student sleeping in class, student has a funny excuse"
              placeholderTextColor={colors.muted}
              multiline
              style={styles.input}
              accessibilityLabel="Video idea"
            />
            <Text style={styles.counter}>
              {prompt.length}/{MAX_PROMPT}
            </Text>
          </View>

          <Text style={styles.label}>Need an idea?</Text>
          <View style={styles.chips}>
            {IDEAS.map((idea) => (
              <Pressable
                key={idea}
                onPress={() => setPrompt(idea)}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.chipText}>{idea}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/language")}
            style={({ pressed }) => [styles.languageRow, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.label}>Voice & caption language</Text>
            <Text style={styles.languageValue}>
              {lang.nativeName}
              {lang.nativeName !== lang.name ? ` · ${lang.name}` : ""} ›
            </Text>
          </Pressable>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={credits === 0 ? "Get credits to create" : "Create video · 1 credit"}
            onPress={create}
            loading={submitting}
            disabled={tooShort && credits !== 0}
          />
          <Button label="My videos" variant="ghost" onPress={() => router.push("/videos")} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: space.md, paddingBottom: space.xl, gap: space.md },
  heading: { fontSize: 30, fontWeight: "900", color: colors.ink, lineHeight: 36 },
  sub: { fontSize: 15, color: colors.muted, marginTop: -space.sm },
  error: { color: colors.danger, fontWeight: "600" },
  inputCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: space.md,
  },
  input: { minHeight: 110, fontSize: 17, color: colors.ink, textAlignVertical: "top" },
  counter: { alignSelf: "flex-end", color: colors.muted, fontSize: 12 },
  label: { fontSize: 14, fontWeight: "800", color: colors.ink, textTransform: "uppercase", letterSpacing: 0.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { color: colors.ink, fontSize: 14 },
  languageRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.xs,
  },
  languageValue: { fontSize: 18, fontWeight: "700", color: colors.primary },
  footer: { padding: space.md, paddingTop: space.sm, gap: space.xs, borderTopWidth: 1, borderTopColor: colors.border },
});
