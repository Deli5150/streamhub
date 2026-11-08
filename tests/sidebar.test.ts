import { beforeAll, describe, expect, it } from 'vitest'

// The UI store reads/writes localStorage; give it an in-memory one outside the browser.
const mem = new Map<string, string>()
beforeAll(() => {
  globalThis.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0
  } as Storage
})

describe('sidebar on navigation', () => {
  it('reopens on Home and stays minimized in a non-empty multi-view', async () => {
    const { useUi } = await import('../src/renderer/src/store')
    const ui = (): ReturnType<typeof useUi.getState> => useUi.getState()

    ui().set({ collapsed: true })
    ui().go({ kind: 'home' })
    expect(ui().collapsed).toBe(false)

    ui().addToMulti('twitch:a') // starts a multi-view → minimized
    expect(ui().view.kind).toBe('multi')
    expect(ui().collapsed).toBe(true)

    ui().set({ collapsed: true })
    ui().go({ kind: 'home' })
    expect(ui().collapsed).toBe(false)

    ui().go({ kind: 'multi' }) // back to multi-view with a stream playing
    expect(ui().collapsed).toBe(true)
    expect(mem.get('collapsed')).toBe('1')

    ui().setMulti([]) // empty multi-view leaves the sidebar alone
    ui().set({ collapsed: false })
    ui().go({ kind: 'multi' })
    expect(ui().collapsed).toBe(false)

    ui().go({ kind: 'accounts' }) // other views don't change it
    ui().set({ collapsed: true })
    ui().go({ kind: 'accounts' })
    expect(ui().collapsed).toBe(true)
  })
})
