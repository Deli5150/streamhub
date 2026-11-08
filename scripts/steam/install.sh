#!/usr/bin/env bash
# StreamHub __VERSION__ for SteamOS (Steam Deck) and other Linux: installs the app in your home
# folder, adds it to the app menu, and adds it to your Steam library, where it opens in Big Picture
# mode, with its own artwork. Built by scripts/steam/build-installer.mjs; the app, its artwork and
# the Steam helper are packed onto the end of this file.
#
#   Install or update:  run this file (double-click it in Desktop Mode, or ./<this file>)
#   Uninstall:          run it with --uninstall, or ~/.local/share/StreamHub/uninstall.sh
set -uo pipefail

VERSION='__VERSION__'
PAYLOAD_LINE=__PAYLOAD_LINE__
DIR="${HOME}/.local/share/StreamHub"
LAUNCHER="${DIR}/streamhub"
DESKTOP="${HOME}/.local/share/applications/streamhub.desktop"
SELF="$(readlink -f "$0")"

# ---------- Talking to you: dialogs when double-clicked, text in a terminal ----------

has() { command -v "$1" >/dev/null 2>&1; }
gui() { [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && ! [ -t 1 ]; }
note() {
  if gui && has kdialog; then kdialog --title StreamHub --msgbox "$1"
  elif gui && has zenity; then zenity --info --title StreamHub --width 420 --text "$1"
  else printf '\n%s\n' "$1"; fi
}
fail() {
  if gui && has kdialog; then kdialog --title StreamHub --error "$1"
  elif gui && has zenity; then zenity --error --title StreamHub --width 420 --text "$1"
  else printf '\nError: %s\n' "$1" >&2; fi
  exit 1
}
confirm() {
  if gui && has kdialog; then kdialog --title StreamHub --yesno "$1"
  elif gui && has zenity; then zenity --question --title StreamHub --width 420 --text "$1"
  else
    local answer
    read -r -p "$1 [Y/n] " answer
    [[ ! "${answer}" =~ ^[Nn] ]]
  fi
}
busy() { if gui && has kdialog; then kdialog --title StreamHub --passivepopup "$1" 8 >/dev/null 2>&1 & else printf '%s\n' "$1"; fi; }

# ---------- Steam ----------

steam_running() { pgrep -x steam >/dev/null 2>&1; }
flatpak_steam() { ! has steam && has flatpak && flatpak info com.valvesoftware.Steam >/dev/null 2>&1; }

# Steam rewrites its library file when it quits, so it has to be closed while StreamHub is added.
CLOSED_STEAM=0
close_steam() {
  steam_running || return 0
  confirm "Steam needs to close for a moment while StreamHub is added to your library. It'll open again afterwards.

Close Steam now?" || fail "StreamHub wasn't added to Steam. Close Steam and run this again."
  busy 'Closing Steam…'
  if flatpak_steam; then flatpak run com.valvesoftware.Steam -shutdown >/dev/null 2>&1 &
  else steam -shutdown >/dev/null 2>&1 & fi
  for _ in $(seq 60); do
    steam_running || break
    sleep 1
  done
  steam_running && fail "Steam didn't close. Quit it (Steam menu → Exit) and run this again."
  CLOSED_STEAM=1
}
reopen_steam() {
  [ "${CLOSED_STEAM}" = 1 ] || return 0
  if flatpak_steam; then nohup flatpak run com.valvesoftware.Steam >/dev/null 2>&1 &
  else nohup steam >/dev/null 2>&1 & fi
  disown 2>/dev/null || true
}

# ---------- Checks ----------

[ "$(id -u)" = 0 ] && fail "Run this as yourself, not with sudo: StreamHub installs into your home folder."
[ "$(uname -m)" = x86_64 ] || fail "This StreamHub is for x86-64 computers (like the Steam Deck); this one is $(uname -m)."
[ "${XDG_CURRENT_DESKTOP:-}" = gamescope ] && fail "Run this in Desktop Mode (Steam button → Power → Switch to Desktop)."
has python3 || fail "Python 3 is needed to add StreamHub to Steam, and it isn't installed."

# ---------- Uninstall ----------

if [ "${1:-}" = --uninstall ]; then
  confirm "Remove StreamHub from this computer and your Steam library?

Your StreamHub sign-ins and settings stay (in ~/.config/StreamHub) unless you delete them." || exit 0
  close_steam
  if [ -f "${DIR}/steam-shortcut.py" ]; then python3 "${DIR}/steam-shortcut.py" remove "${LAUNCHER}" >/dev/null; fi
  rm -rf "${DIR}" "${DESKTOP}"
  has update-desktop-database && update-desktop-database "${HOME}/.local/share/applications" >/dev/null 2>&1
  reopen_steam
  note "StreamHub has been removed."
  exit 0
fi

# ---------- Install ----------

confirm "Install StreamHub ${VERSION}?

It goes in your home folder and your app menu, and into your Steam library, where it opens in Big Picture mode (play it from Game Mode with your controller)." || exit 0
close_steam
busy "Installing StreamHub ${VERSION}…"

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
tail -n +"${PAYLOAD_LINE}" "${SELF}" | tar -x -C "${TMP}" || fail "This installer is damaged (its contents couldn't be unpacked). Download it again."

# The app runs unpacked rather than as an AppImage: nothing to mount each launch (no FUSE needed),
# and it starts faster.
chmod +x "${TMP}/StreamHub.AppImage"
(cd "${TMP}" && ./StreamHub.AppImage --appimage-extract >/dev/null 2>&1) || fail "StreamHub couldn't be unpacked."
mkdir -p "${DIR}"
rm -rf "${DIR}/app" "${DIR}/art"
mv "${TMP}/squashfs-root" "${DIR}/app"
mv "${TMP}/art" "${DIR}/art"
cp "${TMP}/icon.png" "${DIR}/icon.png"
cp "${TMP}/steam-shortcut.py" "${DIR}/steam-shortcut.py"
echo "${VERSION}" > "${DIR}/version"

cat > "${LAUNCHER}" <<'LAUNCH'
#!/usr/bin/env bash
# Starts StreamHub (set up by its Steam installer). Its output from the last run is in last-run.log.
DIR="$(dirname "$(readlink -f "$0")")"
args=()
# Steam starts games with its own runtime libraries and its overlay loaded into them; both can
# break Chromium (which StreamHub is built on), so it gets this computer's own libraries and no overlay.
if [ -n "${STEAM_RUNTIME:-}" ] || [[ "${LD_LIBRARY_PATH:-}" == *steam* ]]; then export LD_LIBRARY_PATH="${SYSTEM_LD_LIBRARY_PATH:-}"; fi
unset LD_PRELOAD
# Game Mode (gamescope): X11, which Chromium runs reliably there.
if [ "${XDG_CURRENT_DESKTOP:-}" = gamescope ] || [ -n "${GAMESCOPE_WAYLAND_DISPLAY:-}" ] || [ "${SteamGamepadUI:-}" = 1 ]; then args+=(--ozone-platform=x11); fi
# Chromium's sandbox needs user namespaces here; where they're blocked, run without it rather than not at all.
if ! unshare -Ur true >/dev/null 2>&1; then args+=(--no-sandbox); fi
exec "${DIR}/app/streamhub" "${args[@]}" "$@" >"${DIR}/last-run.log" 2>&1
LAUNCH
chmod +x "${LAUNCHER}"

cat > "${DIR}/uninstall.sh" <<UNINSTALL
#!/usr/bin/env bash
# Removes StreamHub and its Steam library entry. Your sign-ins and settings (~/.config/StreamHub) stay.
pgrep -x steam >/dev/null && { echo "Close Steam first (Steam menu → Exit), then run this again."; exit 1; }
python3 "${DIR}/steam-shortcut.py" remove "${LAUNCHER}"
rm -rf "${DIR}" "${DESKTOP}"
echo "StreamHub has been removed."
UNINSTALL
chmod +x "${DIR}/uninstall.sh"

mkdir -p "$(dirname "${DESKTOP}")"
cat > "${DESKTOP}" <<ENTRY
[Desktop Entry]
Type=Application
Name=StreamHub
GenericName=Live streams
Comment=Your Twitch, YouTube, Kick and Rumble follows in one app
Exec="${LAUNCHER}" %U
Icon=${DIR}/icon.png
Terminal=false
Categories=AudioVideo;Video;Network;
Keywords=twitch;youtube;kick;rumble;stream;live;
StartupWMClass=StreamHub
Actions=BigPicture;

[Desktop Action BigPicture]
Name=Open in Big Picture
Exec="${LAUNCHER}" --big-picture
ENTRY
has update-desktop-database && update-desktop-database "${HOME}/.local/share/applications" >/dev/null 2>&1

RESULT="$(python3 "${DIR}/steam-shortcut.py" add "${LAUNCHER}" "${DIR}/icon.png" "${DIR}/art" --big-picture 2>&1)" ||
  { reopen_steam; fail "StreamHub is installed, but it couldn't be added to Steam:
${RESULT}"; }
reopen_steam

if [ "${RESULT}" = accounts:0 ]; then
  note "StreamHub ${VERSION} is installed (it's in your app menu), but Steam has no signed-in account on this computer yet, so it wasn't added to a Steam library.

Sign in to Steam, then run this installer again."
else
  note "StreamHub ${VERSION} is installed and in your Steam library.

• Game Mode: find StreamHub under Library → Non-Steam. It opens in Big Picture mode, made for the controller.
• Desktop Mode: it's in your app menu as the usual window.

First time? Sign in to your platforms once (Accounts, in the usual window), or use Sync with Google to bring your sign-ins over."
fi
exit 0
# ---------- Everything below is the packed app (tar) ----------
