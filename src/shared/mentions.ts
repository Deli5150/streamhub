// @mentions in stream chat (issue #23): who's been chatting, read from the platform's chat page,
// and which of them match the @name being typed. Desktop: StreamHub's chat box (ChatBox.tsx). Phones:
// the platform's own chat page and the iPhone's YouTube box (mobile/src/ui/Chat.tsx).

/**
 * The names of people in the chat page's recent messages, newest first: Twitch, Kick, YouTube (whose
 * names are @handles), Rumble. For @mentions in the message box.
 */
export const CHATTER_NAMES = `(() => {
  const els = document.querySelectorAll([
    '[data-a-target="chat-message-username"]', '.chat-author__display-name',
    '#chatroom-messages .chat-entry-username', '#chatroom-messages button[title][data-prevent-expand]', '#chatroom-messages [data-chat-entry] button[title]',
    'yt-live-chat-text-message-renderer #author-name', 'yt-live-chat-paid-message-renderer #author-name',
    '.chat-history--username', '.chat-history--username-link'
  ].join(','))
  const seen = new Set()
  const names = []
  for (let i = els.length - 1; i >= 0 && names.length < 200; i--) {
    const el = els[i]
    const name = (el.getAttribute('title') || el.textContent || '').trim().replace(/^@/, '').replace(/:$/, '')
    const key = name.toLowerCase()
    if (!name || name.length > 40 || /\\s/.test(name) || seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
})()`

/** The @name being typed at the cursor, if any: where its @ is and what follows it. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const m = /(?:^|\s)@([\w.-]*)$/.exec(text.slice(0, caret))
  return m ? { start: caret - m[1].length - 1, query: m[1] } : null
}

/**
 * The matching, as JavaScript source: the phones run it inside the chat page (Hermes can't turn a
 * function back into source, and the desktop's page doesn't allow eval, so it's written twice). Names starting with the query first, then ones containing it; 8 at most.
 */
export const MATCH_JS = `function (names, query) {
  var q = query.toLowerCase(), starts = [], has = [];
  for (var i = 0; i < names.length; i++) {
    var n = names[i].toLowerCase();
    if (n.indexOf(q) === 0) starts.push(names[i]);
    else if (q && n.indexOf(q) > 0) has.push(names[i]);
  }
  return starts.concat(has).slice(0, 8);
}`

/** The people in chat matching `query`: the same as MATCH_JS (tests/mentions.test.ts checks they agree). */
export function matchMentions(names: string[], query: string): string[] {
  const q = query.toLowerCase()
  const starts = names.filter((n) => n.toLowerCase().startsWith(q))
  const has = q ? names.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q)) : []
  return [...starts, ...has].slice(0, 8)
}

/**
 * Phones: @mentions in a platform's own chat page (the message box is the page's). While an @name is
 * typed in the page's message box, a list of the people chatting who match shows just above it; a tap
 * puts the name in, the way typing would, so the page's own editor takes it. Run in the chat WebView.
 */
export function mentionHelperScript(theme: { dark: boolean; accent: string }): string {
  const bg = theme.dark ? 'rgba(28,28,32,0.98)' : 'rgba(255,255,255,0.98)'
  const fg = theme.dark ? '#f2f2f5' : '#16161a'
  const dim = theme.dark ? 'rgba(242,242,245,0.55)' : 'rgba(22,22,26,0.5)'
  const line = theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  return `(function () {
  if (window.__streamhubMentions) return;
  window.__streamhubMentions = true;
  var names = function () { try { return ${CHATTER_NAMES} } catch (e) { return [] } };
  var match = ${MATCH_JS};
  // touching: a finger is on the list (it isn't rebuilt then, or the tap would land on a replaced row).
  var panel = null, current = null, touching = false, builtAt = 0;
  var field = function (el) { return el && el.closest ? el.closest('textarea, input[type="text"], input:not([type]), [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]') : null };
  var textBefore = function (el) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value.slice(0, el.selectionStart || 0);
    var sel = getSelection();
    if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return '';
    var r = sel.getRangeAt(0).cloneRange();
    r.setStart(el, 0);
    return r.toString();
  };
  var hide = function () { if (panel) { panel.remove(); panel = null } current = null; touching = false };
  var insert = function (el, name, query) {
    var text = '@' + name + ' ';
    // The phone's keyboard holds the word being typed as a "composition"; an editor like Kick's puts
    // that word back over anything inserted meanwhile. Leaving the box and coming straight back ends
    // the composition (still within the tap, so the keyboard stays up), keeping the cursor where it was.
    var sel0 = getSelection();
    var saved = sel0 && sel0.rangeCount ? sel0.getRangeAt(0).cloneRange() : null;
    var caret = el.selectionStart;
    el.blur();
    el.focus();
    if (saved && !(el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) { sel0.removeAllRanges(); sel0.addRange(saved) }
    if (typeof caret === 'number' && el.setSelectionRange) el.setSelectionRange(caret, caret);
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      var end = el.selectionStart || 0, start = end - query.length - 1;
      var value = el.value.slice(0, start) + text + el.value.slice(end).replace(/^\\s+/, '');
      var setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.setSelectionRange(start + text.length, start + text.length);
    } else {
      // Rich editors (Kick's) take in a selection change a moment later: select the @name and insert
      // only once they have, or the wrong letters get replaced.
      var later = function (fn) { requestAnimationFrame(function () { setTimeout(fn, 0) }) };
      later(function () {
        var sel = getSelection();
        for (var i = 0; i < query.length + 1; i++) sel.modify('extend', 'backward', 'character');
        later(function () { document.execCommand('insertText', false, text) });
      });
    }
    hide();
  };
  var show = function (el, list, query) {
    // Busy chats change who's listed all the time: refresh at most every 1.5 s while the @name stays the same.
    if (panel && current === query && Date.now() - builtAt < 1500) return place(el);
    current = query;
    builtAt = Date.now();
    if (!panel) {
      panel = document.createElement('div');
      panel.setAttribute('role', 'listbox');
      panel.style.cssText = 'position:fixed;left:8px;right:8px;z-index:2147483647;background:${bg};border:1px solid ${line};border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.35);overflow:hidden;font:15px -apple-system,Roboto,system-ui,sans-serif;max-height:40vh;overflow-y:auto';
      document.body.appendChild(panel);
    }
    panel.innerHTML = '<div style="padding:8px 14px 4px;font-size:12px;font-weight:600;color:${dim}">Mention</div>';
    list.forEach(function (name, i) {
      var row = document.createElement('div');
      row.setAttribute('role', 'option');
      row.textContent = '@' + name;
      row.style.cssText = 'padding:10px 14px;color:' + (i === 0 ? '${theme.accent}' : '${fg}') + ';font-weight:' + (i === 0 ? 600 : 400) + ';border-top:1px solid ${line}';
      // Keep the message box focused (and the keyboard up) while picking. The name goes in when the
      // finger lifts: some chat pages (Kick's) handle touches themselves, and no click follows then.
      var down = null;
      var pick = function () { touching = false; down = null; insert(el, name, query) };
      row.addEventListener('pointerdown', function (e) { e.preventDefault(); touching = true; down = { x: e.clientX, y: e.clientY } });
      row.addEventListener('pointerup', function (e) {
        if (down && Math.abs(e.clientX - down.x) < 12 && Math.abs(e.clientY - down.y) < 12) { e.preventDefault(); pick() }
        else setTimeout(function () { touching = false }, 400);
      });
      row.addEventListener('pointercancel', function () { touching = false; down = null });
      row.addEventListener('mousedown', function (e) { e.preventDefault() });
      row.addEventListener('click', function (e) { e.preventDefault(); if (panel && row.isConnected) pick() });
      panel.appendChild(row);
    });
    place(el);
  };
  var place = function (el) {
    var r = el.getBoundingClientRect();
    panel.style.bottom = Math.max(8, innerHeight - r.top + 6) + 'px';
  };
  var update = function () {
    if (touching) return;
    var el = field(document.activeElement);
    if (!el) return hide();
    var m = /(?:^|\\s)@([\\w.-]*)$/.exec(textBefore(el));
    if (!m) return hide();
    var list = match(names(), m[1]);
    if (!list.length) return hide();
    show(el, list, m[1]);
  };
  document.addEventListener('input', update, true);
  document.addEventListener('keyup', update, true);
  document.addEventListener('selectionchange', update);
  document.addEventListener('focusout', function () { setTimeout(function () { if (!field(document.activeElement)) hide() }, 200) }, true);
  addEventListener('resize', function () { if (panel && current) update() });
})(); true;`
}
