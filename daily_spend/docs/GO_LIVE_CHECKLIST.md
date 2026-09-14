# Go-live checklist: a real, usable link

**Goal**: a real `https://<your-project-id>.web.app` link you (and a
partner) can open on any phone, backed by a real Firebase project.

**Everything below runs on your own machine, not inside an agent
session** — this project was built in a sandbox whose network policy
blocks Firebase's own login and CDN infrastructure (`auth.firebase.tools`,
`www.gstatic.com`), so `firebase login` and anything Firebase-web-related
can't be driven from there. None of that is specific to this app; it
applies to any Flutter+Firebase project built the same way.

## Prerequisites (one-time)

- Node.js 20+ (for the Firebase CLI and Cloud Functions)
- The Flutter SDK ([flutter.dev](https://flutter.dev)) — built/tested
  against 3.47.4, but any recent stable should work
- A Google account
- A credit card to attach to the Firebase project's billing (step 3 —
  see the note there about why, and why you shouldn't expect to be
  charged for this kind of use)

## 1. Get the code

```bash
git clone <your repo URL>
cd APP/daily_spend   # adjust to wherever this branch lives
flutter pub get
```

## 2. Install the Firebase tooling

```bash
npm install -g firebase-tools
dart pub global activate flutterfire_cli
```

## 3. Log in and create a project

```bash
firebase login
firebase projects:create daily-spend-yourname   # pick any globally-unique id
```

Then, in the [Firebase console](https://console.firebase.google.com) for
that project: **Settings → Usage and billing → Modify plan → Blaze**
(pay-as-you-go). Cloud Functions 2nd gen — what this app's backend uses —
requires the Blaze plan even at zero real usage. Firebase's free-tier
quotas are generous (2M function invocations/month, 50K Firestore
reads/day, etc.) — normal personal use here should cost $0, but "Blaze"
does mean pay-as-you-go rather than a hard cap, so keep an eye on the
console's usage tab out of general good practice.

## 4. Enable the services this app uses

In the Firebase console, for your new project:

- **Authentication** → Sign-in method → enable **Email/Password**,
  **Google**, and (optionally) **Apple**.
- **Firestore Database** → Create database → production mode, any region.
- Cloud Functions and Hosting don't need enabling here — deploying them
  (step 7) does that.

## 5. Connect the Flutter app to your project

```bash
flutterfire configure
```

Pick your new project, and at least the **web** platform (add
android/ios too if you want those later — that's covered in "What this
doesn't cover yet" below). This generates `lib/firebase_options.dart`.

Then one small manual edit — open `lib/main.dart` and change:

```dart
await Firebase.initializeApp();
```

to:

```dart
await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
```

(and add `import 'firebase_options.dart';` near the top of the file).
`flutterfire configure` generates the options file but doesn't wire up
this line for you.

## 6. Set placeholder secrets for the Cloud Functions

These need *some* value to deploy, even though the code that reads them
(Basiq/Adatree integration) isn't wired up to real APIs yet — see
`docs/OPEN_BANKING_INTEGRATION.md`:

```bash
cd firebase
firebase functions:secrets:set BASIQ_WEBHOOK_SECRET
firebase functions:secrets:set ADATREE_WEBHOOK_SECRET
firebase functions:secrets:set BASIQ_API_KEY
firebase functions:secrets:set ADATREE_API_KEY
```

(Each prompts for a value on stdin — anything works, e.g. `placeholder`.)

## 7. Deploy the backend

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions
```

## 8. Build and deploy the web app

```bash
cd ..
flutter build web
cd firebase
firebase deploy --only hosting
```

This prints your live URL: `https://<your-project-id>.web.app`.

## 9. Actually use it

Open that URL — on your phone, a partner's phone, wherever:

1. Sign up with email/password (or Google).
2. Create a household — you get a 6-character invite code.
3. Set a monthly budget and a payday date.
4. Go to **Settings → Linked bank accounts → Simulate a purchase**. This
   sends a fake purchase through the *real* pipeline (Cloud Function →
   Firestore → push notification) — no bank account, no waiting. Watch
   "Available Today" update on the dashboard, and if you allowed
   notifications, watch the push arrive.
5. Share the invite code with a second phone/account to see the
   shared-household side of it — both partners watching the same number
   update.

## Iterating after this

As new commits land on this branch:

```bash
git pull
flutter build web
cd firebase && firebase deploy --only hosting          # frontend changes
cd firebase && firebase deploy --only functions         # backend changes too, if any
```

## What this doesn't cover yet

- **Real Basiq/Adatree bank linking** — needs their API credentials; see
  `docs/OPEN_BANKING_INTEGRATION.md` for exactly what's left.
- **Push notifications on real devices** — desktop Chrome is the
  quickest way to test (it'll prompt for notification permission);
  mobile web push has its own quirks per browser/OS that aren't covered
  here.
- **Android/iOS app builds** — the `android/`/`ios/` folders already
  exist (`flutter create . --platforms=android,ios` was already run);
  re-run `flutterfire configure` with those platforms added, then the
  usual `flutter build apk` / Xcode archive + signing gets you an
  installable app, but that's a bigger topic on its own.
