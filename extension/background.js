/**
 * DSH Tab Bridge — service worker.
 *
 * WHY THIS EXISTS
 * ---------------
 * The launcher's 「标签页」 group used to read the browser through a CDP debug
 * port (127.0.0.1:9222). That approach is structurally wrong twice over:
 *   1. Chrome only opens a debug port AT LAUNCH, so it can never attach to the
 *      browser the user actually browses in — it needs a second, empty profile.
 *   2. The port is process-scoped, so it dies with the browser and on reboot.
 * OpenAI's Codex solves this with a Chrome extension plus a native messaging
 * host (see its `plugins/browser/scripts/check-native-host-manifest.js`, which
 * writes an HKCU NativeMessagingHosts key).
 *
 * This extension is the same idea with one simplification: Codex needs native
 * messaging because it must CONTROL the browser; we only need to READ tab
 * metadata. An MV3 extension with host permission for 127.0.0.1 can POST to
 * the Harness directly and bypass CORS — so no registry key and no native host
 * binary are required. The user's real browser, real logins, and survival
 * across reboots all come for free.
 *
 * WHAT IT PUSHES
 * --------------
 * Read-only tab metadata: id, title, url, favIconUrl, browser. It issues no
 * browser commands and never reads page content.
 *
 * RUNS ON CHROMIUM *AND* FIREFOX
 * ------------------------------
 * manifest.json declares BOTH background keys, `service_worker` and `scripts`,
 * and both point at this file. That is Mozilla's documented cross-browser
 * layout, and the reason the rationale lives here instead of in manifest.json
 * is that Firefox parses that file as strict JSON -- comments are a parse error.
 *
 *   Firefox: no MV3 service worker at all (bugzil.la/1573659), so it uses
 *            `background.scripts`. Before Firefox 121 an extension that ALSO
 *            carried `service_worker` never started its background page at all
 *            (bugzil.la/1860304); Firefox 121 fixed that, which is exactly why
 *            browser_specific_settings.gecko.strict_min_version is 121.0.
 *   Chrome/Edge: MV3 only runs service workers. They REFUSED to load a
 *            manifest with `background.scripts` before Chrome 121; from
 *            Chrome 121 on the key is simply ignored.
 *            Chrome ignores browser_specific_settings entirely.
 *   Source: developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
 *           (section "浏览器支持" / "Browser support", fetched 2026-10-13), which
 *           ships this exact two-key example. Chrome 121 = 2024-01-16, so the
 *           floor below is satisfied by every current Chromium.
 *
 * Only one file is ever loaded per engine, so there is one background script to
 * maintain -- not two.
 */

/**
 * Cross-browser API namespace.
 *
 * Chrome/Edge expose ONLY `chrome` (callbacks, plus promises in MV3).
 * Firefox exposes BOTH: `browser` (promise-first) and `chrome` (callback-first,
 * kept for Chrome compatibility). Preferring `browser` where it exists means
 * every call in this file is a promise on both engines, so there is exactly one
 * code path. Deliberately NOT using webextension-polyfill: it would be a
 * dependency for four namespaces that are already promise-capable.
 *
 * The per-call-site divergences that remain are noted where they occur below.
 */
const api = globalThis.browser ?? globalThis.chrome

/**
 * UI strings.
 *
 * The status line this worker records is read back by the popup, so it has to
 * be in the same language the popup is in. Strings live in
 * `_locales/<tag>/messages.json` and come from the browser's own i18n service;
 * `{name}` placeholders are substituted here, because the two engines spell the
 * service's own placeholder syntax differently.
 */
function t (key, vars) {
  let text = ''
  try {
    text = api.i18n.getMessage(key) || ''
  } catch {
    /* No i18n service (or a manifest without default_locale): show the key. */
  }
  if (text === '') text = key
  for (const name of Object.keys(vars || {})) {
    text = text.split('{' + name + '}').join(String(vars[name]))
  }
  return text
}

/**
 * Port the bridge pushes to unless the popup overrides it.
 *
 * This is the host plugin's FIXED bridge port, deliberately NOT the Web GUI
 * port: the desktop shell picks the GUI port at launch and falls back to a
 * random one when 43129 is taken. Measured 2026-09-24 — a leftover harness of a
 * dead Desktop instance kept 43129, the live GUI came up on 63245, and every
 * push landed in the DEAD instance, so the menu said "扩展未连" while this
 * extension was pushing perfectly. 43130 is owned by the plugin alone.
 */
const DEFAULT_PORT = 43130

/** The Web GUI port 0.1.0 defaulted to; a stored value equal to it is migrated. */
const LEGACY_PORT = 43129

/**
 * Heartbeat period in minutes.
 *
 * Hygiene only: every tab lifecycle event already pushes immediately, so this
 * is the idle-browser floor. Chromium clamps MV3 alarms to ~30 s, and the Host
 * keeps a pushed list authoritative for 65 s, i.e. longer than this period —
 * the two numbers have to stay in that order or a healthy extension goes stale
 * between beats and the launcher falls back to a debug port that is not there.
 */
const HEARTBEAT_MINUTES = 1

/** Pages that are not the user's browsing: internal, extension, devtools. */
const NON_BROWSING = /^(?:chrome|edge|brave|opera|vivaldi|about|devtools|chrome-extension|extension|moz-extension):/i

/** The configured port, falling back to the default. */
async function currentPort () {
  try {
    /* storage.local.get: promise on both engines (Chrome MV3 and Firefox both
       return one; only the MV2 callback form needed a callback). */
    const stored = await api.storage.local.get('port')
    const port = Number(stored.port)
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT
  } catch {
    return DEFAULT_PORT
  }
}

/**
 * Move a stored legacy port onto the fixed bridge port.
 *
 * 0.1.0 defaulted to the Web GUI port and the popup saved whatever was in the
 * field, so a stored 43129 is the old default rather than a decision. Any other
 * stored value is a deliberate choice and is left alone.
 */
async function migrateLegacyPort () {
  try {
    const stored = await api.storage.local.get('port')
    if (Number(stored.port) === LEGACY_PORT) await api.storage.local.set({ port: DEFAULT_PORT })
  } catch {
    /* storage is a nicety; the DEFAULT_PORT already applies without it */
  }
}

/** Record the outcome so the popup can show something truthful. */
async function record (patch) {
  try {
    await api.storage.local.set(patch)
  } catch {
    /* storage is a nicety; never let it break the push */
  }
}

/**
 * Human name of the browser this extension runs in.
 *
 * F4 — the launcher's tab row ends with '· <browser>'. A hardcoded 'Edge'
 * would be wrong the moment the same extension is loaded anywhere else, and
 * Chromium's UA-CH brands are the only truthful source available to a service
 * worker. Returns '' rather than guessing, and the row then renders without
 * the suffix.
 * @returns {string} a browser name such as 'Edge', or '' when unknown.
 */
function browserName () {
  try {
    const brands = navigator.userAgentData && navigator.userAgentData.brands
    if (Array.isArray(brands)) {
      for (const brand of brands) {
        if (brand && typeof brand.brand === 'string' && brand.brand !== '' && brand.brand !== 'Chromium') {
          return brand.brand
        }
      }
    }
    const ua = navigator.userAgent
    /* Firefox has no navigator.userAgentData at all, so the UA string is the
       only source there -- and it is the FIRST check, because every Chromium
       UA also carries a Chrome/ token that would otherwise win. */
    if (/Firefox\//.test(ua)) return 'Firefox'
    if (/Edg\//.test(ua)) return 'Edge'
    if (/OPR\//.test(ua)) return 'Opera'
    if (/Brave/.test(ua)) return 'Brave'
    if (/Vivaldi/.test(ua)) return 'Vivaldi'
    if (/Chrome\//.test(ua)) return 'Chrome'
  } catch {
    /* UA probing is a nicety; the row simply loses its suffix. */
  }
  return ''
}

/** Collect the user's browsing tabs in the shape the launcher renders. */
async function collectTabs () {
  /* tabs.query: promise on both engines. Firefox needs the `tabs` permission
     (declared) to see `url`/`title`/`favIconUrl`, same as Chrome. */
  const tabs = await api.tabs.query({})
  return tabs
    .filter((tab) => typeof tab.url === 'string' && tab.url !== '' && !NON_BROWSING.test(tab.url))
    .map((tab) => {
      let host = ''
      try {
        host = new URL(tab.url).host
      } catch {
        host = ''
      }
      return {
        id: String(tab.id),
        title: tab.title !== undefined && tab.title !== '' ? tab.title : host,
        url: tab.url,
        host,
        favIconUrl: typeof tab.favIconUrl === 'string' ? tab.favIconUrl : '',
        browser: browserName()
      }
    })
}

/** Push the tab list to the Harness route. Never throws. */
async function push () {
  const port = await currentPort()
  const tabs = await collectTabs()
  const endpoint = 'http://127.0.0.1:' + port + '/composer-launcher/tabs'
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tabs })
    })
    if (!response.ok) {
      await record({ lastStatus: 'HTTP ' + response.status + ' @ ' + port, lastOk: false, lastCount: tabs.length, lastAt: Date.now() })
      return
    }
    await record({ lastStatus: t('statusConnected', { port }), lastOk: true, lastCount: tabs.length, lastAt: Date.now() })
  } catch (error) {
    /* The Harness simply is not running, or the port is wrong. Both are
       normal states, so this stays silent apart from the popup's status. */
    await record({
      lastStatus: t('statusUnreachable', { endpoint, error: error instanceof Error ? error.message : String(error) }),
      lastOk: false,
      lastCount: tabs.length,
      lastAt: Date.now()
    })
  }
}

/**
 * Make sure the heartbeat alarm exists.
 *
 * DIVERGENCE: `alarms.create` returns `undefined` on Chrome and a PROMISE on
 * Firefox (which also rejects on bad input). Funnelling both through
 * `Promise.resolve` keeps a Firefox rejection from surfacing as an unhandled
 * rejection in the extension console, without branching on the engine.
 */
function ensureHeartbeat () {
  Promise.resolve(api.alarms.create('dsh-tab-bridge', { periodInMinutes: HEARTBEAT_MINUTES })).catch(() => {})
}

/* Tab lifecycle events — the launcher should feel live, not polled.
   Firefox implements all seven, so the list stays uniform across engines. */
for (const event of [api.tabs.onCreated, api.tabs.onUpdated, api.tabs.onRemoved, api.tabs.onActivated, api.tabs.onMoved, api.tabs.onAttached, api.tabs.onDetached]) {
  event.addListener(() => { push() })
}

api.runtime.onStartup.addListener(() => { push() })
api.runtime.onInstalled.addListener(() => {
  ensureHeartbeat()
  push()
})

api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dsh-tab-bridge') push()
})

/* The popup can request an immediate push and read/write the port.
   `return true` + `sendResponse` is the ONE async-response form both engines
   accept: Mozilla documents it as the alternative when a returned Promise is
   unavailable, and returning a Promise from this listener only works on
   Chrome 122+. So the callback shape is kept -- only the namespace changes. */
api.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message === undefined || message === null) return false
  if (message.type === 'push-now') {
    push().then(() => respond({ ok: true }), () => respond({ ok: false }))
    return true
  }
  if (message.type === 'get-status') {
    api.storage.local.get(['lastStatus', 'lastOk', 'lastCount', 'lastAt', 'port']).then((state) => {
      respond(state)
    }, () => respond({}))
    return true
  }
  return false
})

/* First run of a worker: make sure the heartbeat exists, and that a port 0.1.0
   saved (the Web GUI port) does not outvote the fixed bridge port. */
ensureHeartbeat()
void migrateLegacyPort().then(() => push())
