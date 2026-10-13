/**
 * DSH Tab Bridge — popup.
 *
 * Read-only status surface: whether the last push reached the Harness, how
 * many tabs it carried, and which port it used. The port stays editable so a
 * pack can be pointed at a differently-configured host, but 43130 is the host
 * plugin's fixed bridge port and is what this defaults to.
 */

const DEFAULT_PORT = 43130

/**
 * Cross-browser namespace.
 *
 * Chrome/Edge expose ONLY `chrome`; Firefox exposes both `browser`
 * (promise-first) and `chrome` (callback-first). Preferring `browser` where it
 * exists makes every call below a promise on both engines, so there is exactly
 * one code path and no `runtime.lastError` dance — a failure is just a rejected
 * await. No polyfill: both engines are promise-capable for storage/runtime.
 */
const api = globalThis.browser ?? globalThis.chrome

const dot = document.getElementById('dot')
const status = document.getElementById('status')
const portInput = document.getElementById('port')
const saveButton = document.getElementById('save')
const hint = document.getElementById('hint')

/**
 * UI strings.
 *
 * Every string the user can read lives in `_locales/<tag>/messages.json` and is
 * fetched through the browser's own i18n service, so the popup follows the
 * browser's interface language instead of being pinned to one language. The
 * resolved tag is also written to <html>, because the font stack and the
 * line-breaking rules key off it.
 *
 * `{name}` placeholders are substituted here rather than through the service's
 * own placeholder syntax: Chrome and Firefox spell that syntax differently, and
 * a missing placeholder would come out as an empty string on one of them.
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

/** Apply the interface language to the DOM, once, before the first render. */
function applyLanguage () {
  try {
    document.documentElement.lang = api.i18n.getUILanguage()
  } catch {
    /* Keep whatever the document already declares. */
  }
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.getAttribute('data-i18n'))
  }
}

applyLanguage()

/** Render one status snapshot. */
function render (state) {
  const ok = state.lastOk === true
  dot.className = 'dot ' + (state.lastOk === undefined ? '' : (ok ? 'ok' : 'bad'))
  if (state.lastStatus === undefined) {
    status.textContent = t('statusNever')
  } else {
    status.textContent = state.lastStatus + ' · ' +
      t('statusTabs', { count: state.lastCount === undefined ? '?' : state.lastCount })
  }
  portInput.value = state.port === undefined ? DEFAULT_PORT : state.port
  hint.textContent = state.lastAt === undefined
    ? ''
    : t('hintLastPush', { time: new Date(state.lastAt).toLocaleTimeString() })
}

/** Ask the worker for the current status. */
function refresh () {
  /* Rejects when the worker has no listener (asleep, or mid-restart). Keep the
     last render instead of blanking the popup — this replaces the old
     `runtime.lastError` check, which only exists on the callback form. */
  api.runtime.sendMessage({ type: 'get-status' }).then(
    (state) => { render(state === undefined || state === null ? {} : state) },
    () => {}
  )
}

saveButton.addEventListener('click', async () => {
  const port = Number(portInput.value)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    status.textContent = t('errPort')
    dot.className = 'dot bad'
    return
  }
  try {
    await api.storage.local.set({ port })
    await api.runtime.sendMessage({ type: 'push-now' })
  } catch {
    /* Best effort: a worker that is not listening still picks the port up from
       storage the next time it runs. */
  }
  /* The worker writes the outcome back into storage; give it a beat. */
  setTimeout(refresh, 400)
})

refresh()
