#!/usr/bin/env python3
"""Adds StreamHub to (or removes it from) Steam's library as a non-Steam game, with its artwork.

Part of the SteamOS installer (scripts/steam/build-installer.mjs). Steam keeps non-Steam games in
userdata/<account>/config/shortcuts.vdf, a binary key-value file, and their artwork in that
account's config/grid folder, named by the shortcut's app id. Steam must not be running: it
rewrites the file when it exits.

  steam-shortcut.py add <launcher> <icon> <art dir> [launch options]
  steam-shortcut.py remove <launcher>
"""
import glob
import os
import shutil
import struct
import sys
import zlib

NAME = 'StreamHub'

# ---------- Binary VDF ----------
# A map is a run of (type byte, key\0, value) ending in 0x08: 0x00 nested map, 0x01 string\0,
# 0x02 int32, 0x07 uint64. The file is one map holding "shortcuts": {"0": {...}, "1": {...}}.


class U64(int):
    """A 64-bit value, written back as one."""


def read_vdf(data):
    pos = 0

    def text():
        nonlocal pos
        end = data.index(b'\x00', pos)
        value = data[pos:end].decode('utf-8', 'surrogateescape')
        pos = end + 1
        return value

    def mapping():
        nonlocal pos
        result = {}
        while True:
            kind = data[pos]
            pos += 1
            if kind == 0x08:
                return result
            key = text()
            if kind == 0x00:
                result[key] = mapping()
            elif kind == 0x01:
                result[key] = text()
            elif kind == 0x02:
                result[key] = struct.unpack_from('<i', data, pos)[0]
                pos += 4
            elif kind == 0x07:
                result[key] = U64(struct.unpack_from('<Q', data, pos)[0])
                pos += 8
            else:
                raise ValueError(f'unknown VDF type {kind:#x} at {pos}')

    return mapping()


def write_vdf(obj):
    out = bytearray()

    def text(s):
        out.extend(s.encode('utf-8', 'surrogateescape') + b'\x00')

    def mapping(d):
        for key, value in d.items():
            if isinstance(value, dict):
                out.append(0x00)
                text(key)
                mapping(value)
            elif isinstance(value, U64):
                out.append(0x07)
                text(key)
                out.extend(struct.pack('<Q', value))
            elif isinstance(value, int):
                out.append(0x02)
                text(key)
                out.extend(struct.pack('<i', value))
            else:
                out.append(0x01)
                text(key)
                text(str(value))
        out.append(0x08)

    mapping(obj)
    return bytes(out)


# ---------- Steam ----------


def steam_roots():
    """Steam installs on this computer (native and Flatpak), each once."""
    home = os.path.expanduser('~')
    candidates = [
        f'{home}/.local/share/Steam',
        f'{home}/.steam/steam',
        f'{home}/.steam/root',
        f'{home}/.var/app/com.valvesoftware.Steam/.local/share/Steam',
        f'{home}/.var/app/com.valvesoftware.Steam/data/Steam',
    ]
    seen, roots = set(), []
    for path in candidates:
        if os.path.isdir(os.path.join(path, 'userdata')):
            real = os.path.realpath(path)
            if real not in seen:
                seen.add(real)
                roots.append(real)
    return roots


def accounts(root):
    """Config folders of the accounts that have signed in to this Steam."""
    folders = []
    for user in glob.glob(os.path.join(root, 'userdata', '*')):
        name = os.path.basename(user)
        if name.isdigit() and name != '0':
            folders.append(os.path.join(user, 'config'))
    return folders


def shortcut_id(exe):
    """The app id Steam gives a non-Steam game: a CRC of its target and name, top bit set."""
    return (zlib.crc32((exe + NAME).encode('utf-8')) & 0xFFFFFFFF) | 0x80000000


def as_int32(n):
    return n - (1 << 32) if n >= 1 << 31 else n


def ours(entry, launcher):
    exe = str(entry.get('Exe', entry.get('exe', ''))).strip('"')
    return exe == launcher or str(entry.get('AppName', entry.get('appname', ''))) == NAME


def load(path):
    if not os.path.exists(path):
        return {'shortcuts': {}}
    with open(path, 'rb') as f:
        data = f.read()
    return read_vdf(data) if data else {'shortcuts': {}}


def save(path, vdf):
    # Renumber the entries 0..n-1, as Steam does.
    entries = list(vdf.get('shortcuts', {}).values())
    vdf['shortcuts'] = {str(i): e for i, e in enumerate(entries)}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        shutil.copy2(path, path + '.streamhub-backup')
    tmp = path + '.tmp'
    with open(tmp, 'wb') as f:
        f.write(write_vdf(vdf))
    os.replace(tmp, path)


def art_names(appid):
    """Steam's grid file names for each piece of artwork."""
    return {'cover.png': f'{appid}p.png', 'wide.png': f'{appid}.png', 'hero.png': f'{appid}_hero.png', 'logo.png': f'{appid}_logo.png'}


def add(launcher, icon, art_dir, options):
    exe = f'"{launcher}"'
    appid = shortcut_id(exe)
    entry = {
        'appid': as_int32(appid),
        'AppName': NAME,
        'Exe': exe,
        'StartDir': f'"{os.path.dirname(launcher)}"',
        'icon': icon,
        'ShortcutPath': '',
        'LaunchOptions': options,
        'IsHidden': 0,
        'AllowDesktopConfig': 1,
        'AllowOverlay': 1,
        'OpenVR': 0,
        'Devkit': 0,
        'DevkitGameID': '',
        'DevkitOverrideAppID': 0,
        'LastPlayTime': 0,
        'FlatpakAppID': '',
        'tags': {},
    }
    added = 0
    for root in steam_roots():
        for config in accounts(root):
            path = os.path.join(config, 'shortcuts.vdf')
            vdf = load(path)
            kept = [e for e in vdf.get('shortcuts', {}).values() if not ours(e, launcher)]
            vdf['shortcuts'] = {str(i): e for i, e in enumerate(kept + [entry])}
            save(path, vdf)
            grid = os.path.join(config, 'grid')
            os.makedirs(grid, exist_ok=True)
            for source, target in art_names(appid).items():
                if os.path.exists(os.path.join(art_dir, source)):
                    shutil.copyfile(os.path.join(art_dir, source), os.path.join(grid, target))
            added += 1
    return added


def remove(launcher):
    appid = shortcut_id(f'"{launcher}"')
    removed = 0
    for root in steam_roots():
        for config in accounts(root):
            path = os.path.join(config, 'shortcuts.vdf')
            if not os.path.exists(path):
                continue
            vdf = load(path)
            entries = vdf.get('shortcuts', {}).values()
            kept = [e for e in entries if not ours(e, launcher)]
            if len(kept) != len(entries):
                vdf['shortcuts'] = {str(i): e for i, e in enumerate(kept)}
                save(path, vdf)
                removed += 1
            for target in art_names(appid).values():
                try:
                    os.remove(os.path.join(config, 'grid', target))
                except FileNotFoundError:
                    pass
    return removed


if __name__ == '__main__':
    if len(sys.argv) >= 5 and sys.argv[1] == 'add':
        count = add(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] if len(sys.argv) > 5 else '')
        print(f'accounts:{count}')
    elif len(sys.argv) == 3 and sys.argv[1] == 'remove':
        print(f'accounts:{remove(sys.argv[2])}')
    else:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
