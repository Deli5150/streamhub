# StreamHub for iPhone and Android

The phone version of StreamHub. You sign in on each platform's own website inside the app, and it shows the live channels you follow on Twitch, YouTube, Kick and Rumble, with the player and chat, go-live alerts, channel pages, Watch Later and combined channels.

It's a React Native app built with Expo, and it shares its core with the desktop app in `../src`. Both apps use the same provider code (`src/main/providers/*`) to read follows, live status, channel pages, About sections and Stream Together, and the same parsers, page scripts, Watch Later logic, combined-channel logic, types and themes. A fix to a site reader in the desktop app fixes the phone app too.

## How the shared code runs on a phone

| Desktop (Electron) | Phone |
|---|---|
| Separate browser session per platform | One shared cookie store for all web views, read natively with `@preeternal/react-native-cookie-manager` |
| Hidden reader windows (`hidden.ts`) | Offscreen web views (`src/lib/reader.tsx`) running the same page scripts |
| `session.fetch` for Kick/Rumble | The request runs inside a page on kick.com or rumble.com, so it carries the sign-in and passes Cloudflare |
| Sign-in windows | Full-screen in-app browser (`src/ui/LoginSheet.tsx`) |
| Google sign-in through a loopback redirect | Google's iOS and Android sign-in (`@react-native-google-signin/google-signin`) |
| `streamhub.json` | AsyncStorage, same keys |

`metro.config.js` redirects the desktop providers' Electron-only imports (`../net`, `../hidden`, `../store`, `../googleAuth`, `./types`, `./pageScripts`) to the files in `src/desktop/`.

The page scripts reach web pages through `fn.toString()`. Hermes compiles functions to bytecode, so `toString()` can't give back their source. Instead, `scripts/gen-page-scripts.mjs` saves the source of everything sent into pages before every bundle: the desktop's page scripts, the shared Twitch ad filter, and its page and worker hooks. `npm test` fails if a saved copy is out of date.

## Run it

Phone builds include native code (web views, cookie access, Google sign-in), so the app runs as a development build, not in Expo Go.

```bash
cd mobile
npm install
cp .env.example .env          # optional: YouTube sign-in, see below
npm run build:dev             # cloud build of a development app; install it from the link EAS gives you
npm start                     # then open the development app on your phone
```

To build on this Mac instead:
- **iPhone:** install Xcode from the App Store, then connect the phone and run `npm run ios -- --device`. A free Apple ID works, but the app has to be reinstalled every 7 days.
- **Android:** install Android Studio, then run `npm run android`.

## Building

Builds use EAS (Expo's build service), and none of this needs a local Xcode. This folder isn't a Git repository, so the build scripts upload the whole `streamhub` folder (`EAS_PROJECT_ROOT=..`), minus what `../.easignore` leaves out, because the app imports `../src`.

```bash
npx eas-cli@latest login       # free Expo account
npm run build:android          # an .apk to install on any Android phone
npm run build:ios              # an iPhone build to install from a link
```

- **Android:** open the link on the phone, download the `.apk` and allow installing from your browser.
- **iPhone:** installing a build from a link needs an Apple Developer account ($99/year). The first `build:ios` asks you to sign in and register your iPhone. Without a paid account, see the next section.

## Building the installers on this Mac

**Android (.apk).** You need Java 17 and the Android SDK (`brew install openjdk@17` and `brew install --cask android-commandlinetools`, then install platform 37.0, build tools 37.0.0, NDK 27.1.12297006 and CMake 3.22.1 with `sdkmanager`). Then run:

```bash
npx expo prebuild --platform android --clean
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=~/Library/Android/sdk \
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
# → android/app/build/outputs/apk/release/app-release.apk
```

Release builds skip R8 code shrinking (`plugins/withoutCodeShrinking.js`), which Expo's template turns on. With shrinking on, R8 removed classes that WorkManager creates by reflection, and the app closed as soon as it opened. Release APKs are signed with StreamHub's own key (`credentials/streamhub-release.keystore`, never uploaded). Its passwords are kept in `~/.gradle/gradle.properties` as `STREAMHUB_RELEASE_*` (see `plugins/withReleaseSigning.js`). Keep both: Android only installs an update that's signed with the same key as the copy already on the phone. YouTube sign-in on Android needs an **Android** OAuth client in Google Cloud with package `app.streamhub` and this key's SHA-1. To print it, run `keytool -list -v -keystore credentials/streamhub-release.keystore -alias streamhub`.

**iPhone (.ipa).** Build with `npm run ios:device`, or press ⌘R in Xcode, then zip the built app into an `.ipa`. The app is in Xcode's DerivedData under `Build/Products/Release-iphoneos/StreamHub.app`: put it in a `Payload` folder, zip that folder, and rename the zip to `.ipa`. With a free Apple ID, the `.ipa` only runs on your own registered iPhone, for 7 days at a time. AltStore or Sideloadly can install it and re-sign it with your Apple ID.

## iPhone with a free Apple ID

No paid account is needed to put StreamHub on your own iPhone, but Xcode has to build it on this Mac.

1. Install **Xcode** from the Mac App Store and open it once to finish setup. Then run `sudo xcode-select -s /Applications/Xcode.app`.
2. In Xcode, go to **Settings → Accounts → +** and add your Apple ID. This creates a free "Personal Team".
3. Connect the iPhone by USB, unlock it, and tap **Trust**. Turn on **Settings → Privacy & Security → Developer Mode** (the phone restarts).
4. Run `npm run ios:device` and pick your iPhone. This builds the release version, which runs without this Mac. The first time, open `ios/StreamHub.xcworkspace` in Xcode, select the StreamHub target, and under **Signing & Capabilities** choose your Personal Team. Then run the command again.
5. On the iPhone, open **Settings → General → VPN & Device Management** and trust your Apple ID.

Free signing has some limits:
- The app stops opening after 7 days. Run `npm run ios:device` again to renew it; your sign-ins and settings are kept.
- If Xcode says the bundle ID `app.streamhub` is unavailable, choose your own: `STREAMHUB_IOS_BUNDLE_ID=com.yourname.streamhub npm run ios:device`.
- Free accounts can't use push notifications. StreamHub doesn't need them, because its go-live alerts are created on the phone (`plugins/withoutPushEntitlement.js` removes the push entitlement the notifications library would add).

## YouTube sign-in

**Android** signs in on youtube.com in the app, like the other platforms, so it needs no Google Cloud setup (`src/lib/youtubeWeb.ts`). Subscriptions are read from youtube.com/feed/channels and live status from the subscriptions feed. Google's Android sign-in library would also need an Android OAuth client registered with the APK's signing fingerprint, and without one it fails with "DEVELOPER ERROR". The steps below are for **iPhone**.

### iPhone

Google only allows its sign-in from apps registered in a Google Cloud project. Use the project you set up for the desktop app (see `../README.md`), with the YouTube Data API and the `youtube.readonly` scope already added.

1. Go to **Google Auth Platform → Clients → Create client**:
   - **iOS:** bundle ID `app.streamhub`. Copy the client ID into `.env` as `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
   - **Android:** package name `app.streamhub`, plus the SHA-1 fingerprint of your signing key. For EAS builds, run `npx eas-cli@latest credentials -p android` to see it. Android needs no client ID in the app; Google matches it by package and fingerprint.
2. For EAS builds, add the same variable to the project: `npx eas-cli@latest env:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value <id> --environment preview --environment development --visibility plaintext`.
3. Rebuild. In StreamHub, go to **Settings → YouTube → Sign in**.

## Sync with Google

**Settings → Sync with Google** shares platform sign-ins, settings, follows and Watch Later with the desktop app and other phones. It uses the desktop's file and format (`../src/shared/sync.ts`), via `src/lib/sync.ts`. It needs the Google Drive API enabled and the `drive.appdata` scope on the consent screen (see `../README.md` → Sync with Google).

- **iPhone:** uses the iOS client above. YouTube and Sync share one Google sign-in, and each asks for its own permission. Turning one off keeps the other signed in.
- **Android:** needs an **Android** OAuth client (**Google Auth Platform → Clients → Create client → Android**). Use package name `app.streamhub` and the SHA-1 fingerprint of the key that signs the APK. For the local release key (`credentials/streamhub-release.keystore`), that's `A2:9D:39:B8:FF:9C:B0:E1:63:3F:81:0D:40:7B:E0:D4:D8:97:3C:F5`. Without it, Sync shows a message saying it isn't set up for Android yet. YouTube on Android keeps signing in on youtube.com, which needs no client.

## How it differs from the desktop app

- **Go-live alerts:** while the app is open, live status is checked every 1–2 minutes, as on the desktop. In the background the phone decides when StreamHub may check: Android about every 15 minutes, iOS less often and at times it picks.
- **No multi-view.** The phone app doesn't have it, because two embedded players couldn't play at the same time.
- **No menu-bar app or keyboard shortcuts:** phones have no equivalent.
- **Twitch ad blocking** uses the same filter as the desktop (`../src/shared/twitchAdFilter.ts`), but it runs inside the Twitch player page, because a phone web view's network traffic can't be filtered. `src/player/twitchAdHook.ts` wraps the page's `fetch()` and builds every worker the player creates with the filter first. The Twitch player starts its video worker from a temporary blob: address that it frees right away, so the hook reads that script synchronously when the worker is created; loading it later broke playback. When the player fetches its own playlists (Android), ad breaks get the desktop's treatment: switch to an ad-free copy, else cut the ads. On iPhone the player hands the stream to the system's video player, whose requests no page can see. There, StreamHub asks for an access-token kind that's usually served without ads as soon as the page opens, and the player starts on that stream. Ads that still appear in it can't be cut. The app's log shows which case applies: `[twitch ads] filtering in: worker | page | native`.
- **Rumble ads** are removed in three ways (`src/player/rumbleAds.ts`). The app fetches the embed page and empties its built-in ad schedule and pause ads. In the player, Google's ad SDK and Rumble's pause-ad script are kept from loading, and requests to Rumble's ad server get an empty ad response.
- **YouTube chat** signs in on youtube.com in the app, like the other platforms, after the Google sign-in that reads your subscriptions. Google refuses sign-in from pages that look like an app's embedded browser, so these pages identify as the phone's own browser. If the chat page asks you to sign in, its button opens the same in-app sign-in.
- **Wallpapers** (Settings → Wallpaper) go behind the Live tab instead of a home screen. Photos are copied into the app, scaled to at most 2048 px. Each photo's brightness is measured once, when you add it, the same way as on the desktop (a 32×32 canvas, run in the offscreen page reader), and decides whether text over it is dark or light.
- **Picture-in-picture** works for every player. On iPhone, the video itself goes into picture-in-picture. Android has no picture-in-picture for a web page's video, so the whole app shrinks into the small window (`modules/streamhub-pip`, a small local native module). While it's there, the screen shows only the player, which stays mounted so the stream doesn't reload. On Android 12 and later, leaving the app while something plays enters picture-in-picture automatically.

All desktop features have now been ported; the menu-bar app and keyboard shortcuts have no phone equivalent.

## Scripts

- `npm start`: development server for the development build
- `npm test`: the desktop's parser and ad-filter tests, run as the phone runs them, plus tests that inject the ad-blocking script into a simulated Twitch player page and worker
- `npm run typecheck`, `npm run lint`
- `npm run build:android` / `build:ios` / `build:dev`: EAS builds

## Layout

```
src/app          screens (Expo Router): (tabs)/ Live, Channels, Settings; watch/[key], playlist, combine
src/desktop      phone versions of the desktop's Electron-only modules (swapped in by metro.config.js)
src/lib          hub (sync, polling, alerts), page reader, background check, channel-page cache, settings, wallpapers, screen state
src/player       Twitch and Rumble ad blocking inside the player pages
modules/streamhub-pip  Android picture-in-picture for the app window (Kotlin)
src/ui           player, chat, channel page, About, menus, sign-in screen, theme
```
