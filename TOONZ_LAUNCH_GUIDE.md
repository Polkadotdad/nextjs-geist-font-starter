# Toonz Video — Launch Guide

Toonz Video turns a one-line idea into a short animated cartoon reel (9:16), with voices and captions in the language the user picks.

```
User types idea + picks language (phone app)
        │
        ▼
Toonz server ──► Claude writes the script (scenes, dialogue, caption)
             ──► fal.ai draws the characters, then each scene in the same style
             ──► fal.ai animates each scene (5 s clips)
             ──► fal.ai records the voices (ElevenLabs v3, 30+ languages)
             ──► ffmpeg joins it all + caption bar + subtitles
        │
        ▼
Finished reel → watch, save to gallery, share
```

| Folder | What it is |
|---|---|
| `toonz-video/` | The phone app (Expo / React Native) for iPhone and Android |
| `toonz-server/` | The server that makes the videos and tracks credits |

---

## 1. Accounts you need

| Service | Why | Cost |
|---|---|---|
| Apple Developer Program | Publish on the App Store | $99 / year |
| Google Play Console | Publish on Google Play | $25 one time |
| Expo (expo.dev) | Builds the iPhone and Android apps in the cloud (no Mac needed) | Free tier is enough to start |
| fal.ai | Draws, animates and voices the cartoons | Pay per use |
| Anthropic (console.anthropic.com) | Writes the scripts | Pay per use, small per video |
| RevenueCat | Handles in-app purchases on both stores | Free to start |
| A server host (Render, Railway, Fly.io…) | Runs `toonz-server` | A few dollars a month plus a disk for the videos |

**Cost per video (estimate):** about **$1** with the default settings (3 scenes ≈ 15 s). Most of that is the animation step. Check current prices on fal.ai, then price your credit packs well above it, remembering Apple and Google keep 15–30%.

---

## 2. Put the server online

The server ships with a `Dockerfile`, so any host that runs Docker works. On **Render**, for example:

1. New → **Web Service** → connect this GitHub repo → **Root directory:** `toonz-server` → **Runtime:** Docker.
2. Add a **Disk** mounted at `/data` (stores the database and the videos).
3. Add these **environment variables** (`toonz-server/.env.example` lists them all):

| Variable | Value |
|---|---|
| `FAL_KEY` | Your fal.ai API key |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `PUBLIC_BASE_URL` | The server's public address, e.g. `https://toonz-api.onrender.com` |
| `SUPPORT_EMAIL` | The email shown on the privacy page |
| `REVENUECAT_WEBHOOK_AUTH` | Any long secret, e.g. `Bearer 9f2c…` (also used in step 4) |
| `FREE_CREDITS` | Free videos for new users (default `1`) |
| `CREDIT_PRODUCTS` | `toonz_credits_5=5,toonz_credits_20=20` (store product id = credits) |

4. Deploy, then open `https://YOUR-SERVER/health`. It should say `{"ok":true,"mock":false}`.

**Free test mode:** if `FAL_KEY` is empty, the server runs in **mock mode**. It makes placeholder videos (coloured backgrounds, beeps instead of voices, real captions) at no cost, so you can test the whole app before paying for AI.

Your **privacy policy** and **terms** are hosted automatically at `https://YOUR-SERVER/privacy` and `https://YOUR-SERVER/terms`. Use those links in both stores.

---

## 3. Try the app on your phone

```bash
cd toonz-video
npm install
npx eas-cli@latest login
npx eas-cli@latest init                 # links the project to your Expo account
```

Edit `toonz-video/eas.json` and replace `https://YOUR-TOONZ-SERVER.example.com` with your server address (all three profiles).

- **Android test build:** `npx eas-cli@latest build --platform android --profile preview` gives you an `.apk` link to install on any Android phone.
- **iPhone test build:** `npx eas-cli@latest build --platform ios --profile preview` (it asks you to sign in to your Apple account and register your iPhone).

The app needs a custom build because it uses native in-app purchases. The plain **Expo Go** app won't run it.

---

## 4. Set up credit packs (in-app purchases)

1. **App Store Connect** → your app → **In-App Purchases** → create two **Consumable** products: `toonz_credits_5` and `toonz_credits_20`.
2. **Google Play Console** → your app → **Monetize → In-app products** → create the same two product ids.
3. **RevenueCat**: create a project, add the iOS and Android apps, import both products, put them in an Offering called `default` (make it **Current**).
4. RevenueCat → **Integrations → Webhooks**: URL `https://YOUR-SERVER/webhooks/revenuecat`, Authorization header = the same `REVENUECAT_WEBHOOK_AUTH` value as on the server.
5. Copy RevenueCat's **public SDK keys** (`appl_…` and `goog_…`) into `eas.json` (`EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`).

When someone buys a pack, RevenueCat tells the server, which adds the credits to their balance. Duplicate notifications are ignored, and a failed video refunds its credit automatically.

---

## 5. Build for the stores and submit

Before your first store build, change the app id from `com.toonzvideo.app` to one you own (e.g. `com.yourname.toonzvideo`) in `toonz-video/app.json` (both `ios.bundleIdentifier` and `android.package`). It can't be changed after you publish.

```bash
cd toonz-video
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform ios       # uploads to App Store Connect / TestFlight
npx eas-cli@latest submit --platform android   # uploads to Google Play (first upload can be done by hand)
```

### Store listing (draft — edit freely)

- **Name:** Toonz Video – AI Cartoon Reels
- **Subtitle / short description:** Type an idea, get a funny cartoon reel
- **Description:**
  > Turn any idea into a funny animated cartoon reel in minutes. Type a situation, like "teacher catches a student sleeping in class", pick a language, and Toonz Video writes the story, draws the characters, animates every scene, and adds voices and captions.
  >
  > • Original cartoon characters in a bold 2D comedy style
  > • Voices and captions in 30+ languages, including Hindi, Tamil, Bengali, Urdu, Spanish and Arabic
  > • Vertical 9:16 videos ready for Reels, Shorts and Status
  > • Save to your gallery or share in one tap
  >
  > Your first video is free. Get more with credit packs.
- **Keywords (iOS):** cartoon,animation,reels,ai video,comedy,meme,shorts,hindi,story,maker
- **Category:** Photo & Video (iOS) / Video Players & Editors (Android)

### Questions the stores will ask

- **Privacy / Data safety:** the app collects user content (prompts, generated videos) and purchase history, linked to an anonymous account id. Nothing is used for tracking or ads. Users can delete everything in the app (My videos → Delete my data).
- **AI-generated content:** say yes. The app filters requests (the script writer refuses unsafe ideas), labels videos as AI-made, and lets users **report** a video (stored on the server; check the logs for `video reported`).
- **Age rating:** answer the questionnaire honestly. Comedy slapstick usually gets a teen rating.
- **Encryption (iOS):** already declared as "no non-exempt encryption" in `app.json`.

---

## 6. Known gaps before a big launch

- **Not yet tested on a real phone or with real API keys.** Everything was verified in mock mode, and the app compiles and bundles for both platforms. Do a TestFlight / internal-testing round first.
- **Character consistency:** the server draws a character sheet first and reuses it for every scene, but AI models still drift sometimes. Change models in the server's `.env` (`FAL_IMAGE_EDIT_MODEL`, `FAL_VIDEO_MODEL`) without touching code.
- **Free-credit abuse:** someone could reinstall to get the free video again (limited to 5 new accounts per hour per IP). If that becomes a problem, add Apple App Attest / Google Play Integrity checks.
- **Storage:** videos live on the server disk. Move them to object storage (Cloudflare R2, S3) as you grow, and consider deleting old videos after 30–90 days (update the privacy policy if you do).
- **Emoji in captions** are removed from the burned-in text (the caption renderer can't draw colour emoji). They still appear in the app.
