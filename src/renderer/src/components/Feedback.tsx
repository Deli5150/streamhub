import { useEffect, useState } from 'react'
import { ExternalLinkIcon, MessageSquareIcon, XIcon } from 'lucide-react'
import { feedbackUrl, feedbackWhere, type FeedbackKind } from '@shared/feedback'
import { useUi } from '../store'
import { Button, Dialog, SegmentedControl, Switch } from './ui'

const FIELD =
  'w-full rounded-lg bg-control-subtle px-3 py-2 text-regular text-primary ring-1 ring-separator outline-none placeholder:text-tertiary focus:ring-2 focus:ring-accent'

/** Top-bar button that opens the Feedback dialog. */
export function FeedbackButton(): React.JSX.Element {
  return (
    <button
      type="button"
      title="Send feedback: report a bug or suggest a feature"
      onClick={() => useUi.getState().set({ feedback: true })}
      className="ui-icon-btn no-drag flex size-7 shrink-0 items-center justify-center rounded-md text-secondary transition-colors hover:bg-control-subtle hover:text-primary"
    >
      <MessageSquareIcon className="size-4" strokeWidth={2.25} />
    </button>
  )
}

/**
 * Report a bug or suggest a feature: written here, then finished on GitHub, where the issue form
 * opens with everything filled in (see shared/feedback.ts). Bug reports can include the recent log.
 */
export function FeedbackDialog(): React.JSX.Element | null {
  const open = useUi((s) => s.feedback)
  const bigPicture = useUi((s) => s.bigPicture)
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [withLog, setWithLog] = useState(true)
  const [info, setInfo] = useState<{ version: string; steam: boolean; log: string } | null>(null)
  const close = (): void => useUi.getState().set({ feedback: false })

  useEffect(() => {
    if (open) window.api.feedbackInfo().then(setInfo, () => setInfo(null))
  }, [open])

  if (!open) return null
  const ready = title.trim().length > 0 && text.trim().length > 0

  const send = (): void => {
    const url = feedbackUrl({
      kind,
      title,
      text,
      where: feedbackWhere(kind, window.api.platform, { bigPicture, steam: info?.steam }),
      version: info?.version ?? '',
      log: kind === 'bug' && withLog ? info?.log : undefined
    })
    void window.api.openExternal(url)
    close()
    setTitle('')
    setText('')
    useUi.getState().showToast({ text: 'Opened on GitHub — check it over and press Create to send it' })
  }

  return (
    <Dialog
      open
      onClose={close}
      width="w-[560px]"
      title="Send feedback"
      description="Your report opens on GitHub with everything filled in. Check it over there and submit it (you'll need a free GitHub account)."
      footer={
        <>
          <Button variant="plain" onClick={close}>
            <XIcon className="size-3.5 text-secondary" />
            Cancel
          </Button>
          <Button variant="filled" onClick={send} disabled={!ready}>
            <ExternalLinkIcon className="size-3.5" />
            Continue on GitHub
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 pt-1 pb-2">
        <SegmentedControl<FeedbackKind>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'bug', label: 'Report a bug' },
            { value: 'feature', label: 'Suggest a feature' }
          ]}
        />
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'bug' ? 'In a few words, what went wrong?' : 'In a few words, what should StreamHub do?'}
          maxLength={120}
          className={FIELD}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={
            kind === 'bug' ? 'What you did, what you expected, and what happened instead.' : 'Describe the idea, and how you’d use it.'
          }
          className={`${FIELD} resize-none`}
        />
        {kind === 'bug' && (
          <label className="flex items-start gap-3 rounded-lg px-1">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-strong text-primary">Include the recent app log</span>
              <span className="text-small text-tertiary">
                Helps track the problem down. Sign-in tokens, emails and your user name are taken out, and you can read it on GitHub before sending.
              </span>
            </div>
            <Switch checked={withLog} onChange={setWithLog} label="Include the recent app log" />
          </label>
        )}
        <p className="text-small text-tertiary">
          StreamHub {info?.version ?? ''} · {feedbackWhere(kind, window.api.platform, { bigPicture, steam: info?.steam }).join(', ')}
        </p>
      </div>
    </Dialog>
  )
}
