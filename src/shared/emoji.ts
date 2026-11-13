// Everyday emoji for the chat box's picker on platforms whose chats take plain emoji (Twitch,
// YouTube, Rumble). Kick has its own emoji set, which comes with its emotes.

import type { ChatEmoteSet } from './types'

const EMOJI: Array<[string, string]> = [
  ['😂', 'joy'], ['🤣', 'rofl'], ['😭', 'sob'], ['😅', 'sweat smile'], ['😊', 'blush'], ['😁', 'grin'], ['😆', 'laughing'], ['🙂', 'smile'],
  ['😉', 'wink'], ['😍', 'heart eyes'], ['🥰', 'smiling hearts'], ['😘', 'kiss'], ['😎', 'cool'], ['🤩', 'star struck'], ['🥳', 'party'], ['🤔', 'thinking'],
  ['🤨', 'raised eyebrow'], ['😐', 'neutral'], ['😑', 'expressionless'], ['🙄', 'eye roll'], ['😏', 'smirk'], ['😬', 'grimace'], ['😮', 'open mouth'], ['😳', 'flushed'],
  ['🥺', 'pleading'], ['😢', 'cry'], ['😤', 'huff'], ['😡', 'angry'], ['🤯', 'mind blown'], ['😱', 'scream'], ['🥶', 'cold'], ['🥵', 'hot'],
  ['😴', 'sleeping'], ['🤤', 'drool'], ['🤢', 'nauseated'], ['🤡', 'clown'], ['💀', 'skull'], ['👻', 'ghost'], ['🤖', 'robot'], ['💩', 'poop'],
  ['👍', 'thumbs up'], ['👎', 'thumbs down'], ['👏', 'clap'], ['🙌', 'raised hands'], ['🙏', 'pray'], ['👋', 'wave'], ['🤝', 'handshake'], ['💪', 'muscle'],
  ['👀', 'eyes'], ['🫡', 'salute'], ['🤙', 'call me'], ['✌️', 'peace'], ['🤞', 'fingers crossed'], ['👌', 'ok'], ['🫶', 'heart hands'], ['🫠', 'melting'],
  ['❤️', 'heart'], ['💜', 'purple heart'], ['💙', 'blue heart'], ['💚', 'green heart'], ['💛', 'yellow heart'], ['🖤', 'black heart'], ['💔', 'broken heart'], ['💯', '100'],
  ['🔥', 'fire'], ['✨', 'sparkles'], ['⭐', 'star'], ['🎉', 'tada'], ['🎊', 'confetti'], ['🏆', 'trophy'], ['🎮', 'game'], ['🎵', 'music'],
  ['👑', 'crown'], ['💎', 'gem'], ['💰', 'money'], ['🚀', 'rocket'], ['⚡', 'zap'], ['🐐', 'goat'], ['🍿', 'popcorn'], ['☕', 'coffee'],
  ['✅', 'check'], ['❌', 'x'], ['⚠️', 'warning'], ['❓', 'question'], ['❗', 'exclamation'], ['🆗', 'ok button'], ['🙈', 'see no evil'], ['🤫', 'shush']
]

export const EMOJI_SET: ChatEmoteSet = { title: 'Emoji', emotes: EMOJI.map(([code, name]) => ({ code, name })) }
