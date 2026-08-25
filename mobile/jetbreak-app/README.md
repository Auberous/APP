# Jetbreak — Mobile App (Capacitor)

A native wrapper around `www/index.html` (the same game as the web builds,
minus any web-portal SDK — ads here go through **AdMob** instead, called via
the Capacitor plugin bridge).

This is a real, working project — `npm install` + `npx cap add android`/`ios`
have already been run once to generate `android/` and `ios/`. `node_modules/`
is gitignored (regenerate with `npm install`); the native project folders are
committed as-is.

## What's already done

- Capacitor project scaffolded, both platforms added
- `@capacitor-community/admob` installed and wired into `www/index.html`:
  persistent banner, interstitial on the same "every 3rd death" cadence as
  the web builds, rewarded video gating the "watch an ad to redeploy" continue
- The required AdMob App ID entries added to `AndroidManifest.xml` and
  `Info.plist` (the app **crashes on launch** without these — don't skip them)
- Everything currently uses **Google's public TEST ad unit IDs** — safe to
  build and run right now, always serves a clearly-labeled test ad, earns
  nothing

## What only you can do from here

I can't create accounts, sign builds, or submit to a store on your behalf —
those need your identity. Here's exactly what's left, in order:

### 1. Create an AdMob account
- Go to [apps.admob.com](https://apps.admob.com), sign up (free), register a
  new app — one entry for Android, one for iOS.
- Under each app, create 3 ad units: **Banner**, **Interstitial**, **Rewarded**.
- You'll get one **App ID** per platform and one **Ad Unit ID** per ad unit —
  6 IDs total.

### 2. Swap the test IDs for your real ones (3 files)
- `www/index.html` — the `ADMOB_APP_ID_ANDROID`, `ADMOB_APP_ID_IOS`,
  `ADMOB_BANNER_ID`, `ADMOB_INTERSTITIAL_ID`, `ADMOB_REWARDED_ID` constants
  near the top of the `<script>` block. Also remove `isTesting: true` from
  each AdMob call once you're testing with real IDs on a registered test
  device (see AdMob's testing docs) or ready for production.
- `android/app/src/main/AndroidManifest.xml` — the `APPLICATION_ID` meta-data value
- `ios/App/App/Info.plist` — the `GADApplicationIdentifier` value
- After editing `www/index.html`, run `npx cap sync` to copy it into both
  native projects.

### 3. Replace the app icon and splash screen
Capacitor ships default placeholder icons — **stores will reject a submission
using them.** Use [Capacitor Assets](https://github.com/ionic-team/capacitor-assets)
(`npm install -D @capacitor/assets`, then `npx capacitor-assets generate`) with
a 1024×1024 icon and a splash image, or replace the files under
`android/app/src/main/res/mipmap-*` and `ios/App/App/Assets.xcassets` manually.

### 4. Set a real bundle/app ID
`com.auberous.jetbreak` in `capacitor.config.json` is a placeholder. Pick your
real reverse-domain identifier (must be globally unique per store, can't be
changed after first publish) and update it there, then run `npx cap sync`.

### 5. Build, sign, and submit

**Android:**
```
npx cap open android
```
Opens Android Studio. Build a **signed `.aab`** (Build → Generate Signed Bundle).
You'll need a Google Play Console account ($25 one-time) — create at
[play.google.com/console](https://play.google.com/console), create the app
listing (screenshots, description, content rating, privacy policy — required
since this app shows ads and the Data safety form must reflect that), upload
the `.aab` to Internal Testing first to verify ads actually fire on a real
device, then promote to Production.

**iOS:**
```
npx cap open ios
```
Opens Xcode (macOS only). Set your signing team, then Product → Archive to
build. You'll need an Apple Developer account ($99/year) — enroll at
[developer.apple.com](https://developer.apple.com). Submit via App Store
Connect, same asset/privacy-policy requirements as Android.

## Commands reference

| Command | What it does |
|---|---|
| `npm install` | Install/restore dependencies (only needed once, or after pulling changes to `package.json`) |
| `npx cap sync` | Copy `www/` into both native projects and update native plugin config — run after any change to the game files or the AdMob IDs |
| `npx cap open android` | Open the Android project in Android Studio |
| `npx cap open ios` | Open the iOS project in Xcode (macOS only) |

## Status

Scaffolded and wired for AdMob with test IDs. Not yet: real AdMob IDs, real
app icon/splash, real bundle ID, signed, or submitted to either store.
