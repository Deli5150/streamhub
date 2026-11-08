import { TwitchIcon, YoutubeIcon } from 'lucide-react'
import { PLATFORMS, type Platform } from '@shared/types'
import twitchLogo from '../assets/platform-logos/twitch.png'
import kickLogo from '../assets/platform-logos/kick.png'
import rumbleLogo from '../assets/platform-logos/rumble.png'

/** The Rumble logomark. */
export function RumbleIcon({ className }: { className?: string; strokeWidth?: number }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`icon ${className ?? ""}`} aria-hidden="true">
      <path d="M14.4528 13.5458c.8064-.6542.9297-1.8381.2756-2.6445a1.8802 1.8802 0 0 0-.2756-.2756 21.2127 21.2127 0 0 0-4.3121-2.776c-1.066-.51-2.256.2-2.4261 1.414a23.5226 23.5226 0 0 0-.14 5.5021c.116 1.23 1.292 1.964 2.372 1.492a19.6285 19.6285 0 0 0 4.5062-2.704v-.008zm6.9322-5.4002c2.0335 2.228 2.0396 5.637.014 7.8723A26.1487 26.1487 0 0 1 8.2946 23.846c-2.6848.6713-5.4168-.914-6.1662-3.5781-1.524-5.2002-1.3-11.0803.17-16.3045.772-2.744 3.3521-4.4661 6.0102-3.832 4.9242 1.174 9.5443 4.196 13.0764 8.0121v.002z" />
    </svg>
  )
}

/** The Kick logomark (blocky "K"). */
export function KickIcon({ className }: { className?: string; strokeWidth?: number }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`icon ${className ?? ""}`} aria-hidden="true">
      <path d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8h-2.667v2.667h-2.666v2.666h2.666V16H20v2.667h2.667V24h-8v-2.667H12v-2.666H9.333V24h-8z" />
    </svg>
  )
}

type IconComponent = (props: { className?: string; strokeWidth?: number }) => React.ReactNode

export interface PlatformMeta {
  label: string
  /** brand-colored text */
  accent: string
  /** brand-colored solid background */
  activeBg: string
  iconClass: string
  Icon: IconComponent
  /** wordmark image shown on the channel banner, where the platform has one */
  logo?: string
  /** brand banner background for the channel page */
  banner?: string
}

export const PLATFORM_ORDER: readonly Platform[] = PLATFORMS

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  twitch: { label: 'Twitch', accent: 'text-twitch', activeBg: 'bg-twitch', iconClass: 'size-4', Icon: TwitchIcon, logo: twitchLogo, banner: 'linear-gradient(135deg, #9146FF, #5b2bb0)' },
  youtube: { label: 'YouTube', accent: 'text-support-red', activeBg: 'bg-support-red', iconClass: 'size-4', Icon: YoutubeIcon },
  kick: { label: 'Kick', accent: 'text-support-green', activeBg: 'bg-support-green', iconClass: 'size-3.5', Icon: KickIcon, logo: kickLogo, banner: 'linear-gradient(135deg, #53FC18, #38c10d)' },
  rumble: { label: 'Rumble', accent: 'text-rumble', activeBg: 'bg-rumble', iconClass: 'size-4', Icon: RumbleIcon, logo: rumbleLogo, banner: '#ffffff' }
}

/** Small brand-colored dot. */
export function PlatformDot({ platform, size = 'sm' }: { platform: Platform; size?: 'sm' | 'md' }): React.JSX.Element {
  return (
    <span
      className={`${size === 'sm' ? 'size-2' : 'size-2.5'} ${PLATFORM_META[platform].activeBg} inline-block shrink-0 rounded-full`}
      aria-label={PLATFORM_META[platform].label}
    />
  )
}

/** Brand-colored circle with the platform glyph, overlaid on an avatar's bottom-left corner. */
export function PlatformOverlayBadge({ platform, size = 'md' }: { platform: Platform; size?: 'sm' | 'md' }): React.JSX.Element {
  const { activeBg, label, Icon } = PLATFORM_META[platform]
  const small = size === 'sm'
  return (
    <span
      className={`absolute ${small ? '-bottom-0.5 -left-0.5 size-3.5' : '-bottom-1 -left-1 size-4'} ${activeBg} flex items-center justify-center rounded-full shadow-sm ring-2 ring-background`}
      aria-label={label}
    >
      {platform === 'kick' ? (
        <span className={`${small ? 'text-[7px]' : 'text-[8px]'} font-extrabold leading-none tracking-tight text-white`}>K</span>
      ) : (
        <Icon className={`${small ? 'size-2' : 'size-2.5'} shrink-0 text-white`} strokeWidth={small ? 3 : 2.5} />
      )}
    </span>
  )
}

/** One brand-colored dot per platform, overlaid on a combined channel's avatar. */
export function CombinedPlatformDots({ platforms, className = 'absolute -bottom-1 -left-0.5' }: { platforms: Platform[]; className?: string }): React.JSX.Element {
  return (
    <span className={`flex items-center gap-0.5 ${className}`} aria-label="Combined channel platforms">
      {platforms.map((p, i) => (
        <span key={`${p}-${i}`} className={`size-2.5 rounded-full shadow-sm ring-2 ring-background ${PLATFORM_META[p].activeBg}`} />
      ))}
    </span>
  )
}
