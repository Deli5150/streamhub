import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { RUMBLE_AD_SCRIPT, stripRumbleAds } from '../src/player/rumbleAds'

// A page shaped like Rumble's embed page: the player's settings object, with an ad schedule whose
// entries hold nested objects, arrays and strings containing brackets.
const settings = (ads: string): string =>
  `{"fps":30,"title":"A [test] video","a":{"timeout":-1,"u":"4","aden":[1,0,0],"ov":false,"ads":${ads},"pause_ads_params":{"url":"https://rumble.com/embed/v1/","n":{"x":[1]}}},"live":0,"share_url":"https://rumble.com/share/x"}`
const schedule =
  '[{"timecode":0,"is_midroll":false,"waterfall":[{"url":"https://a.ads.rmbl.ws/video?a=15&t=]x[","type":"vast"}],"meta":{"k":"v"}},{"timecode":600,"is_midroll":true,"waterfall":[]}]'
const page = (ads: string): string => `<html><script>!function(){var m={f:{}};m.f["v1"]=${settings(ads)};Rumble("play",{"video":{"id":"v1"}})}()</script></html>`

describe('stripRumbleAds', () => {
  it('empties the ad schedule and switches ads off, leaving everything else as it was', () => {
    const { html, removed } = stripRumbleAds(page(schedule))
    expect(removed).toBe(1)
    expect(html).toBe(page('[]').replace('"aden":[1,0,0]', '"aden":[0,0,0]').replace(/"pause_ads_params":\{.*?\}\}/, '"pause_ads_params":null'))
    expect(html).not.toContain('ads.rmbl.ws')
    expect(stripRumbleAds('{"pause_ads":{"show_pause_ads":true,"pause_ads_sdk":"x"}}').html).toContain('"show_pause_ads":false')
    expect(html).toContain('"title":"A [test] video"')
  })

  it('leaves a page without ads alone', () => {
    const plain = '<html><script>var x={"title":"no ads here"}</script></html>'
    expect(stripRumbleAds(plain)).toEqual({ html: plain, removed: 0 })
  })
})

/** A fake Rumble player page with the script injected. */
function playerPage(network: (url: string) => string) {
  class FakeXHR extends EventTarget {
    __shUrl?: string
    responseType = ''
    url = ''
    get readyState(): number {
      return 4
    }
    get status(): number {
      return 200
    }
    get responseText(): string {
      return network(this.url)
    }
    get response(): string {
      return this.responseText
    }
    open(_m: string, url: string): void {
      this.url = url
    }
    send(): void {
      setTimeout(() => {
        this.dispatchEvent(new Event('readystatechange'))
        this.dispatchEvent(new Event('load'))
      }, 0)
    }
  }
  class HTMLScriptElement extends EventTarget {
    loaded: string[] = []
    get src(): string {
      return this.loaded.at(-1) ?? ''
    }
    set src(v: string) {
      this.loaded.push(v)
    }
  }
  const sandbox: Record<string, unknown> = {
    Response,
    Event,
    EventTarget,
    JSON,
    Object,
    Promise,
    String,
    setTimeout,
    DOMParser: class {
      parseFromString(t: string): string {
        return t
      }
    },
    XMLHttpRequest: FakeXHR,
    HTMLScriptElement,
    fetch: async (url: string) => new Response(network(url))
  }
  sandbox.window = sandbox
  vm.runInNewContext(RUMBLE_AD_SCRIPT, sandbox)
  return sandbox as { fetch: typeof fetch; XMLHttpRequest: typeof FakeXHR; HTMLScriptElement: typeof HTMLScriptElement }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 10))

describe('Rumble player ad script', () => {
  const network = (url: string): string => (url.includes('/embedJS/') ? settings(schedule) : url.includes('ads.rmbl.ws') ? '<VAST><Ad>real ad</Ad></VAST>' : 'ok')

  it('answers the ad server with an empty ad response', async () => {
    const page = playerPage(network)
    expect(await (await page.fetch('https://a.ads.rmbl.ws/video?a=15')).text()).not.toContain('real ad')
    const xhr = new page.XMLHttpRequest()
    xhr.open('GET', 'https://a.ads.rmbl.ws/video?a=15')
    xhr.send()
    await tick()
    expect(xhr.responseText).toMatch(/<VAST version="3.0"><\/VAST>/)
  })

  it('empties the schedule of video settings the player fetches', async () => {
    const page = playerPage(network)
    const viaFetch = JSON.parse(await (await page.fetch('https://rumble.com/embedJS/u4/?request=video&v=v1')).text())
    expect(viaFetch.a.ads).toEqual([])
    expect(viaFetch.a.aden).toEqual([0, 0, 0])
    const xhr = new page.XMLHttpRequest()
    xhr.open('GET', 'https://rumble.com/embedJS/u4/?request=video&v=v1')
    xhr.send()
    await tick()
    expect(JSON.parse(xhr.responseText).a.ads).toEqual([])
    expect(JSON.parse(xhr.responseText).title).toBe('A [test] video')
  })

  it('keeps Google’s ad SDK from loading, and other scripts load normally', async () => {
    const page = playerPage(network)
    const ima = new page.HTMLScriptElement()
    let failed = false
    ima.addEventListener('error', () => (failed = true))
    ima.src = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js'
    await tick()
    expect(ima.loaded).toEqual([])
    expect(failed).toBe(true)
    const pauseAds = new page.HTMLScriptElement()
    pauseAds.src = 'https://a.ads.rmbl.ws/pausejs?a=469'
    expect(pauseAds.loaded).toEqual([])
    const other = new page.HTMLScriptElement()
    other.src = 'https://rumble.com/j/player.js'
    expect(other.loaded).toEqual(['https://rumble.com/j/player.js'])
  })

  it('leaves other requests alone', async () => {
    const page = playerPage(network)
    expect(await (await page.fetch('https://rumble.com/other')).text()).toBe('ok')
  })
})
