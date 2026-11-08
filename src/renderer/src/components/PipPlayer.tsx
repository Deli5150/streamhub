import { HlsVideo } from './HlsVideo'

/**
 * Root of the picture-in-picture window's page for direct HLS streams (?view=pip&src=…); the
 * window's preload (preload/pip.ts) draws the controls over it.
 */
export function PipPlayer(): React.JSX.Element {
  const src = new URLSearchParams(location.search).get('src') ?? ''
  return <HlsVideo src={src} controls={false} className="fixed inset-0" />
}
