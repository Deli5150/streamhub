import { describe, expect, it } from 'vitest'
import * as scripts from '../../src/main/providers/pageScripts'
import { PAGE_SCRIPT_SOURCES } from '../src/desktop/pageScripts.generated'

// The phone sends these saved sources into web pages (Hermes can't give a function's source back),
// so every page script needs one, and each must stand on its own like the desktop's toString().
describe('saved page script sources', () => {
  const functions = Object.entries(scripts).filter(([, v]) => typeof v === 'function')

  it('covers every page script', () => {
    expect(Object.keys(PAGE_SCRIPT_SOURCES).sort()).toEqual(functions.map(([name]) => name).sort())
  })

  it.each(Object.entries(PAGE_SCRIPT_SOURCES))('%s compiles on its own', (name, source) => {
    const fn = new Function(`return (${source})`)()
    expect(typeof fn).toBe('function')
    expect(fn.name).toBe(name)
  })

  it('collectYouTubeTab gives the same result from its saved source', () => {
    const data = { contents: { twoColumnBrowseResultsRenderer: { tabs: [] } } }
    const fromSource = new Function(`return (${PAGE_SCRIPT_SOURCES.collectYouTubeTab})`)()
    expect(fromSource(data, 'videos')).toEqual(scripts.collectYouTubeTab(data, 'videos'))
  })
})
