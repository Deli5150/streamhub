import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckIcon, Gamepad2Icon, ImageIcon, KeyboardIcon, ListVideoIcon, PaletteIcon, PlusIcon, RotateCcwIcon, SettingsIcon, ShieldCheckIcon, Trash2Icon, UploadIcon, XIcon } from 'lucide-react'
import { MENUBAR_THEMES, type MenubarTheme, type ShortcutAction } from '@shared/types'
import { DARK_THEME_ID, LIGHT_THEME_ID, THEMES, type Colorway } from '@shared/themes'
import { fileToDataUrl, MAX_WALLPAPERS, useBackground, type BackgroundFit } from '../lib/background'
import { canonical, MAX_BINDINGS_PER_ACTION, shortcutProblem, TRAY, type ShortcutBindings } from '@shared/shortcuts'
import { eventToAccelerator, formatAccelerator, isModifierKey, MODIFIER_HINT, SHIFT_NAME, SHORTCUT_META } from '../lib/shortcuts'
import { useUi } from '../store'
import { Button, Field, FieldGroup, QuickPopover, SegmentedControl, Slider, Switch } from './ui'
import { UpdatesSection } from './Updates'
import { PlaylistsSection } from './YouTubePlaylists'

/** Header buttons that pop the most-used settings categories open in place. */
export function QuickActions(): React.JSX.Element {
  return (
    <div className="no-drag flex items-center gap-0.5">
      <QuickPopover label="Customization" icon={<PaletteIcon className="size-4" strokeWidth={2.25} />}>
        <CustomizationSection />
      </QuickPopover>
      <QuickPopover label="Playback" icon={<ShieldCheckIcon className="size-4" strokeWidth={2.25} />}>
        <PlaybackSection />
      </QuickPopover>
      <QuickPopover label="YouTube playlists" icon={<ListVideoIcon className="size-4" strokeWidth={2.25} />}>
        <PlaylistsSection />
      </QuickPopover>
      <QuickPopover label="Settings" icon={<SettingsIcon className="size-4" strokeWidth={2.25} />}>
        <SettingsSection />
      </QuickPopover>
      <button
        type="button"
        title="Big Picture mode: full screen, for a TV and a game controller"
        onClick={() => useUi.getState().set({ bigPicture: true })}
        className="ui-icon-btn no-drag flex size-7 shrink-0 items-center justify-center rounded-md text-secondary transition-colors hover:bg-control-subtle hover:text-primary"
      >
        <Gamepad2Icon className="size-4" strokeWidth={2.25} />
      </button>
    </div>
  )
}

function SectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }): React.JSX.Element {
  return (
    <div className="mx-4 mb-4">
      <div className="flex items-center justify-between">
        <span className="text-strong text-primary">{title}</span>
        {action}
      </div>
      <p className="mt-1 text-small text-tertiary">{description}</p>
    </div>
  )
}

// ---------- Customization ----------

type CustomizationTab = 'theme' | 'wallpaper'

/** The color theme and the home screen's wallpapers, in one popover (they were two header buttons). */
function CustomizationSection(): React.JSX.Element {
  const [tab, setTab] = useState<CustomizationTab>('theme')
  return (
    <div>
      <div className="mx-4 mb-4 flex justify-center">
        <SegmentedControl<CustomizationTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'theme', label: 'Theme' },
            { value: 'wallpaper', label: 'Wallpaper' }
          ]}
        />
      </div>
      {tab === 'theme' ? <ThemeSection /> : <BackgroundSection />}
    </div>
  )
}

// ---------- Settings ----------

type SettingsTab = 'tray' | 'keyboard' | 'updates'

/** The less-used settings in one popover: the menu bar / tray app, keyboard shortcuts and updates. */
function SettingsSection(): React.JSX.Element {
  const [tab, setTab] = useState<SettingsTab>('tray')
  return (
    <div>
      <div className="mx-4 mb-4 flex justify-center">
        <SegmentedControl<SettingsTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'tray', label: TRAY.title, title: `The ${TRAY.name} app` },
            { value: 'keyboard', label: 'Shortcuts', title: 'Keyboard shortcuts' },
            { value: 'updates', label: 'Updates' }
          ]}
        />
      </div>
      {tab === 'tray' ? <MenubarSection /> : tab === 'keyboard' ? <KeyboardSection /> : <UpdatesSection />}
    </div>
  )
}

// ---------- Themes ----------

function ThemeSection(): React.JSX.Element {
  const theme = useUi((s) => s.app?.settings.theme ?? 'default')
  const setTheme = (id: string): void => void window.api.updateSettings({ theme: id })
  const group = (g: Colorway['group']): Colorway[] => THEMES.filter((t) => t.group === g)

  return (
    <div>
      <SectionHeader
        title="Color theme"
        description="Pick a colorway for the whole app. Click the light or dark side of the first swatch for a clean neutral theme."
        action={
          theme !== 'default' && (
            <Button variant="plain" onClick={() => setTheme('default')} title="Follow the system appearance">
              Use system
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-5 px-4">
        <ThemeGrid>
          <div className="flex flex-col gap-2 p-1.5">
            <div className="relative grid aspect-[4/3] w-full grid-cols-2 overflow-hidden rounded-lg ring-1 ring-black/10">
              {[
                { id: LIGHT_THEME_ID, label: 'Light theme', cls: 'bg-white' },
                { id: DARK_THEME_ID, label: 'Dark theme', cls: 'bg-[#1c1c1e]' }
              ].map((half) => (
                <button
                  key={half.id}
                  onClick={() => setTheme(half.id)}
                  aria-label={half.label}
                  aria-pressed={theme === half.id}
                  className={`relative h-full w-full transition-shadow ${half.cls} ${
                    theme === half.id ? 'ring-2 ring-accent ring-inset' : 'hover:ring-1 hover:ring-secondary hover:ring-inset'
                  }`}
                >
                  {theme === half.id && <SelectedCheck className="top-1.5 left-1/2 -translate-x-1/2" />}
                </button>
              ))}
            </div>
            <span className="px-1 text-left text-small-strong text-primary">Light / Dark</span>
          </div>
        </ThemeGrid>
        {(['dark', 'light', 'custom'] as const).map((g) => (
          <div key={g} className="flex flex-col gap-2">
            <span className="text-small font-semibold tracking-wide text-tertiary uppercase">{g === 'custom' ? 'Styled themes' : g}</span>
            <ThemeGrid>
              {group(g).map((t) => (
                <ThemeSwatch key={t.id} theme={t} selected={theme === t.id} onSelect={() => setTheme(t.id)} />
              ))}
            </ThemeGrid>
          </div>
        ))}
      </div>
    </div>
  )
}

const ThemeGrid = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3">{children}</div>
)

const SelectedCheck = ({ className }: { className: string }): React.JSX.Element => (
  <span className={`absolute flex size-5 items-center justify-center rounded-full bg-accent shadow ${className}`}>
    <CheckIcon className="size-3.5 text-white" strokeWidth={3} />
  </span>
)

function ThemeSwatch({ theme, selected, onSelect }: { theme: Colorway; selected: boolean; onSelect(): void }): React.JSX.Element {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col gap-2 rounded-xl p-1.5 transition-shadow ${selected ? 'ring-2 ring-accent' : 'ring-1 ring-separator hover:ring-secondary'}`}
    >
      <div
        className="relative flex aspect-[4/3] w-full flex-col justify-between overflow-hidden rounded-lg p-2 ring-1 ring-black/10"
        style={{ background: `linear-gradient(160deg, ${theme.background}, ${theme.backgroundSecondary})` }}
      >
        <div className="h-2 w-2/3 rounded-full" style={{ backgroundColor: theme.foreground, opacity: 0.85 }} />
        <div className="flex items-center gap-1.5">
          <span className="size-4 rounded-full" style={{ backgroundColor: theme.accent }} />
          <div className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: theme.foreground, opacity: 0.35 }} />
        </div>
        {selected && <SelectedCheck className="top-1.5 right-1.5" />}
      </div>
      <span className="px-1 text-left text-small-strong text-primary">{theme.name}</span>
    </button>
  )
}

// ---------- Background ----------

function BackgroundSection(): React.JSX.Element {
  const bg = useBackground()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const hasImage = bg.images.length > 0

  useEffect(() => {
    bg.load()
  }, [bg])

  const onFiles = async (files: FileList | null): Promise<void> => {
    setError(null)
    const images = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
    if (!images.length) return setError('Please choose an image file.')
    const urls = await Promise.all(images.map(fileToDataUrl))
    if (!bg.multiEnabled) return bg.setImages([urls[0]])
    const room = MAX_WALLPAPERS - bg.images.length
    if (urls.length > room) setError(`Only added ${room} — the ${MAX_WALLPAPERS} wallpaper limit was reached.`)
    await bg.setImages([...bg.images, ...urls.slice(0, room)])
  }

  return (
    <div>
      <SectionHeader title="Wallpapers" description="Use your own image behind the home screen, and adjust how it sits." />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple={bg.multiEnabled}
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="flex flex-col gap-4 px-4">
        <FieldGroup>
          <Field label="Enable multiple wallpapers" description="Add several wallpapers and the home screen fades between them.">
            <Switch checked={bg.multiEnabled} onChange={(v) => bg.update({ multiEnabled: v })} label="Enable multiple wallpapers" />
          </Field>
        </FieldGroup>

        {bg.multiEnabled ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              {bg.images.map((src, i) => (
                <div key={src.slice(0, 64) + i} className="relative aspect-video overflow-hidden rounded-lg bg-well ring-1 ring-separator">
                  <img src={src} alt={`Wallpaper ${i + 1}`} className="absolute inset-0 h-full w-full object-cover" />
                  <button
                    onClick={() => bg.setImages(bg.images.filter((_, j) => j !== i))}
                    title="Remove wallpaper"
                    className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/55 transition-colors hover:bg-black/70"
                  >
                    <Trash2Icon className="size-3.5 text-white" />
                  </button>
                </div>
              ))}
              {bg.images.length < MAX_WALLPAPERS && (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-separator text-tertiary transition-colors hover:text-secondary"
                >
                  <PlusIcon className="size-5" strokeWidth={1.75} />
                  <span className="text-small">Add wallpaper</span>
                </button>
              )}
            </div>
            <p className="text-small text-tertiary">
              {bg.images.length < 2 ? 'Add at least 2 wallpapers to fade between them.' : `${bg.images.length} wallpapers — fading every few seconds.`}
            </p>
          </div>
        ) : (
          <>
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-well ring-1 ring-separator">
              {hasImage ? (
                <img
                  src={bg.images[0]}
                  alt="Wallpaper preview"
                  className="absolute inset-0 h-full w-full"
                  style={{ objectFit: bg.fit, transform: `rotate(${bg.rotation}deg) scale(${bg.zoom})` }}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-tertiary">
                  <ImageIcon className="size-8" strokeWidth={1.5} />
                  <span className="text-small">No wallpaper</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => fileRef.current?.click()}>
                <UploadIcon className="size-3.5" />
                {hasImage ? 'Replace image' : 'Upload image'}
              </Button>
              {hasImage && (
                <Button variant="plain" onClick={() => bg.setImages([])}>
                  <Trash2Icon className="size-3.5 text-support-red" />
                  Remove
                </Button>
              )}
            </div>
          </>
        )}
        {error && <p className="text-small text-support-red">{error}</p>}

        <div className={hasImage ? '' : 'pointer-events-none opacity-50'}>
          <FieldGroup>
            <Field label="Size" description="How the image fills the home screen.">
              <SegmentedControl<BackgroundFit>
                value={bg.fit}
                onChange={(fit) => bg.update({ fit })}
                options={[
                  { value: 'cover', label: 'Cover' },
                  { value: 'contain', label: 'Fit' },
                  { value: 'fill', label: 'Stretch' }
                ]}
              />
            </Field>
            <div className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-strong text-primary">Zoom</span>
                <span className="text-small text-tertiary tabular-nums">{Math.round(bg.zoom * 100)}%</span>
              </div>
              <Slider value={Math.round(bg.zoom * 100)} min={50} max={300} onChange={(v) => bg.update({ zoom: v / 100 })} />
            </div>
            <div className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-strong text-primary">Rotation</span>
                <span className="text-small text-tertiary tabular-nums">{bg.rotation}°</span>
              </div>
              <Slider value={bg.rotation} min={-180} max={180} onChange={(v) => bg.update({ rotation: v })} />
            </div>
          </FieldGroup>
        </div>
      </div>
    </div>
  )
}

// ---------- Menu-bar / system tray app ----------

const MENUBAR_THEME_LABEL: Record<MenubarTheme, string> = {
  default: 'Default',
  operagx: 'OGX',
  gummy: 'Gummy',
  terminal: 'Terminal',
  shortcuts: 'Shortcuts'
}

function MenubarSection(): React.JSX.Element {
  const settings = useUi((s) => s.app?.settings)
  if (!settings) return <div />
  const { menubar } = settings
  const set = (patch: Partial<typeof menubar>): void => void window.api.updateSettings({ menubar: patch })

  return (
    <div>
      <SectionHeader title={`${TRAY.title} app`} description={`A ${TRAY.name} icon that lists who's live, one click away from any app.`} />
      <div className="flex flex-col gap-4 px-4">
        <FieldGroup>
          <Field label={`Show in ${TRAY.name}`} description={`Adds a StreamHub icon (with the live count) to ${TRAY.where}.`}>
            <Switch checked={menubar.enabled} onChange={(v) => set({ enabled: v })} label={`Show in ${TRAY.name}`} />
          </Field>
          <Field label="Open channels in browser" description="Picking a channel opens it on the platform's website instead of StreamHub.">
            <Switch checked={menubar.openInBrowser} onChange={(v) => set({ openInBrowser: v })} label="Open channels in browser" />
          </Field>
          <Field label="Notify when channels go live" description="Show a notification when someone you follow starts streaming.">
            <Switch checked={settings.notifyLive} onChange={(v) => void window.api.updateSettings({ notifyLive: v })} label="Notify when channels go live" />
          </Field>
        </FieldGroup>
        <div className={menubar.enabled ? '' : 'pointer-events-none opacity-50'}>
          <span className="text-small font-semibold tracking-wide text-tertiary uppercase">{TRAY.title} theme</span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {MENUBAR_THEMES.map((t) => (
              <button
                key={t}
                onClick={() => set({ theme: t })}
                aria-pressed={menubar.theme === t}
                className={`flex flex-col gap-1.5 rounded-xl p-1.5 transition-shadow ${
                  menubar.theme === t ? 'ring-2 ring-accent' : 'ring-1 ring-separator hover:ring-secondary'
                }`}
              >
                <MenubarPreview theme={t} />
                <span className="px-1 text-left text-small-strong text-primary">{MENUBAR_THEME_LABEL[t]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Tiny static mock of each popup style. */
function MenubarPreview({ theme }: { theme: MenubarTheme }): React.JSX.Element {
  const box = 'relative aspect-[4/3] w-full overflow-hidden rounded-lg ring-1 ring-black/10'
  const dots = ['#9146ff', '#ff3b30', '#53fc18', '#85c742']
  if (theme === 'terminal')
    return (
      <div className={`${box} bg-[#0d1117] p-1.5 text-left font-mono text-[6px] leading-[9px] text-[#59d499]`}>
        StreamHub Terminal
        <br />
        <span className="text-white/50">$ /live</span>
        <br />
        <span className="text-[#d6dee8]">● xQc 10.1K</span>
      </div>
    )
  if (theme === 'shortcuts')
    return (
      <div className={`${box} bg-gradient-to-b from-[#2a2a2e] to-[#161618] p-1.5`}>
        <div className="mb-1 h-1.5 w-3/4 rounded bg-white/80" />
        <div className="space-y-1 rounded bg-white/5 p-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-1 w-2/3 rounded bg-white/50" />
          ))}
        </div>
      </div>
    )
  if (theme === 'operagx')
    return (
      <div className={`${box} grid grid-cols-4 gap-1 bg-[#101018] p-1.5`}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="aspect-square rounded-[3px]" style={{ background: dots[i % 4], opacity: 0.7 }} />
        ))}
      </div>
    )
  if (theme === 'gummy')
    return (
      <div className={`${box} space-y-1 bg-popover p-1.5`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="aspect-video w-5 rounded-[2px]" style={{ background: dots[i] }} />
            <div className="h-1 flex-1 rounded bg-secondary/50" />
          </div>
        ))}
      </div>
    )
  return (
    <div className={`${box} space-y-1 bg-popover p-1.5`}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="size-2.5 rounded-full" style={{ background: dots[i] }} />
          <div className="h-1 flex-1 rounded bg-secondary/50" />
        </div>
      ))}
    </div>
  )
}

// ---------- Playback ----------

function PlaybackSection(): React.JSX.Element {
  const settings = useUi((s) => s.app?.settings)
  if (!settings) return <div />
  return (
    <div>
      <SectionHeader title="Playback" description="How streams play inside StreamHub." />
      <div className="px-4">
        <FieldGroup>
          <Field
            label="Block Twitch ads"
            description="During Twitch ad breaks, switches to an ad-free copy of the stream so it keeps playing, then switches back. Twitch players reload when you change this."
          >
            <Switch checked={settings.blockTwitchAds} onChange={(v) => void window.api.updateSettings({ blockTwitchAds: v })} label="Block Twitch ads" />
          </Field>
          <Field
            label="Picture in picture when minimized"
            description="When you minimize or hide StreamHub while a stream or video is playing, it keeps playing in a floating window. It moves back into StreamHub when you return."
          >
            <Switch checked={settings.pipOnMinimize} onChange={(v) => void window.api.updateSettings({ pipOnMinimize: v })} label="Picture in picture when minimized" />
          </Field>
          <Field
            label="Open in Big Picture at startup"
            description="StreamHub starts in Big Picture mode: full screen and made for a TV and a game controller. Exit it any time to get the usual window."
          >
            <Switch checked={settings.bigPictureOnStartup} onChange={(v) => void window.api.updateSettings({ bigPictureOnStartup: v })} label="Open in Big Picture at startup" />
          </Field>
        </FieldGroup>
      </div>
    </div>
  )
}

// ---------- Keyboard shortcuts ----------

function KeyboardSection(): React.JSX.Element {
  const app = useUi((s) => s.app)
  // Which shortcut is being recorded: an existing one (by index) to replace, or a new one to add.
  const [recording, setRecording] = useState<{ action: ShortcutAction; index: number | 'new' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bindings = app?.settings.shortcuts ?? {}
  const defaults = app?.shortcutDefaults
  const current = (a: ShortcutAction): string[] => bindings[a] ?? defaults?.[a] ?? []

  const save = (next: ShortcutBindings): void => {
    window.api.setShortcuts(next).then((res) => (res.success ? setError(null) : setError(res.error ?? 'Couldn’t save that shortcut')))
  }
  const setAction = (action: ShortcutAction, list: string[]): void => save({ ...bindings, [action]: list })

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (isModifierKey(e)) return
      // Esc on its own cancels; with modifiers it can be bound like any other key.
      if (e.code === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) return setRecording(null)
      const accel = eventToAccelerator(e)
      if (!accel) return setError('That key can’t be used for shortcuts.')
      const problem = shortcutProblem(accel)
      if (problem) return setError(`${formatAccelerator(accel)}: ${problem}`)
      const key = canonical(accel)
      const { action, index } = recording
      const list = current(action)
      const dup = SHORTCUT_META.find((m) => current(m.action).some((a, i) => a === key && !(m.action === action && i === index)))
      if (dup) return setError(`${formatAccelerator(key)} is already used by “${dup.label}”.`)
      if (index === 'new' && list.length >= MAX_BINDINGS_PER_ACTION) return setError(`Up to ${MAX_BINDINGS_PER_ACTION} shortcuts per action.`)
      setError(null)
      setRecording(null)
      setAction(action, index === 'new' ? [...list, key] : list.map((a, i) => (i === index ? key : a)))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const chip = 'flex h-7 items-center rounded-lg px-2.5 text-small-strong tracking-wide tabular-nums transition-colors'

  return (
    <div>
      <SectionHeader
        title="Keyboard shortcuts"
        description="Add as many shortcuts to an action as you like: press + and then the keys. Click a shortcut to change it. Shortcuts work while StreamHub is focused, even over a stream."
        action={
          <Button
            variant="plain"
            onClick={() => {
              setError(null)
              setRecording(null)
              save({})
            }}
          >
            Reset all
          </Button>
        }
      />
      <div className="px-4">
        <FieldGroup>
          {SHORTCUT_META.map(({ action, label, description }) => {
            const list = current(action)
            const isDefault = !bindings[action] || JSON.stringify(bindings[action]) === JSON.stringify(defaults?.[action])
            const isRec = (index: number | 'new'): boolean => recording?.action === action && recording.index === index
            const toggleRec = (index: number | 'new'): void => {
              setError(null)
              setRecording(isRec(index) ? null : { action, index })
            }
            return (
              <div key={action} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-control">
                    <KeyboardIcon className="size-3.5 text-secondary" strokeWidth={2.5} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-strong text-primary">{label}</span>
                    <span className="text-small text-tertiary">{description}</span>
                  </div>
                  {!isDefault && (
                    <Button
                      variant="plain"
                      title="Reset to default"
                      onClick={() => {
                        const { [action]: _, ...rest } = bindings
                        setRecording(null)
                        save(rest)
                      }}
                    >
                      <RotateCcwIcon className="size-3.5 text-secondary" />
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-8">
                  {list.map((accel, i) => (
                    <span key={accel} className="group relative" data-keep-popover>
                      <button
                        type="button"
                        onClick={() => toggleRec(i)}
                        title="Click to change"
                        className={`${chip} pr-6 ${isRec(i) ? 'bg-accent text-white' : 'bg-control text-primary hover:bg-control-active'}`}
                      >
                        {isRec(i) ? 'Press keys…' : formatAccelerator(accel)}
                      </button>
                      {!isRec(i) && (
                        <button
                          type="button"
                          onClick={() => {
                            setRecording(null)
                            setAction(
                              action,
                              list.filter((_, j) => j !== i)
                            )
                          }}
                          title="Remove this shortcut"
                          aria-label={`Remove ${formatAccelerator(accel)}`}
                          className="absolute top-1/2 right-1 flex size-4 -translate-y-1/2 items-center justify-center rounded-full text-tertiary opacity-60 transition-opacity group-hover:opacity-100 hover:bg-support-red hover:text-white"
                        >
                          <XIcon className="size-3" strokeWidth={2.5} />
                        </button>
                      )}
                    </span>
                  ))}
                  {list.length === 0 && !isRec('new') && <span className="text-small text-tertiary">No shortcut</span>}
                  <button
                    type="button"
                    onClick={() => toggleRec('new')}
                    title="Add another shortcut"
                    data-keep-popover
                    className={`${chip} gap-1 ${isRec('new') ? 'bg-accent text-white' : 'text-secondary ring-1 ring-separator ring-inset hover:bg-control-subtle hover:text-primary'}`}
                  >
                    {isRec('new') ? (
                      'Press keys…'
                    ) : (
                      <>
                        <PlusIcon className="size-3.5" strokeWidth={2.5} />
                        Add
                      </>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </FieldGroup>
        {error && <p className="mt-3 text-small text-support-red">{error}</p>}
        <p className="mt-3 text-small text-tertiary">
          Any key works with {MODIFIER_HINT} (plus {SHIFT_NAME} if you like). F1–F24 and media keys also work on their own. Press Esc to cancel recording.
        </p>
      </div>
    </div>
  )
}
