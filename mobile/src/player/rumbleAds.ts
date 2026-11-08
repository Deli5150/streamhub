// Rumble ad removal for the embedded player. Rumble writes each video's ad schedule into the embed
// page itself (`"a":{…,"aden":[1,0,0],"ads":[{…waterfall of ad-server URLs…}]}`), loads Google's ad
// SDK (IMA), and asks its own ad server (*.ads.rmbl.ws) for the ads. So:
// 1. The app loads the embed page itself and empties the schedule (stripRumbleAds), then gives the
//    player the cleaned page.
// 2. Inside the player, RUMBLE_AD_SCRIPT stops the ad SDK from loading, answers ad-server requests
//    with an empty ad response, and empties the schedule of any video settings fetched later.

/** Index just past the bracket that closes the one at `open` (strings and escapes respected). */
function closingBracket(text: string, open: number): number {
  const pairs: Record<string, string> = { '[': ']', '{': '}' }
  const stack: string[] = []
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++
      continue
    }
    if (pairs[ch]) stack.push(pairs[ch])
    else if (ch === stack[stack.length - 1]) {
      stack.pop()
      if (!stack.length) return i + 1
    }
  }
  return -1
}

/** The embed page with every ad schedule emptied and ads switched off. */
export function stripRumbleAds(html: string): { html: string; removed: number } {
  let out = ''
  let at = 0
  let removed = 0
  for (;;) {
    const key = html.indexOf('"ads":[', at)
    if (key < 0) break
    const open = key + '"ads":'.length
    const end = closingBracket(html, open)
    if (end < 0) break
    out += html.slice(at, open) + '[]'
    if (end - open > 2) removed++
    at = end
  }
  out += html.slice(at)
  const html2 = withoutPauseAds(out).replace(/"aden":\[[\d,\s]*\]/g, '"aden":[0,0,0]').replace(/"show_pause_ads":true/g, '"show_pause_ads":false')
  return { html: html2, removed }
}

/** Ads shown while the video is paused are set up separately (`"pause_ads_params":{…}`). */
function withoutPauseAds(html: string): string {
  const key = '"pause_ads_params":'
  let out = ''
  let at = 0
  for (let i = html.indexOf(key); i >= 0; i = html.indexOf(key, at)) {
    const open = i + key.length
    const end = html[open] === '{' ? closingBracket(html, open) : -1
    if (end < 0) break
    out += html.slice(at, open) + 'null'
    at = end
  }
  return out + html.slice(at)
}

/** Runs at the start of the Rumble player page (see the top of this file). */
export const RUMBLE_AD_SCRIPT = `(function () {
  if (window.__shRumbleAds) return;
  window.__shRumbleAds = true;
  var isAdServer = function (u) { return /(^|\\.)ads\\.rmbl\\.ws\\//.test(String(u).replace(/^https?:\\/\\//, '')) };
  var isIma = function (u) { return /imasdk\\.googleapis\\.com/.test(String(u)) };
  var EMPTY_VAST = '<?xml version="1.0" encoding="UTF-8"?><VAST version="3.0"></VAST>';
  var strip = function (o) {
    if (!o || typeof o !== 'object') return o;
    var off = function (v) { if (v && v.a && typeof v.a === 'object') { v.a.ads = []; v.a.aden = [0, 0, 0]; if (v.a.pause_ads_params) v.a.pause_ads_params = null; } };
    off(o);
    for (var k in o) if (o[k] && typeof o[k] === 'object') off(o[k]);
    return o;
  };
  var cleanJson = function (text) {
    try { return JSON.stringify(strip(JSON.parse(text))); } catch (e) { return text; }
  };

  // The ad SDKs (Google's, and Rumble's pause-ad script) never load; the player's check for them
  // fails and it plays the video.
  var srcProp = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
  if (srcProp && srcProp.set) {
    Object.defineProperty(HTMLScriptElement.prototype, 'src', Object.assign({}, srcProp, {
      set: function (v) {
        if (isIma(v) || isAdServer(v)) { var el = this; setTimeout(function () { el.dispatchEvent(new Event('error')); }, 0); return; }
        srcProp.set.call(this, v);
      }
    }));
  }

  var realFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (isAdServer(url) || isIma(url)) return Promise.resolve(new Response(EMPTY_VAST, { status: 200, headers: { 'Content-Type': 'text/xml' } }));
    return realFetch.apply(this, arguments).then(function (res) {
      if (!/\\/embedJS\\//.test(url) || !res.ok) return res;
      return res.text().then(function (t) { return new Response(cleanJson(t), { status: res.status, headers: res.headers }); });
    });
  };

  var open = XMLHttpRequest.prototype.open;
  var send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__shUrl = String(url);
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var xhr = this, url = xhr.__shUrl || '';
    if (isAdServer(url) || isIma(url)) {
      // Answer as an empty ad response instead of asking the ad server.
      ['readyState', 'status', 'responseText', 'response', 'responseXML'].forEach(function (k) {
        Object.defineProperty(xhr, k, { configurable: true, get: function () {
          return k === 'readyState' ? 4 : k === 'status' ? 200 : k === 'responseXML' ? new DOMParser().parseFromString(EMPTY_VAST, 'text/xml') : EMPTY_VAST;
        } });
      });
      setTimeout(function () {
        xhr.dispatchEvent(new Event('readystatechange'));
        xhr.dispatchEvent(new Event('load'));
        xhr.dispatchEvent(new Event('loadend'));
      }, 0);
      return;
    }
    if (/\\/embedJS\\//.test(url)) {
      xhr.addEventListener('readystatechange', function () {
        if (xhr.readyState !== 4) return;
        var raw = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText').get.call(xhr);
        var clean = cleanJson(raw);
        Object.defineProperty(xhr, 'responseText', { configurable: true, get: function () { return clean; } });
        if (xhr.responseType === '' || xhr.responseType === 'text') Object.defineProperty(xhr, 'response', { configurable: true, get: function () { return clean; } });
        else if (xhr.responseType === 'json') Object.defineProperty(xhr, 'response', { configurable: true, get: function () { try { return JSON.parse(clean); } catch (e) { return null; } } });
      }, true);
    }
    return send.apply(this, arguments);
  };
})(); true;`
