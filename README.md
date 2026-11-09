# StreamHub

A Twitch-style desktop app that puts the channels you follow on **Twitch, YouTube, Kick and Rumble** in one sidebar, with profile pictures and live status. It has a player with chat, go-live notifications, a 2–4 stream multi-view, and recent videos for offline channels.

No developer keys, client IDs or `.env` file. You sign in on each platform's own website inside the app, and StreamHub reads the channels you follow from your signed-in session.

## Install

Download the installer for your device from the **[latest release](../../releases/latest)**. Each one works on every processor type. What changed in each version is in [CHANGELOG.md](CHANGELOG.md).

| Device | File |
|---|---|
| Any Mac (Apple silicon or Intel) | `StreamHub-<version>.dmg` |
| Windows 10 or 11 (x64 or ARM64) | `StreamHub-Setup-<version>.exe` |
| Linux (x64) | `StreamHub-<version>-x86_64.AppImage` |
| Steam Deck / SteamOS, into your Steam library | `StreamHub-<version>-Steam-Installer.sh` |
| Android | `StreamHub-<version>.apk` |

Once StreamHub is installed, it **updates itself**: when a new version is out, an **Update** button appears at the top right. Click it, and StreamHub downloads the new version and restarts into it. The Updates button (the arrow at the top right) has *Check now*, an on/off switch for the automatic checks, and what's new in the version you have. On Android the update opens the system installer; the first time, Android asks you to allow *Install unknown apps* for StreamHub. iPhone shows that a new version is out, and you install it as before. The iPhone app isn't on the Releases page: it's signed with a free Apple ID for one iPhone, built on the owner's Mac and installed with Xcode or a sideloading tool (such as AltStore or Sideloadly), and it has to be re-signed every 7 days.

The Mac app is universal: it runs natively on both Apple silicon and Intel. The Windows installer carries both an x64 and an ARM64 build and installs the one that matches your PC.

**Mac:** open the `.dmg` and drag StreamHub into Applications. The app isn't notarized by Apple, so the first time you open it macOS says it can't verify the developer. Open **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to the StreamHub message, then confirm. After that it opens normally.

**Linux / SteamOS:** the AppImage is the whole app in one file, with nothing to install. Put it somewhere it'll stay (on a Steam Deck, in Desktop Mode, e.g. your home folder), right-click it → **Properties → Permissions → Is executable** (or `chmod +x StreamHub-*-x86_64.AppImage`), then double-click it.

**Steam Deck / Steam Big Picture:** use `StreamHub-<version>-Steam-Installer.sh` (it contains the app). In Desktop Mode, right-click it → **Properties → Permissions → Is executable**, then double-click it (or run `bash StreamHub-*-Steam-Installer.sh` in Konsole). It installs StreamHub in your home folder (`~/.local/share/StreamHub`) and your app menu, and adds it to your Steam library with its own artwork, set to open in Big Picture mode. Steam closes for a moment while it's added (Steam rewrites its library when it quits) and opens again. Then find it in Game Mode under **Library → Non-Steam**. StreamHub updates itself from then on (in Game Mode, *Install and close* installs the update and closes; start it again from your library). Running a newer installer also updates it. Run it with `--uninstall` (or `~/.local/share/StreamHub/uninstall.sh`) to remove it. If it doesn't start from Steam, `~/.local/share/StreamHub/last-run.log` says why. Building it: `npm run dist:steam` (scripts/steam).

**Windows:** run the installer and choose where to install. The installer isn't code-signed, so Windows SmartScreen may show "Windows protected your PC". Click **More info → Run anyway**. StreamHub gets Start menu and desktop shortcuts, and can be removed from **Settings → Apps**.

## Watching

- **Home:** Watch Later is at the top as a carousel (on the left, with your imported YouTube playlists in a second carousel on the right, once you've imported some). Scroll through either one with the arrows, the scroll wheel or ←/→. Below them are the three most-watched live channels right now, then everyone else who's live. The **Channels** tab on the right edge slides out a panel with every channel you follow, live or not, with search and platform filters. ⌃⌘C (Ctrl+Win+C on Windows, changeable in Keyboard shortcuts) opens and closes it from anywhere. Esc or a click outside closes it too.
- **Theater mode:** the rectangle button under a live stream, or under a video in Watch Later, the queue or a YouTube playlist, hides the sidebar and the chat or list so the player fills the window. It stays on from video to video until you turn it off with the same button or **Esc**. Showing chat turns it off.
- **Queue:** right-click a past stream, video or clip → **Add to queue** to line it up. You stay where you are, so you can add several. Open the **Queue** tab to play them one after another.
- **YouTube playlists:** Settings → YouTube playlists (the list button at the top right) → **Import playlists…** shows every playlist on your YouTube account, plus Liked videos. Tick the ones you want and click **Import**. They appear on Home under *Your playlists*, play like Watch Later, catch up with changes on YouTube every few hours (or with Refresh), and come over to your other devices with Sync with Google. YouTube doesn't let apps read your Watch Later list. Needs YouTube connected in Accounts.
- **Themes** (the palette button): a colorway colors the whole app, including the sidebar, search bars, buttons and menus. There are neutral Light and Dark themes and 22 colorways. *Use system* follows your computer's light or dark mode, with the translucent Mac window.
- **Picture in picture:** a small window that floats above your other apps. Hover over it for the controls: close and move-to-the-side (top left); speed, sound and back to StreamHub (top right); back and forward 15 seconds and play/pause (middle); time and a scrubber (bottom). Drag it anywhere, resize it from its edges, and double-click it to return to StreamHub. Live streams have no seeking controls. It resumes playback by itself if a site pauses a video you didn't pause, for example YouTube's "Continue watching?".
- **Picture in picture when minimized** (Settings → Playback, off by default): minimizing or hiding StreamHub while something plays moves it into picture in picture, and it moves back when you return. On macOS, ⌘H hides every StreamHub window, including picture in picture, so use ⌘M or the yellow button instead.
- **Big Picture mode** (Mac and Windows): the controller button at the top right turns StreamHub into a full-screen, TV-style app for the couch. Tabs for Live, Following, Watch Later and the queue; channel pages with past streams, videos and clips; and a full-screen player with chat at the side. Use a game controller (Xbox, PlayStation and other standard controllers): d-pad or left stick to move, A to choose, B to go back, LB/RB to switch tabs. In the player: A pauses, left/right skip 10 seconds, LT/RT skip 30, X shows chat, and LB/RB switch platform on a combined channel, or go to the previous or next video in Watch Later and the queue, which also move on by themselves. The arrow keys, Enter, Esc and Q/E work too, and so does the mouse. B on the home screen (or Exit) leaves Big Picture. Press **Y** (△ on PlayStation) on any stream or video, or right-click it, for a menu: save it to Watch Later, add it to the queue, or go to its channel. Combined channels show once, and their page has a button per platform (or LB/RB) to switch between them. **Search** (the magnifier tab) finds followed channels by name and live streams by title or game: type with a keyboard, or press A on the search box (or the Keyboard button next to it) for an on-screen keyboard, where X deletes, Y adds a space and B closes it. Chat in Big Picture is for reading (its message box is hidden). With chat open on a live stream, **Chat on phone** (or Y) shows a QR code: scan it with your phone's camera to open that chat in your phone's browser and type there. **Settings → Playback → Open in Big Picture at startup** starts StreamHub in Big Picture.
- **Combined channels:** a live combined channel has buttons to switch the stream and the chat between its members' platforms. A member on a platform you aren't signed in to on this computer (for example when follows arrived by Sync with Google) is still checked for live status from that platform's public pages, so the switch buttons still appear.

## YouTube sign-in setup

YouTube uses Google's official sign-in for desktop apps: StreamHub opens Google's page in your web browser, and Google gives the app read-only access to your YouTube account. Google requires that the app is registered in a Google Cloud project. It's free and takes about 5 minutes, and only needs to be done once by whoever builds the app.

1. Go to https://console.cloud.google.com, sign in, and create a project (for example "StreamHub").
2. **APIs & Services → Library**: search for **YouTube Data API v3** and click **Enable**.
3. **Google Auth Platform** (OAuth consent screen): click **Get started**. App name `StreamHub`, your email as the support email, audience **External**, then finish.
4. **Data access → Add or remove scopes**: add `https://www.googleapis.com/auth/youtube.readonly` and save.
5. **Audience**: choose one.
   - **Publish app** (recommended for personal use): sign-in shows "Google hasn't verified this app". Click **Advanced → Go to StreamHub** to continue. You stay signed in.
   - **Testing**: add your Google account under **Test users**. No warning, but Google signs you out every 7 days.
6. **Clients → Create client**: application type **Desktop app**, name `StreamHub`, then **Create**. Copy the **Client ID** and **Client secret**.
7. In the project folder, copy `.env.example` to `.env` and paste them in:
   ```
   MAIN_VITE_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   MAIN_VITE_GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```
8. Rebuild (`npm run dist:win` / `npm run dist:mac`). In StreamHub, open **Accounts → YouTube → Connect**.

A desktop app's "client secret" isn't actually secret (Google ships it in every copy of the app by design); the sign-in is protected by PKCE. YouTube's free quota is 10,000 units a day per project; StreamHub uses about 1 unit per live check (every 2 minutes) plus 1 per 50 subscriptions when syncing.

## Steam Deck sign-in

The Steam copy (from the Steam installer) is Big Picture only: there's no usual window, and **Settings** (the gear at the top right, or Start) covers accounts, Sync with Google, YouTube playlists, playback, updates and quitting. Google sign-ins happen on your phone. **Sign in with phone** shows a QR code for google.com/device and a short code. Enter the code on your phone, approve, and the Deck carries on by itself. Twitch, Kick and Rumble sign-ins come over through Sync with Google from StreamHub on your phone or computer, or you can sign in on the Deck with **Sign in**.

Signing in on a phone uses Google's flow for TVs, which needs a second OAuth client in the same Google Cloud project:

1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) for StreamHub's project.
2. **Create credentials → OAuth client ID**, application type **TVs and Limited Input devices**, name it (e.g. *StreamHub TV*), then **Create**.
3. Put its client ID and secret in `.env` as `MAIN_VITE_GOOGLE_TV_CLIENT_ID` and `MAIN_VITE_GOOGLE_TV_CLIENT_SECRET`, then build the Steam installer (`npm run dist:steam`).

It uses the same consent screen and scopes (YouTube read-only, Drive app folder) as the desktop client, so nothing else changes. To try the Big Picture only mode on another computer, start StreamHub with `--big-picture-only`.

## Sync with Google

**Accounts → Sync with Google** keeps your Twitch, YouTube, Kick and Rumble sign-ins, settings, followed channels, combined channels, muted alerts and Watch Later the same on every computer and phone with StreamHub. Signing in with Google on a new device signs it in to your platforms too. Everything is stored in one file (`streamhub-sync.json`) in your Google Drive's hidden app folder. Only StreamHub can see that folder, and it doesn't appear in your Drive. The format and merge rules are in `src/shared/sync.ts`.

It uses the same Google Cloud project and OAuth client as YouTube sign-in (above), plus two more steps:

1. **APIs & Services → Library**: search for **Google Drive API** and click **Enable**. Without it, Sync shows "Google Drive API isn't turned on".
2. **Data access → Add or remove scopes**: add `https://www.googleapis.com/auth/drive.appdata` and save. Sync is a sign-in of its own, so turning it off leaves YouTube connected, and the other way round.

- **Merging:** each setting and each platform's follows keeps the time it last changed, and the newer change wins, so changes made on different devices all survive. Watch Later merges item by item, and removing a video on one device removes it everywhere. A new device takes on the synced settings.
- **Logins:** each platform's sign-in cookies are saved in the sync file. They're as private as your Google account: anyone who can get into it could use them. The newest sign-in or sign-out wins. A platform you were already signed in to on a device before turning sync on keeps that sign-in. Some sites tie a sign-in to the device it was made on. If a synced login doesn't stick, signing in on that device once fixes it. YouTube's own sign-in (for subscriptions) is per device, so only YouTube's web cookies, which chat uses, are synced.

## Setup

```bash
npm install
node node_modules/electron/install.js   # only needed if npm blocked Electron's download step
npm run dev
```

Then open **Accounts** and connect each platform.

## How each platform connects

Each platform has its own persistent browser session (`persist:<platform>`). The sign-in window, background reads, players and chat all share it, so you sign in once and can chat as yourself.

| Platform | Sign-in | Follows | Live status |
|---|---|---|---|
| Twitch | twitch.tv/login | Your *Following → Channels* page, read in a hidden window | Your *Following → Live* page (every 2 min) |
| YouTube | Google sign-in in your web browser (read-only access) | YouTube Data API (`subscriptions`) | Each channel's `/live` link, checked with the Data API (every 2 min) |
| Kick | kick.com | `kick.com/api/v2/channels/followed` with your session | Same response (every 1 min) |
| Rumble | rumble.com | The "Following" section of Rumble's navigation menu | Same menu (every 2 min) |

The page readers live in `src/main/providers/pageScripts.ts` and `parsers.ts`. They key off links, images and text rather than CSS class names, but any site redesign can still break them. When a read fails, the Accounts page shows the error and a **Reconnect** button.

Known limits:
- YouTube shows one live stream per channel (the one its `/live` link leads to), even if a channel runs two at once.
- In-app YouTube chat is read-only: you sign in through your browser, so the app's player isn't signed in to Google.
- Some Twitch channels show their login name instead of their styled display name.

## Scripts

- `npm run dev`: run the app with hot reload
- `npm test`: parser unit tests (Rumble HTML, Kick JSON, YouTube page data and RSS)
- `npm run typecheck`
- `npm run dist:mac`: build the universal Mac installer (`dist/StreamHub-<version>.dmg`)
- `npm run dist:win`: build the Windows installer for x64 and ARM64 (`dist/StreamHub-Setup-<version>.exe`); works from a Mac too
- `npm run dist`: build for the current platform
- `npm run release`: publish the GitHub Release for the version in `package.json`, with the notes from its `CHANGELOG.md` section and every download attached (dmg, Mac zip, Windows setup, AppImage, Steam installer, APK; not the iPhone app). The in-app updater reads these releases, so keep the file names. Bump the version, add a CHANGELOG section and build everything first.

Updates (`src/main/updater.ts`) come from the latest GitHub Release of the repo named in `src/shared/release.ts`. Because the builds are ad-hoc signed, StreamHub installs updates itself rather than with Electron's updater: on a Mac it swaps in the new app from the release's `-mac.zip`; on Windows it runs the new Setup silently; on Linux it swaps in the new AppImage (or, for the Steam installer's copy, unpacks it into `~/.local/share/StreamHub/app`).

Builds aren't signed with an Apple Developer ID or a Windows code-signing certificate, which is why the first launch needs the steps under Install. Mac builds get an ad-hoc signature (`"identity": "-"` in `package.json`), because Apple silicon refuses to run apps with no valid signature. To sign and notarize properly, add the certificates and replace that setting; see https://www.electron.build/code-signing.

## Layout

```
src/shared     types, embed/chat URL builders
src/main       Electron main: hub.ts (sync, polling, notifications), hidden.ts (hidden page reader), providers/*
src/preload    typed IPC bridge (window.api)
src/renderer   React UI: Sidebar, Home, Watch (player + chat + channel page), MultiView, Accounts
```

The iPhone and Android app lives in `mobile/` and reuses the providers, parsers and shared code above. See `mobile/README.md`.
