import { Fragment, useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, ExternalLinkIcon } from 'lucide-react'
import type { AboutPanel, Channel, ChannelAbout } from '@shared/types'

type Load = { status: 'loading' } | { status: 'error' } | { status: 'done'; about: ChannelAbout }

/**
 * Collapsible bar under a live stream: the channel's About section (Twitch, Kick) or the stream's
 * description box (YouTube, Rumble). Loads when the stream opens so the collapsed bar can preview it.
 */
export function AboutSection({
  channel,
  streamId,
  open,
  onOpenChange
}: {
  channel: Channel
  streamId?: string
  open: boolean
  onOpenChange(open: boolean): void
}): React.JSX.Element {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const sectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })
    window.api.getAbout(channel.key).then(
      (about) => !cancelled && setLoad({ status: 'done', about }),
      () => !cancelled && setLoad({ status: 'error' })
    )
    return () => {
      cancelled = true
    }
  }, [channel.key, streamId])

  const isDescription = channel.platform === 'youtube' || channel.platform === 'rumble'
  const heading = isDescription ? 'Stream description' : `About ${channel.displayName}`
  const about = load.status === 'done' ? load.about : undefined
  const empty = about !== undefined && !about.text && !about.links.length && !about.panels.length
  const preview =
    load.status === 'loading'
      ? 'Loading…'
      : load.status === 'error'
        ? `Couldn't load the ${isDescription ? 'description' : 'About section'}`
        : empty
          ? isDescription
            ? 'No description for this stream'
            : "This channel hasn't filled in its About section"
          : about?.text?.split('\n').find((l) => l.trim()) ?? summary(about!)
  const expandable = Boolean(about) && !empty
  // About sections are mostly panel images, so they open at full size and the page scrolls to them
  // (like twitch.tv's About page); a description is text, so it scrolls in place under the stream.
  const roomy = !isDescription
  useEffect(() => {
    if (open && roomy) sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [open, roomy])

  return (
    // An open description fills the space under the player and scrolls inside, so the stream stays in
    // view; the minimum height lets the whole column scroll instead when the window is too short for that.
    <section
      ref={sectionRef}
      className={`mx-2 mb-2 flex scroll-mt-2 flex-col overflow-hidden rounded-panel bg-well ring-1 ring-separator ${open && !roomy ? 'min-h-[240px] flex-1' : 'shrink-0'}`}
    >
      <button
        type="button"
        onClick={() => expandable && onOpenChange(!open)}
        aria-expanded={expandable ? open : undefined}
        className={`flex w-full shrink-0 items-center gap-3 px-4 py-3 text-left ${expandable ? 'hover:bg-control-subtle' : 'cursor-default'}`}
      >
        <div className="min-w-0 flex-1">
          <div className="text-strong text-primary">{heading}</div>
          {!open && <div className="mt-0.5 truncate text-small text-tertiary">{stripMarkdownLinks(preview)}</div>}
        </div>
        {expandable && (
          <span className="flex shrink-0 items-center gap-1 text-small-strong text-secondary">
            {open ? 'Show less' : 'Show more'}
            <ChevronDownIcon className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2.5} />
          </span>
        )}
      </button>
      {open && about && (
        <div className={`flex flex-col ${roomy ? 'gap-5 px-5 pb-5' : 'min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain px-4 pb-4'}`}>
          {about.text && (
            <p className={`whitespace-pre-wrap break-words text-primary ${roomy ? 'max-w-3xl text-large' : 'text-regular'}`}>{linkify(about.text)}</p>
          )}
          {about.links.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {about.links.map((l) => (
                <ExternalLink
                  key={l.url}
                  href={l.url}
                  className="flex h-7 items-center gap-1.5 rounded-pill bg-control px-3 text-small-strong text-primary hover:bg-control-active"
                >
                  {l.title}
                  <ExternalLinkIcon className="size-3 text-tertiary" strokeWidth={2.5} />
                </ExternalLink>
              ))}
            </div>
          )}
          {about.panels.length > 0 && (
            // Twitch panels are designed 320px wide; cards stay near that so images look as intended.
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-start gap-x-5 gap-y-6">
              {about.panels.map((p, i) => (
                <Panel key={i} panel={p} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/** A Twitch/Kick About panel: optional image (linked when the panel has a link), title and text. */
function Panel({ panel }: { panel: AboutPanel }): React.JSX.Element {
  const image = panel.imageUrl && <img src={panel.imageUrl} alt={panel.title ?? ''} loading="lazy" className="w-full rounded-card" />
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {image && (panel.linkUrl ? <ExternalLink href={panel.linkUrl} className="block hover:brightness-110">{image}</ExternalLink> : image)}
      {panel.title && <div className="text-heading2 text-primary">{panel.title}</div>}
      {panel.text && <p className="whitespace-pre-wrap break-words text-regular text-secondary">{linkify(panel.text)}</p>}
      {!image && panel.linkUrl && (
        <ExternalLink href={panel.linkUrl} className="truncate text-regular text-accent hover:underline">
          {panel.linkUrl}
        </ExternalLink>
      )}
    </div>
  )
}

/** A link that opens in the system browser (the app itself never navigates away). */
function ExternalLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <a
      href={href}
      title={href}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        window.api.openExternal(href)
      }}
    >
      {children}
    </a>
  )
}

/** Markdown-style [text](https://…) links or bare https:// addresses. */
const LINK_RE = /\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)|https:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/g

/** Text with its links made clickable (only https, the only scheme openExternal accepts). */
function linkify(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(LINK_RE)) {
    const start = m.index ?? 0
    if (start > last) out.push(<Fragment key={last}>{text.slice(last, start)}</Fragment>)
    const url = m[2] ?? m[0]
    out.push(
      <ExternalLink key={start} href={url} className="text-accent hover:underline">
        {m[1] ?? url}
      </ExternalLink>
    )
    last = start + m[0].length
  }
  if (last < text.length) out.push(<Fragment key={last}>{text.slice(last)}</Fragment>)
  return out
}

const stripMarkdownLinks = (text: string): string => text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')

/** Collapsed preview when there's no bio: what the section holds instead. */
function summary(about: ChannelAbout): string {
  const parts: string[] = []
  if (about.links.length) parts.push(about.links.map((l) => l.title).join(' · '))
  if (about.panels.length) parts.push(`${about.panels.length} panel${about.panels.length === 1 ? '' : 's'}`)
  return parts.join(' — ')
}
