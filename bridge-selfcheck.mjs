/**
 * dsh-composer-launcher — extension-bridge self-check.
 *
 * WHAT IT PROVES
 * --------------
 * The bridge is a real TCP socket owned by the Host half, and its hardest
 * property is cross-PROCESS:
 * when a newer DSH starts while an older one still runs, the older instance has
 * to step aside so the extension keeps feeding the instance the user is looking
 * at. Nothing in jsdom can observe that, so it is checked here, against the
 * deployed Host half, with two real Node processes.
 *
 * USAGE
 * -----
 *   node bridge-selfcheck.mjs                     # deployed Host half
 *   node bridge-selfcheck.mjs --plugin <entry>     # another Host-half entry
 *
 * It runs AFTER install.ps1: the Host half imports @deepseek-ai/schemastery, so
 * it only resolves from the profile (that is also exactly how DSH loads it).
 * Ports 43197-43199 are used on purpose — never 43130, so a self-check can
 * never steal the bridge of the DSH that is currently running.
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

/** Test ports, deliberately away from the production bridge port 43130. */
const PRIMARY = 43199
const TAKEOVER = 43198
const FOREIGN = 43197

/** Where the Host half lives once installed (the profile links the generation). */
function defaultPluginEntry () {
  const home = process.env.DSH_HOME ?? join(process.env.APPDATA ?? '', 'dsh-desktop', 'harness')
  return join(home, 'profiles', 'web', 'node_modules', 'dsh-composer-launcher', 'lib', 'index.js')
}

/** Read one `--flag value` argument. */
function argument (name, fallback) {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback
}

const logger = {
  info: (message) => { console.log(`    · ${message}`) },
  warn: (message) => { console.log(`    ! ${message}`) }
}

let failures = 0
/** One assertion: print, and count the failure without aborting the run. */
function check (name, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail === '' ? '' : `  [${detail}]`}`)
  if (!condition) failures += 1
}

/** GET/POST a bridge endpoint, JSON in and JSON out; null when unreachable. */
async function call (port, path, body) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, body === undefined
      ? { signal: AbortSignal.timeout(2000) }
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(2000)
        })
    return { status: response.status, body: await response.json() }
  } catch {
    return null
  }
}

/** Wait until `port` answers like a bridge, or give up. */
async function waitForBridge (port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const answer = await call(port, '/composer-launcher/bridge')
    if (answer !== null && answer.body?.bridge === true) return answer.body
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return null
}

const pluginEntry = argument('plugin', defaultPluginEntry())

/* ── child mode: serve one bridge and wait to be told to step aside ────── */
if (process.argv.includes('--serve')) {
  const port = Number(argument('serve', '0'))
  const plugin = await import(pathToFileURL(pluginEntry).href)
  if (typeof plugin.startBridge !== 'function') {
    console.error(`FAIL --serve: ${pluginEntry} exports no startBridge (old Host half?)`)
    process.exit(1)
  }
  const server = await plugin.startBridge(port, logger)
  if (server === null) {
    console.error(`FAIL --serve: bridge did not bind on ${port}`)
    process.exit(1)
  }
  /* `/bridge-yield` closes this socket from inside the plugin; when that
     happens there is nothing left to serve, so the process goes with it. */
  server.on('close', () => { process.exit(0) })
  console.log(`READY ${port}`)
} else {
  await main()
}

/** The real thing: bind, serve, take over, and refuse to touch a stranger. */
async function main () {
  const plugin = await import(pathToFileURL(pluginEntry).href)
  check('Host half exports startBridge', typeof plugin.startBridge === 'function', pluginEntry)
  if (typeof plugin.startBridge !== 'function') {
    process.exit(1)
  }

  /* T1 — a plain bind, and an identity answer a second instance can trust. */
  const primary = await plugin.startBridge(PRIMARY, logger)
  check('bridge binds on 127.0.0.1 and reports itself', primary !== null)
  if (primary === null) {
    process.exit(1)
  }
  const identity = await call(PRIMARY, '/composer-launcher/bridge')
  check('/bridge answers a bridge identity',
    identity?.body?.bridge === true && identity.body.pid === process.pid && identity.body.port === PRIMARY,
    JSON.stringify(identity?.body ?? null))

  /* T2 — a push over the bridge lands in the SAME buffer the menu reads. The
     GET goes through the host route (this process has no webServer, so the
     probe-free fields are what is checked). */
  const pushed = await call(PRIMARY, '/composer-launcher/tabs', {
    tabs: [
      { id: '1', title: '示例一', url: 'https://example.com/a', host: 'example.com', favIconUrl: '', browser: 'Edge' },
      { id: '2', title: '示例二', url: 'https://example.com/b', host: 'example.com', favIconUrl: '', browser: 'Edge' }
    ]
  })
  check('a push over the bridge is accepted', pushed?.body?.accepted === 2, JSON.stringify(pushed?.body ?? null))
  const listed = await call(PRIMARY, '/composer-launcher/tabs?port=1')
  check('the pushed tabs are what the menu route reads back',
    listed?.body?.sources?.extension === 2 && listed.body.source === 'extension' &&
      listed.body.tabs.every((tab) => tab.origin === 'extension'),
    JSON.stringify(listed?.body?.sources ?? null))

  /* T3 — takeover, with a real second process. */
  const child = spawn(process.execPath, [
    fileURLToPath(import.meta.url),
    '--serve', String(TAKEOVER), '--plugin', pluginEntry
  ], { stdio: ['ignore', 'inherit', 'inherit'] })
  const childAnswers = await waitForBridge(TAKEOVER, 10_000)
  check('a second process can hold the bridge', childAnswers !== null && childAnswers.pid !== process.pid,
    JSON.stringify(childAnswers ?? null))
  const childExited = new Promise((resolve) => { child.once('exit', (code) => resolve(code)) })
  const taken = await plugin.startBridge(TAKEOVER, logger)
  check('a newer instance takes the bridge over', taken !== null)
  check('the older instance exited after yielding', await Promise.race([
    childExited,
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000))
  ]) === 0)
  const nowHolder = await call(TAKEOVER, '/composer-launcher/bridge')
  check('the port now answers as THIS process', nowHolder?.body?.pid === process.pid,
    JSON.stringify(nowHolder?.body ?? null))

  /* T4 — a stranger on the port is reported, never fought over. */
  const stranger = createServer((_req, res) => { res.writeHead(200); res.end('not a bridge') })
  await new Promise((resolve) => { stranger.listen(FOREIGN, '127.0.0.1', resolve) })
  const refused = await plugin.startBridge(FOREIGN, logger)
  const strangerAlive = await fetch(`http://127.0.0.1:${FOREIGN}/`).then((r) => r.text()).catch(() => null)
  check('a non-bridge occupant is left alone', refused === null && strangerAlive === 'not a bridge',
    `refused=${refused === null} alive=${strangerAlive}`)

  /* ── cleanup ───────────────────────────────────────────────────────── */
  stranger.close()
  for (const server of [primary, taken]) {
    if (server !== null) {
      try {
        server.close()
      } catch {
        /* already closed by a takeover */
      }
    }
  }
  child.kill()
  console.log(failures === 0 ? '\nALL BRIDGE CHECKS PASSED' : `\n${failures} BRIDGE CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}
