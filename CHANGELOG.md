# Changelog

What changed in each version of StreamHub. Each version's downloads are on its [GitHub Release](../../releases).

## [1.0.13]

### New
- **Chat messages send the moment you press Enter.** The chat box clears right away and you can type the next message while this one goes out. StreamHub now connects to the chat when it opens rather than on your first message, so nothing waits on that either. If a platform turns a message down (slow mode, followers-only, signed out), the reason shows and your message comes back in the box.
- **Fewer buttons at the top right.** **Customization** (the palette) holds the color themes and the home screen wallpapers, with a switch between them. **Settings** (the gear) holds the menu bar (or system tray) app, keyboard shortcuts and updates.
- **Phones: the stream and chat switchers share one row.** On a combined channel, the stream's switcher is on the left and the chat's on the right, which gives the chat a little more room. ([#12](../../issues/12))
- **Combined channels in picture in picture.** Switching the stream to another platform while it plays in picture in picture now moves the floating window to the new source, in the same place on screen. Before, the old source kept playing in the window and the new one started in the app.

### Fixed
- **iPhone: chatting on YouTube streams.** YouTube's chat said *Sign in to chat* with no message box. StreamHub now puts its own message box under the chat, which sends as the YouTube account connected under Accounts. If you connected YouTube before this version, the first message asks Google once for permission to chat. ([#11](../../issues/11))
- **Mute in picture in picture now stays on.** Muting a Twitch stream in the floating window unmuted it again a few seconds later. ([#14](../../issues/14))
- **Videos skipping and the player's controls staying on screen** (seen on Windows in full screen). StreamHub clicks a player to start it when it won't start by itself, and it could also do that later on, during an ad in the middle of a YouTube video. That paused or skipped the video, and left the player thinking the mouse was over it, so its controls never hid. It now only does it before the video starts. ([#13](../../issues/13))

## [1.0.12]

### New
- **One chat box for every platform.** Twitch, Kick, Rumble and YouTube chats now share StreamHub's own message box, which sends as your account on that platform. Long messages wrap and the box grows upward as you type, so you can see everything you've written. If a platform turns a message down for a reason StreamHub doesn't know, **Use its box** brings back the platform's own message box.
- **An emote picker.** The smiley button in the chat box opens the channel's emotes, then the platform's own and emoji, with search. Subscriber-only emotes are grayed out with a lock. On YouTube, the picker shows the channel's member emotes under the channel's name, YouTube's own emotes, and emoji. The member emotes always show a lock, because YouTube doesn't tell apps which ones you've unlocked, but members can still pick and send them.
- **Twitch channel points.** A button floats above the chat box with your points for the channel. When a bonus is ready, it glows: press it to collect.

### Fixed
- **YouTube chat:** sending a message failed with *YouTube said no: HTTP 404*. ([#9](../../issues/9))

## [1.0.11]

### New
- **Chat on YouTube streams as your connected account.** YouTube's chat used to say *Sign in to chat* even with YouTube connected, and its sign-in link opened your browser instead. StreamHub now puts its own message box under the chat, which sends as the YouTube account connected under Accounts. If you connected YouTube before this version, connect it once more: StreamHub now also asks permission to send chat messages. ([#9](../../issues/9))
- **Download iPhone updates from the app.** When a new version is out, the iPhone's update notice offers **Download**, then **Save**, which opens the share sheet so you can save the app file to Files (Downloads, say) and sideload it as before. ([#10](../../issues/10))

### Fixed
- **Picture in picture with Rumble streams.** It never opened: Rumble's player only starts after a click on its play button, so the floating window waited, then gave up. It now presses play itself. This also fixes picture in picture when the window is minimized while a Rumble stream plays. ([#8](../../issues/8))
- **Android:** full-screen video in landscape is now really centered whichever way the phone is turned. On phones with the camera hole on one side, the video was still pushed over by the hole's width one way round. ([#6](../../issues/6))

## [1.0.10]

### New
- **A queue on iPhone and Android.** Line up videos to play one after another, as on the desktop. On a channel page, press and hold a video and pick **Add to queue**, or tap the **+** under the video that's playing. The queue sits on Home next to Watch Later. Its page lets you play from any video, reorder or remove them, or clear it. ([#4](../../issues/4))
- **Playlists as a grid on iPhone and Android.** Once you have more than one playlist (Watch Later, the queue, imported YouTube playlists), Home shows them as a grid of tiles instead of stacked rows. A tile opens the playlist's page with its videos: **Play** starts from the top, or tap a video to start there.
- **A floating dock on Android.** Settings → Dock: keep Android's navigation bar, or switch to a rounded dock that floats over the screen, like the iPhone's.

### Fixed
- **Windows:** opening StreamHub while it was running in the system tray started a second copy. Now only one copy runs: opening it again brings back the window that's already running. ([#3](../../issues/3))
- **Steam version:** the controller wasn't detected in Game Mode. StreamHub now reads controllers directly from the system when the browser engine doesn't pass them on, and no longer ignores the controller when Game Mode doesn't count the app as focused.
- **Steam version:** Updates is now at the top of Settings.
- **iPhone and Android:** Back while a video plays on a channel page now closes the video and keeps you on the channel, instead of jumping back to the Channels tab. ([#7](../../issues/7))
- **iPhone and Android:** turned sideways, a video on a channel page, in Watch Later, the queue or a playlist now fills the screen and shows the whole picture. It was too zoomed in, with its bottom cut off. ([#5](../../issues/5))
- **Android:** full-screen video in landscape is centered whichever way the phone is turned. One way round, it sat against one side next to a wide black bar. ([#6](../../issues/6))
- **Android:** the ring around live channels' pictures is round again, not square.
- **iPhone and Android:** in landscape with the chat hidden, the button to bring the chat back is now on the right, where the chat opens.
- **Android:** Settings explains which TVs the cast button can reach: Google Cast devices (Chromecast, Google TV, TVs with Chromecast built in). Apple TVs, Macs and Fire TV don't accept Google Cast.

## [1.0.9]

### New
- **Send feedback.** A new Feedback button (the speech bubble at the top right) lets you report a bug or suggest a feature. Write it in the app and it opens on GitHub with everything filled in: the version, your system and, for bugs, the recent app log, with sign-in tokens, emails and your user name taken out. Check it over and submit it there (a free GitHub account is needed). In Big Picture it's in Settings, as a QR code that opens the form on your phone. On iPhone and Android it's in Settings too.
- **Nothing and Pixel themes.** They restyle the whole app after each phone's own interface, not just its colors. **Nothing Dark** and **Nothing Light**: black or white with red only for what's live or on, dot-matrix headings, counts and header icons, capital monospaced labels, inverted pill tabs and buttons, Nothing's red toggle, and dotted rules over a faint dot grid. **Pixel Dark**, **Pixel Light**, **Pixel Mint** and **Pixel Blossom** follow Material 3 Expressive: Google Sans Flex, Material Symbols icons (filled when selected), a pill indicator behind the selected tab, Material switches with a check, segmented buttons, a bar-handle slider, settings as separate rounded rows, and tonal cards and dialogs. On iPhone and Android, titles take the theme's font, Pixel uses Material icons, and buttons and cards take the theme's shapes. Find them under *Styled themes*, next to OGX.
- **A launch animation on iPhone and Android**, in Big Picture's colors. Instead of a still icon, the app opens on near-black, a violet-blue glow blooms behind **StreamHub**, and a wave of blue rises from the bottom, fills the screen, then sweeps on up and away to reveal the app. With Reduce Motion on, it just fades.
- **Cast on Android.** The cast button now works on Android: it finds Chromecasts and Google TVs on your Wi-Fi and sends Twitch, Kick and Rumble streams and videos to the TV. The phone shows what's playing where, with *Stop casting*. YouTube only lets its own app cast its videos, so for YouTube StreamHub offers to open the video in the YouTube app. iPhone keeps AirPlay.

### Fixed
- **Windows:** the whole app could get stuck in full screen, with no way out but closing it. This happened when the queue (or Watch Later) auto-played into the next video while a video was full screen, or when leaving full screen with Esc. Now the finished video leaves full screen before the next one starts, and as a safeguard the window always leaves full screen when a player closes or Esc is pressed.
- **Windows:** Twitch kept re-syncing every few seconds and asking for a passkey again and again. The hidden pages StreamHub reads your follows from can no longer ask for a passkey (that's for the sign-in window). And when a platform's follows can't be read, StreamHub now waits longer before each retry (1, 2, 5, 15, then 30 minutes) instead of retrying every 15 seconds, and says so on the account.
- **Sign-ins no longer run out.** Platforms signed in through their websites (Twitch, Kick, Rumble) could show *Session expired* after a while. StreamHub now opens each signed-in site in the background at launch and every 12 hours, which renews its sign-in as using it in a browser does, and keeps sign-in cookies across restarts. Before reporting an account as expired, it renews the session and retries. With Sync with Google, a sign-in renewed on one device goes to your other devices too, so none of them is left with an outdated copy.
- **Windows and Linux:** the default keyboard shortcuts are now **Ctrl+Alt** combinations (Ctrl+Alt+C for the Channels panel, Ctrl+Alt+S for the sidebar, and so on), as ⌃⌘ ones are on Mac. They used Ctrl+Win, and Windows keeps many of those for itself. Shortcuts you set yourself stay as they are.
- The platform buttons at the top of the sidebar now share the full width, so one or two signed-in platforms no longer sit bunched in the corner.
- **Steam version:** Sync with Google and YouTube now sign in with the usual **Sign in** button, as the other platforms do (sign-in on your phone isn't available).

## [1.0.8]

### New
- **A new Home.** Home and the Channels tab are now one page. Watch Later and your imported YouTube playlists sit side by side along the top, as carousels you can scroll through. The three most-watched live channels come next, numbered, and everyone else who's live fills a grid of tiles below them. Every channel you follow, live or not, is in a **Channels** panel that slides out from the right edge, with search and platform filters. Open it from anywhere with **⌃⌘C** (Ctrl+Win+C on Windows), or set your own shortcut in Keyboard shortcuts.
- **The Steam version is all Big Picture.** The copy in your Steam library stays in Big Picture, with **Quit** in place of Exit, and a new **Settings** screen (the gear, or Start). It covers accounts, Sync with Google, YouTube playlists, Twitch ad blocking, go-live alerts and updates, all with the controller. Google sign-ins (Sync and YouTube) happen on your phone: scan the QR code, enter the code shown and approve. Other platforms' sign-ins come over through Sync from your phone or computer, or you can sign in on the Deck. Big Picture on Mac and Windows gets the same Settings screen.
- **What's new, any time.** The Updates button always shows what's new in the version you have, with a link to every version's notes.
- **In-app updates.** StreamHub checks for new versions on launch and every few hours. Click **Update**, and the app downloads the new version and restarts into it. No installer needed on Mac, Windows, Linux (AppImage) or Steam Deck. Android downloads the update and opens the system installer. iPhone shows when a new version is out. There's also a new Updates section in Settings: *Check now*, auto-check on or off, and what's new.
- **Theater mode in Watch Later and the Queue.** It hides the sidebar and the list so the video gets the whole window. Esc exits.
- **Import your YouTube playlists.** Settings → YouTube playlists → *Import playlists…* lists every playlist on your account (plus Liked videos), so you pick the ones you want and confirm. They show on Home under *Your playlists* (a carousel like Watch Later's), play like Watch Later (theater mode included), keep up with changes on YouTube, and come over to your other devices with Sync with Google. They're on iPhone and Android too.
- **More themes.** Dark: Ocean, Grape, Slate, Ember and Arctic. Light: Peach, Sage, Blush and Cloud.

### Faster and smoother
- **Live status loads much sooner.** Twitch takes about 0.3 seconds instead of 5.6: it asks Twitch's API instead of loading its Following page. YouTube takes about 2 seconds instead of 7–9: it checks many channels at once, and shows who's live before its viewer counts arrive. Your saved sign-ins are read while the app starts instead of when they're first needed. On phones, Twitch's background check gets the same speedup.
- **The app starts lighter:** the video player library and Big Picture load the first time they're used, which makes the app's startup code about 60% smaller.
- **Cleaner motion:** menus, popovers and dialogs pop in, messages rise in, screens fade in, and thumbnails fade in as they load. All of it respects the system's reduce-motion setting. Avatars load as they scroll into view.

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
