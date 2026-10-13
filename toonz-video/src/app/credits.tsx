import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { Button } from "../components/Button";
import { buyPack, getCreditPacks, purchasesEnabled } from "../lib/purchases";
import { useSession } from "../lib/session";
import { colors, radius, space } from "../theme";

export default function CreditsScreen() {
  const { credits, refreshCredits } = useSession();
  const [packs, setPacks] = useState<PurchasesPackage[] | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCreditPacks()
      .then(setPacks)
      .catch((err: Error) => setError(err.message));
  }, []);

  async function buy(pack: PurchasesPackage) {
    setBuying(pack.identifier);
    try {
      const before = credits ?? 0;
      if (!(await buyPack(pack))) return;
      // The store tells our server about the purchase via RevenueCat; wait for the new balance.
      for (let attempt = 0; attempt < 10; attempt++) {
        const now = await refreshCredits();
        if (now !== null && now > before) {
          Alert.alert("Credits added", `You now have ${now} credits.`);
          router.back();
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      Alert.alert("Purchase received", "Your credits are on the way and will appear in a minute.");
    } catch (err) {
      Alert.alert("Purchase failed", (err as Error).message);
    } finally {
      setBuying(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.balance}>🎬 {credits ?? "–"}</Text>
      <Text style={styles.body}>1 credit = 1 cartoon video with voices and captions.</Text>

      {!purchasesEnabled && <Text style={styles.note}>Purchases aren't set up in this build yet.</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
      {purchasesEnabled && !packs && !error && <ActivityIndicator color={colors.primary} />}

      {packs?.map((pack) => (
        <View key={pack.identifier} style={styles.pack}>
          <View style={{ flex: 1 }}>
            <Text style={styles.packTitle}>{pack.product.title}</Text>
            <Text style={styles.body}>{pack.product.description}</Text>
          </View>
          <Button
            label={pack.product.priceString}
            onPress={() => buy(pack)}
            loading={buying === pack.identifier}
            disabled={buying !== null}
          />
        </View>
      ))}
      {packs?.length === 0 && <Text style={styles.note}>No credit packs are available right now.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  balance: { fontSize: 44, fontWeight: "900", color: colors.ink, textAlign: "center" },
  body: { fontSize: 14, color: colors.muted },
  note: { color: colors.muted, textAlign: "center", marginTop: space.lg },
  error: { color: colors.danger, textAlign: "center" },
  pack: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: space.md,
  },
  packTitle: { fontSize: 17, fontWeight: "800", color: colors.ink },
});
