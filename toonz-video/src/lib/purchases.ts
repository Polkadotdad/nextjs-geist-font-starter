import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";

// RevenueCat public SDK keys (safe to ship in the app). Set them in .env / eas.json.
const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

export const purchasesEnabled = Boolean(API_KEY);

let configuredFor: string | null = null;

/**
 * Links store purchases to this install's Toonz account id. The server's RevenueCat webhook
 * uses that id to add credits after a purchase.
 */
export function configurePurchases(accountId: string) {
  if (!API_KEY || configuredFor === accountId) return;
  if (configuredFor === null) Purchases.configure({ apiKey: API_KEY, appUserID: accountId });
  else void Purchases.logIn(accountId);
  configuredFor = accountId;
}

export async function getCreditPacks(): Promise<PurchasesPackage[]> {
  if (!purchasesEnabled) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

/** Returns false if the user cancelled the store sheet. */
export async function buyPack(pack: PurchasesPackage): Promise<boolean> {
  try {
    await Purchases.purchasePackage(pack);
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return false;
    throw err;
  }
}
