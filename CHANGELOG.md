# Changelog

What changed in each version of StreamHub. Each version's downloads are on its [GitHub Release](../../releases).

## [1.0.8]

### New
- **A new Home.** Home and the Channels tab are now one page. Watch Later and your imported YouTube playlists sit side by side along the top, as carousels you can scroll through. The three most-watched live channels come next, numbered, and everyone else who's live fills a grid of tiles below them. Every channel you follow, live or not, is in a **Channels** panel that slides out from the right edge, with search and platform filters. Open it from anywhere with **⌃⌘C** (Ctrl+Win+C on Windows), or set your own shortcut in Keyboard shortcuts.
- **The Steam version is all Big Picture.** The copy in your Steam library stays in Big Picture, with **Quit** in place of Exit, and a new **Settings** screen (the gear, or Start). It covers accounts, Sync with Google, YouTube playlists, Twitch ad blocking, go-live alerts and updates, all with the controller. Google sign-ins (Sync and YouTube) happen on your phone: scan the QR code, enter the code shown and approve. Other platforms' sign-ins come over through Sync from your phone or computer, or you can sign in on the Deck. Big Picture on Mac and Windows gets the same Settings screen.
- **What's new, any time.** The Updates button always shows what's new in the version you have, with a link to every version's notes.
- **In-app updates.** StreamHub checks for new versions on launch and every few hours. Click **Update**, and the app downloads the new version and restarts into it. No installer needed on Mac, Windows, Linux (AppImage) or Steam Deck. Android downloads the update and opens the system installer. iPhone shows when a new version is out. There's also a new Updates section in Settings: *Check now*, auto-check on or off, and what's new.
- **Theater mode in Watch Later and the Queue.** It hides the sidebar and the list so the video gets the whole window. Esc exits.
- **Import your YouTube playlists.** Settings → YouTube playlists → *Import playlists…* lists every playlist on your account (plus Liked videos), so you pick the ones you want and confirm. They show on Home under *Your playlists* (a carousel like Watch Later's), play like Watch Later (theater mode included), keep up with changes on YouTube, and come over to your other devices with Sync with Google. They're on iPhone and Android too.
- **More themes.** Dark: Ocean, Grape, Slate, Ember and Arctic. Light: Peach, Sage, Blush and Cloud.

### Fixed
- Adding the first video to an empty queue no longer starts playing it and takes you away from the channel. Videos are just added: a message confirms each one, with a *Play queue* button.
- On Windows (and Linux) the menu bar settings are now called **System tray**.
- Themes now color the whole app. The light themes were nearly white, and the sidebar, channel search bars, buttons and popovers stayed gray or white in every theme. Light themes were re-tuned to match.
- Android now uses a proper version code, so each update installs over the last.

## [1.0.7]

### New
- **Big Picture mode** (Mac, Windows, Linux). A full-screen, TV-style interface you can use entirely with a game controller. It has search (with an on-screen keyboard), combined channels, a platform switcher, a Y-button menu (Watch Later, queue, go to channel), read-only chat with a QR code for chatting from your phone, an intro animation, and an *Open in Big Picture at startup* setting.
- **Theater mode** for live streams: no sidebar, no chat.
- **New picture-in-picture window** on Mac and Windows, with iPhone-style controls: ±15 s, speed, volume, back to the app, and a scrubber.
- **Linux AppImage** and a **Steam Deck / SteamOS installer** that adds StreamHub to your Steam library with artwork. It opens in Big Picture from Game Mode.

### Fixed
- Picture in picture no longer pauses after a while.
- *Picture in picture when minimized* is now a setting, off by default.
- Combined channels on Windows can switch video and chat sources while live, even on platforms you aren't signed in to.
- On phones, the chat moves above the keyboard while you type.

## [1.0.6]

### New
- **Sync with Google.** Settings, follows, combined channels, Watch Later and platform sign-ins stay in step across computers and phones, through a private folder in your Google Drive.
- **Video queue:** line up past streams and videos to play one after another.
- **Auto picture in picture** when the app is minimized or hidden.
- **YouTube chapters**, and resuming videos where you left off.
- *Combine with another channel* starts with the channel's name filled in.
- Windows key names in keyboard shortcuts.

## [1.0.5]

### New
- **iPhone and Android apps**, with the desktop app's features: Twitch ad blocking, Watch Later, wallpapers, multi-platform follows, and picture in picture on Android.
