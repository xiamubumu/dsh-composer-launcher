/**
 * dsh-composer-launcher — Host half.
 *
 * The launcher itself is a browser-side concern; the ONLY thing the Host has
 * that the browser cannot get on its own is the tab list of the user's local
 * debugging browser. Chrome DevTools Protocol exposes it on
 * `http://127.0.0.1:<port>/json/list`, and that endpoint sends no CORS
 * headers, so a fetch from the Web GUI origin is blocked. This route proxies
 * it.
 *
 * Everything else the launcher shows (the plugin roster, the skills, the
 * slash commands) already has a first-class browser-side source —
 * `ctx.remote.pluginInventory`, the skill service, `ctx.inputTriggers` — so
 * the Host deliberately does not duplicate them.
 *
 * The ONE exception is the profile's mount list (`dsh.profile.bundles`): it
 * lives in a JSON file only this half can read, and the browser's raw Loader
 * inventory (internal/preset layers + repeated packages) is not a usable
 * substitute for it. That is what `/composer-launcher/bundles` publishes.
 *
 * @module dsh-composer-launcher
 */

import z from '@deepseek-ai/schemastery'
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Settings namespace this plugin owns. */
export const SETTINGS_NS = 'composer-launcher'

/**
 * The launcher's persisted settings.
 *
 * Registering this namespace is what makes the browser half's card APPEAR:
 * the Plugins settings tab dispatches `settings.plugin.item` keyed by the
 * namespaces the Host declares, and a key with no namespace is never
 * dispatched. Without this the card exists but is never rendered.
 */
const LauncherSettingsSchema = z.object({
  showWeb: z.boolean().default(true).description('Show the current-web-pages group'),
  webCount: z.number().default(3).description('How many tabs to show before "more"'),
  port: z.number().default(9222).description('Local CDP debugging port'),
  showFiles: z.boolean().default(true).description('Show the files-and-images row'),
  showPlan: z.boolean().default(true).description('Show the plan row'),
  showGoal: z.boolean().default(true).description('Show the goal row'),
  showCmd: z.boolean().default(true).description('Show the slash-command row'),
  showSkill: z.boolean().default(true).description('Show the skills row'),
  showMcp: z.boolean().default(true).description('Show the MCP row'),
  pluginMode: z.string().default('mixed').description('pinned | frequent | mixed'),
  pluginCount: z.number().default(5).description('How many quick plugins to show'),
  /* Empty on purpose, and it has to stay empty: a fresh install cannot know
     which plugins the user wants pinned. The client half keeps its own default
     at [] for the same reason (DEFAULTS in lib/client.js); pinning dsh-pilot /
     codegraph only here made the two halves disagree, so a user who never
     opened the settings got two pinned rows they had not chosen. */
  pinned: z.array(z.string()).default([]).description('Always-shown plugins')
})

/**
 * 适配新版 DSH：settings namespace 改为**由宿主从 `Config` 自动推导**。
 *
 * 旧版要手动 `settings.register(ns, schema, {applies})`；
 * 新版 `@deepseek-ai/dsh-settings` 把 `register` 删了，只剩
 * `configure(presentation, owner)`（那是"设置页策略"，不是注册入口），
 * 官方插件的用法是 `child.settings.configure({ auto: false }, ctx.fiber)` ——
 * 它们不再传 namespace，因为宿主直接读插件导出的 `Config`。
 *
 * 所以这里导出 `Config`，下面 apply() 里也把 register 换成 configure。
 */
export const Config = LauncherSettingsSchema

/** Service the route registrar needs. */
export const inject = ['webServer']

/** Prefix every endpoint of this plugin lives under. */
const ROUTE_PREFIX = '/composer-launcher'

/** Fallback CDP port; the launcher's settings card can override it per call. */
const DEFAULT_PORT = 9222

/**
 * The one port the browser extension pushes to, whatever the Web GUI uses.
 *
 * Measured: the desktop shell reserves 43129 for the Web GUI and
 * silently falls back to an ephemeral port when anything holds it. A leftover
 * harness of an already-dead Desktop instance held 43129, the live instance
 * came up on 63245, and every push from a perfectly healthy extension landed in
 * the DEAD one — the menu showed "扩展未连" and fell back to a CDP port that can
 * only ever expose an empty second profile. A port of our own that nothing else
 * wants takes the drifting Web GUI port out of the extension's configuration
 * entirely; 43130 is above the shell's 43129 and below the ephemeral range the
 * shell falls back into.
 *
 * Overridable with `DSH_LAUNCHER_BRIDGE_PORT` for the one case the default
 * cannot serve: two DSH instances on one machine. The second one used to ask the
 * first to yield — which works, but leaves the first without a bridge until it
 * restarts. Point the second instance elsewhere instead, and set the same port
 * in the extension's popup, which has carried a port field all along.
 */
const BRIDGE_PORT = (() => {
  const raw = Number(process.env.DSH_LAUNCHER_BRIDGE_PORT)
  if (Number.isInteger(raw) && raw > 1024 && raw < 65536) return raw
  return 43130
})()

/** Process start time; `/bridge` reports it so two instances are tellable apart. */
const BOOT_AT = Date.now()

/**
 * Live bridges by port.
 *
 * Module scope because `/bridge-yield` closes this very socket: a NEWER DSH
 * instance asks the older one to step aside, so the extension always feeds the
 * instance the user just started. Keyed by port rather than held in one slot
 * because a single process may legitimately hold more (the self-check does).
 */
const bridges = new Map()

/** How long a single CDP probe may take before the route gives up. */
const PROBE_TIMEOUT_MS = 2500

/**
 * CDP metadata pages that are not the user's actual browsing tabs.
 * `devtools://` and the extension background pages would otherwise show up as
 * if the user were reading them.
 * @param page - one entry of the `/json/list` array.
 * @returns whether the entry is a real, user-visible browsing tab.
 */
function isBrowsingTab (page) {
  if (page === null || typeof page !== 'object') return false
  if (page.type !== 'page') return false
  const url = typeof page.url === 'string' ? page.url : ''
  if (url === '') return false
  return !/^(devtools|chrome-extension|chrome|edge|about|view-source):/i.test(url)
}

/**
 * Reduce one CDP page to the shape the launcher renders.
 *
 * `favIconUrl` is carried through verbatim: it is the site's real icon and is
 * exactly what a browser address bar would draw, so the launcher never has to
 * guess a favicon path.
 * @param page - the raw CDP page entry.
 * @returns the launcher's tab record.
 */
function toTab (page) {
  let host = ''
  try {
    host = new URL(page.url).host
  } catch {
    host = ''
  }
  return {
    id: typeof page.id === 'string' ? page.id : '',
    title: typeof page.title === 'string' && page.title !== '' ? page.title : host,
    url: page.url,
    host,
    favIconUrl: typeof page.favIconUrl === 'string' ? page.favIconUrl : '',
    /* F4 — the row's last slot names the browser. Left EMPTY on purpose: the
       CDP fallback now starts whichever Chromium is installed (findBrowser()
       below), so a hard-coded 'Edge' would be a lie on a Chrome-only machine.
       The route fills the blank with a neutral label instead. */
    browser: ''
  }
}

/**
 * Ask the local CDP endpoint for the open browsing tabs.
 *
 * Never throws: an unreachable endpoint is a normal state (the debugging
 * browser is simply not running), and the launcher renders that as an empty
 * section rather than an error.
 * @param port - the CDP port to probe.
 * @returns the tab list and, when the probe failed, a human-readable reason.
 */
async function listTabs (port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    })
    if (!response.ok) {
      return { tabs: [], error: `CDP ${port} 返回 HTTP ${response.status}` }
    }
    const payload = await response.json()
    if (!Array.isArray(payload)) {
      return { tabs: [], error: `CDP ${port} 返回了非数组响应` }
    }
    return { tabs: payload.filter(isBrowsingTab).map(toTab), error: null }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { tabs: [], error: `连不上 CDP ${port}：${detail}` }
  }
}

/**
 * Parse the port out of the request URL, falling back to the default.
 * A malformed port is the caller's mistake, not a reason to fail the route —
 * an out-of-range or non-numeric value simply uses the default.
 * @param url - the incoming request URL.
 * @returns a usable TCP port number.
 */
function portOf (url) {
  const raw = url.searchParams.get('port')
  if (raw === null) return DEFAULT_PORT
  const port = Number.parseInt(raw, 10)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT
}

/** Write one JSON response. */
function sendJson (res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(text)
}

/**
 * Latest tab list pushed by the DSH Tab Bridge browser extension.
 *
 * The extension is the PRIMARY source and the CDP probe is only a fallback:
 * a debug port can never attach to the browser the user actually browses in
 * (Chrome opens it at launch only), so on its own it can only ever report a
 * second, empty profile. The extension reads the real browser.
 */
const pushed = { tabs: [], at: 0 }

/**
 * How long a pushed list stays authoritative before CDP is retried.
 *
 * Deliberately LONGER than the extension's 1-minute heartbeat: with a 30 s TTL
 * a perfectly healthy extension went stale for half of every minute, so the
 * route fell through to a CDP probe that is usually not running and the menu
 * reported "连不上" while the extension was working fine. Tab events push
 * immediately, so this window only governs an idle browser.
 */
const PUSH_TTL_MS = 65_000

/**
 * Bind a listener to one loopback port.
 *
 * A fresh server per attempt on purpose: a failed `listen` leaves a server
 * unusable, so the caller has to build a new one before retrying.
 * @param server - the server to bind.
 * @param port - the TCP port.
 * @returns the bound server, or the binding error.
 */
function bindLoopback (server, port) {
  return new Promise((resolve) => {
    const onError = (error) => {
      server.removeListener('listening', onListening)
      resolve({ server: null, error })
    }
    const onListening = () => {
      server.removeListener('error', onError)
      resolve({ server, error: null })
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

/**
 * Ask whoever holds `port` to release it.
 *
 * Only this plugin answers `/bridge`, so "occupied by something else" is
 * reported as such and never mistaken for a DSH instance.
 * @param port - the contested port.
 * @param logger - where to say what happened.
 * @returns whether a bridge acknowledged the request.
 */
async function askBridgeToYield (port, logger) {
  const base = `http://127.0.0.1:${port}${ROUTE_PREFIX}`
  try {
    const identity = await fetch(`${base}/bridge`, { signal: AbortSignal.timeout(1500) })
    if (!identity.ok) return false
    const body = await identity.json()
    if (body === null || body.bridge !== true) return false
    logger?.info?.(`dsh-composer-launcher: 端口 ${port} 上是另一个 DSH 实例（pid ${body.pid}，起于 ${new Date(body.startedAt).toISOString()}），请它让位`)
    const yielded = await fetch(`${base}/bridge-yield`, { method: 'POST', signal: AbortSignal.timeout(1500) })
    return yielded.ok
  } catch {
    return false
  }
}

/**
 * Bind the extension bridge, taking the port over from an older DSH if needed.
 * @param port - the fixed bridge port.
 * @param logger - where to say what happened.
 * @returns the bound server, or null when the bridge stays down.
 */
export async function startBridge (port, logger) {
  const create = () => createServer((req, res) => {
    /* Same handler as the Web GUI route: one code path, one `pushed` buffer. */
    handle(req, res).catch(() => { res.destroy() })
  })
  const first = await bindLoopback(create(), port)
  if (first.server !== null) {
    bridges.set(port, first.server)
    return first.server
  }
  if (first.error?.code !== 'EADDRINUSE') {
    logger?.warn?.(`dsh-composer-launcher: 扩展桥接端口 ${port} 绑定失败（${first.error?.code ?? 'unknown'}）—— 扩展只能回落到 Web GUI 端口`)
    return null
  }
  if (!await askBridgeToYield(port, logger)) {
    logger?.warn?.(`dsh-composer-launcher: 端口 ${port} 被占用且不应答 /bridge（不是本插件），扩展桥接未启动`)
    return null
  }
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    const retry = await bindLoopback(create(), port)
    if (retry.server !== null) {
      bridges.set(port, retry.server)
      return retry.server
    }
  }
  logger?.warn?.(`dsh-composer-launcher: 等待 ${port} 释放超时，扩展桥接未启动`)
  return null
}

/**
 * Register the bridge as a disposable effect.
 *
 * The socket binds asynchronously while the effect has to be registered
 * synchronously, so the disposer closes whatever exists by the time it runs.
 * @param ctx - the plugin context.
 * @param port - the fixed bridge port.
 */
function installBridge (ctx, port) {
  ctx.effect(() => {
    let disposed = false
    let bound = null
    void startBridge(port, ctx.logger).then((server) => {
      if (server === null) return
      if (disposed) {
        server.close()
        return
      }
      bound = server
      ctx.logger?.info?.(`dsh-composer-launcher: 扩展桥接已监听 http://127.0.0.1:${port}${ROUTE_PREFIX}/tabs —— 浏览器扩展固定连这个端口，与 Web GUI 端口无关`)
    })
    return () => {
      disposed = true
      if (bound !== null) {
        try {
          bound.close()
        } catch {
          /* /bridge-yield already closed it */
        }
      }
      if (bridges.get(port) === bound) bridges.delete(port)
    }
  }, 'dsh-composer-launcher: extension bridge')
}

/** Read a small JSON request body, or null when it is absent or malformed. */
async function readJsonBody (req) {
  const chunks = []
  let size = 0
  try {
    for await (const chunk of req) {
      size += chunk.length
      /* Tab metadata for a busy browser is small; anything larger is a caller
         that is not the extension, so refuse rather than buffer it. */
      if (size > 512 * 1024) return null
      chunks.push(chunk)
    }
    const text = Buffer.concat(chunks).toString('utf8')
    return text === '' ? null : JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Locate a Chromium-family binary able to run a dedicated debug profile.
 *
 * The debug browser uses its OWN user-data-dir on purpose: Chromium refuses
 * --remote-debugging-port on the default profile, so the port can only ever
 * expose a separate profile. That is also exactly why the DSH Tab Bridge
 * extension exists and is the primary source.
 * @returns an absolute executable path, or null when none is installed.
 */
/**
 * DSH 主目录（与插件其它部分保持同一套解析规则）。
 *
 * 自适应：`DSH_HOME` → 各平台约定位置。**不硬编码盘符 / 用户名 / 平台**
 * —— 换机器、换用户名、换盘符都不用改这里；在 macOS / Linux 上也会算对。
 * @returns {string} 绝对路径（不保证存在）。
 */
function dshHome () {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
  const home = homedir()
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'dsh-desktop', 'harness')
  }
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'dsh-desktop', 'harness')
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'dsh-desktop', 'harness')
}

/**
 * 最近一次 apply 拿到的 logger。自举阶段靠它把「为什么没铺成」写出去：
 * 上一版把异常整个吞掉，用户只会看到扩展不工作，却没有任何线索可查。
 */
let extensionLogger = null

/**
 * 最近一次 apply 拿到的 webServer 服务。**必须留着它，不能只留端口号**：端口是
 * 宿主启动后才知道的，而且可能变（换端口、多实例），每次请求现读一次才是对的。
 *
 * 用途只有一个：探测联动插件时确定「本机的 Web GUI 在哪个端口」。这件事不能靠
 * `req.socket.localPort` —— 同一个 handle 既挂在 webServer 上（Web GUI 端口），
 * 也挂在桥接服务器上（BRIDGE_PORT），而联动插件的路由（例如
 * `/dsh-capability-composer/state`）**只注册在 webServer 上**。从桥接端口问，
 * 问的是没有那条路由的服务器，必然得到 404，于是 UI 把已经装好的联动插件
 * 误报成「未连接」。
 */
let webServerRef = null

/** 把扩展自举过程中的异常写进日志；没有 logger 就静默（日志失败绝不外抛）。 */
function logExtensionIssue (message) {
  try {
    extensionLogger?.warn?.(`dsh-composer-launcher: ${message}`)
  } catch {
    /* 记日志本身失败不能影响启动。 */
  }
}

/**
 * staged 副本必须齐备的条目。
 *
 * 逐项校验而不是只看 `manifest.json`：旧版本 staged 的副本有 4 个顶层文件
 * 却没有 `_locales`，而 manifest 现在声明了 `default_locale`，浏览器会直接
 * 拒绝加载这种副本。残缺副本必须判为「不存在」并重铺，否则永远修不好。
 */
const EXTENSION_REQUIRED_ENTRIES = [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.js',
  join('_locales', 'en', 'messages.json'),
  join('_locales', 'zh_CN', 'messages.json')
]

/** staged 副本是否完整。 */
function stagedExtensionComplete (dir) {
  return EXTENSION_REQUIRED_ENTRIES.every((relative) => existsSync(join(dir, relative)))
}

/**
 * 逐文件递归复制目录。
 *
 * **绝不能用 `fs.cpSync(src, dst, { recursive: true })`。** 在 Windows 上，
 * 只要源或目标路径含非 ASCII 字符，node.exe 会以 0xC0000409
 * (STATUS_STACK_BUFFER_OVERRUN / V8 `__fastfail`) **原生致命中止**：不抛异常、
 * 不打堆栈，`try/catch` 完全拦不住，整个 DSH 宿主进程当场消失，用户看不到
 * 任何提示。实测（node v24.9.0 / Windows）：
 *
 *   cpSync(<含中文的源>, <含中文的目标>, { recursive: true })  → 进程死
 *   cpSync(<纯 ASCII 源>, <纯 ASCII 目标>, { recursive: true }) → 正常
 *
 * 而 `%APPDATA%\dsh-desktop\harness` 里的用户名就是非 ASCII 的常见来源
 * （中文 Windows 上几乎必然踩到），所以这条路径必须逐文件复制。
 * `mkdirSync` / `readdirSync` / `copyFileSync` / `rmSync` 在非 ASCII 路径下
 * 都实测正常，手写递归是安全的等价替代。
 * @param from - 源目录。
 * @param to - 目标目录（不存在则创建，存在则合并）。
 */
function copyExtensionTree (from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name)
    const target = join(to, entry.name)
    if (entry.isDirectory()) copyExtensionTree(source, target)
    else if (entry.isFile()) copyFileSync(source, target)
    /* 符号链接等其它类型扩展包里没有，跳过好过复制失败。 */
  }
}

/** 删掉 staged 目录；删失败只记日志（后续覆盖写仍可能成功）。 */
function discardStagedExtension (staged) {
  if (!existsSync(staged)) return
  try {
    rmSync(staged, { recursive: true, force: true })
  } catch (error) {
    logExtensionIssue(`清理残缺扩展目录失败（改为覆盖写）: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 扩展目录：先看 `harness\extensions\dsh-tab-bridge` 下 staged 的那份；
 * 不完整或没有就从**插件包自带**的 `extension/` 重新铺一份（幂等）。
 *
 * 「新电脑零人工」的一半就在这里：包带扩展 + 自动 staged，
 * 用户不需要手工把文件夹拖进浏览器。
 *
 * 任何一步失败都**清掉半成品再返回 null**：半成品会骗过下一次判断，
 * 让「重铺」永远修不好。
 * @returns 目录路径；拿不到返回 null（调用方按「扩展未就绪」处理）。
 */
function resolveExtensionDir () {
  const staged = join(dshHome(), 'extensions', 'dsh-tab-bridge')
  if (stagedExtensionComplete(staged)) return staged

  const bundled = join(import.meta.dirname, '..', 'extension')
  if (!existsSync(join(bundled, 'manifest.json'))) {
    logExtensionIssue('插件包里没有 extension/ 目录，无法自动铺扩展')
    return null
  }

  /* 残缺副本先清掉再重铺：留着它只会让浏览器继续加载失败。 */
  discardStagedExtension(staged)

  try {
    copyExtensionTree(bundled, staged)
  } catch (error) {
    logExtensionIssue(`复制扩展失败: ${error instanceof Error ? error.message : String(error)}`)
    discardStagedExtension(staged)
    return null
  }

  const missing = EXTENSION_REQUIRED_ENTRIES.filter((relative) => !existsSync(join(staged, relative)))
  if (missing.length > 0) {
    logExtensionIssue(`复制后的扩展目录仍缺 ${missing.length} 项（${missing.join(', ')}），判为未就绪`)
    discardStagedExtension(staged)
    return null
  }
  return staged
}

/** 可联动的伙伴插件：有就连，没有就静默跳过（不存在是正常状态）。 */
const LINKED_PLUGIN_PATHS = [
  { id: 'capability-composer', label: '能力组合器', path: '/dsh-capability-composer/state' }
]

/**
 * 探测联动插件是否存在 —— 打它们自己的 HTTP 路由。
 * @param webPort - 本进程 webserver 的端口。
 * @returns `[{ id, label, ok, detail }]`
 */
async function probeLinkedPlugins (webPort) {
  const found = []
  for (const item of LINKED_PLUGIN_PATHS) {
    const result = { id: item.id, label: item.label, ok: false, detail: '' }
    try {
      const res = await fetch(`http://127.0.0.1:${String(webPort)}${item.path}`, { headers: { accept: 'application/json' } })
      result.ok = res.ok
      result.detail = res.ok ? 'connected' : `HTTP ${String(res.status)}`
    } catch (error) {
      result.detail = error instanceof Error ? error.message : String(error)
    }
    found.push(result)
  }
  return found
}
/**
 * 合并两个来源的标签页：**扩展推送**（用户自己浏览器）+ **CDP 探针**（调试浏览器）。
 *
 * 为什么必须合并：这两个来源是**并存**的，不是备选关系（实测症状：
 * 只连调试端口那一个来源时，默认浏览器里的标签页就不显示）。
 * 去重按 URL，同一个 URL 只留一条，优先保留扩展那条（它有真实标题/图标/浏览器名）。
 * 每条都带 `origin`，UI 可以据此分组。
 * @param extensionTabs - 已标 origin=extension 的数组。
 * @param cdpTabs - 已标 origin=cdp 的数组。
 * @returns 合并去重后的数组。
 */
function mergeTabSources (extensionTabs, cdpTabs) {
  const out = []
  const seen = new Set()
  const left = Array.isArray(extensionTabs) ? extensionTabs : []
  const right = Array.isArray(cdpTabs) ? cdpTabs : []
  for (const tab of [...left, ...right]) {
    const key = typeof tab.url === 'string' ? tab.url : ''
    if (key !== '') {
      if (seen.has(key)) continue
      seen.add(key)
    }
    out.push(tab)
  }
  return out
}

/**
 * 本机装了哪些浏览器 —— 扩展只认「用户自己的浏览器」，所以不能只盯着 Edge。
 *
 * 枚举刻意分平台走各自的权威来源：Windows 用注册表（Windows 自己就是按它
 * 拼「默认浏览器」列表的，机器级和用户级安装都登记在里面），macOS/Linux 用
 * 约定的安装位置。**任何分支都不写死盘符或用户名** —— 用户级安装的路径带
 * 用户名的中文，写死就等于在一半机器上瞎猜。
 *
 * 这份清单只用来「告诉用户该打开哪个页面」。Chromium 不允许静默侧载扩展
 * （安全限制，无解），所以这里能做的只是把页面和步骤指准，装还得用户点一下。
 */
const BROWSER_KINDS = [
  /* ORDER MATTERS — the registry key name and the executable path are both
     matched top to bottom and the first hit wins. Chromium forks love the word
     "chrome" (360, QQ), so they are tested BEFORE the plain chrome pattern;
     otherwise a 360 install would be reported as Chrome and the user would be
     sent to a browser that is not on their machine. */
  {
    id: 'edge',
    name: 'Microsoft Edge',
    pattern: /msedge|microsoft edge/i,
    chromium: true,
    url: 'edge://extensions',
    darwin: 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    linux: ['microsoft-edge', 'microsoft-edge-stable']
  },
  {
    id: 'brave',
    name: 'Brave',
    pattern: /brave/i,
    chromium: true,
    url: 'brave://extensions',
    darwin: 'Brave Browser.app/Contents/MacOS/Brave Browser',
    linux: ['brave-browser']
  },
  {
    id: 'vivaldi',
    name: 'Vivaldi',
    pattern: /vivaldi/i,
    chromium: true,
    url: 'vivaldi://extensions',
    darwin: 'Vivaldi.app/Contents/MacOS/Vivaldi',
    linux: ['vivaldi']
  },
  {
    id: 'opera',
    name: 'Opera',
    pattern: /opera/i,
    chromium: true,
    url: 'opera://extensions',
    darwin: 'Opera.app/Contents/MacOS/Opera',
    linux: ['opera']
  },
  {
    id: 'arc',
    name: 'Arc',
    pattern: /\barc\b/i,
    chromium: true,
    url: 'arc://extensions',
    darwin: 'Arc.app/Contents/MacOS/Arc',
    linux: []
  },
  {
    id: '360',
    name: '360 极速浏览器',
    pattern: /360|qihoo/i,
    chromium: true,
    url: 'chrome://extensions',
    darwin: '',
    linux: []
  },
  {
    id: 'qq',
    name: 'QQ 浏览器',
    pattern: /qqbrowser|tencent/i,
    chromium: true,
    url: 'chrome://extensions',
    darwin: '',
    linux: []
  },
  {
    id: 'chrome',
    name: 'Google Chrome',
    pattern: /chrome/i,
    chromium: true,
    url: 'chrome://extensions',
    darwin: 'Google Chrome.app/Contents/MacOS/Google Chrome',
    linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
  },
  {
    /* chromium:false is not cosmetic — launchDebugBrowser() passes
       Chromium-only flags (--load-extension, --remote-debugging-port), so this
       entry may only ever be offered to the user, never launched. */
    id: 'firefox',
    name: 'Firefox',
    pattern: /firefox|mozilla/i,
    chromium: false,
    url: 'about:debugging#/runtime/this-firefox',
    darwin: 'Firefox.app/Contents/MacOS/firefox',
    linux: ['firefox']
  }
]

const REG_ROOTS = [
  'HKLM\\SOFTWARE\\Clients\\StartMenuInternet',
  /* 32-bit browsers on a 64-bit Windows register here and nowhere else. */
  'HKLM\\SOFTWARE\\WOW6432Node\\Clients\\StartMenuInternet',
  'HKCU\\SOFTWARE\\Clients\\StartMenuInternet'
]

const USER_CHOICE = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice'

/**
 * Dump one registry tree in a single spawn.
 *
 * `StartMenuInternet` is the key Windows itself builds its "default browser"
 * list from, so it names exactly the browsers that are really registered, for
 * both machine-wide and per-user installs — no drive letter or user name has to
 * be guessed. `/s /ve` prints every subkey together with its default value,
 * which is where `shell\open\command` keeps the executable, so one call per
 * root replaces walking the subkeys one by one.
 *
 * A missing root is normal (a clean profile has no HKCU one): `reg` then writes
 * to stderr and exits non-zero, so the failure is swallowed and reported as
 * "nothing here".
 * @param key - registry path to dump.
 * @returns the raw output bytes, or null when the key does not exist.
 */
function regQuery (key) {
  try {
    return execFileSync('reg', ['query', key, '/s', '/ve'], { windowsHide: true })
  } catch {
    return null
  }
}

/**
 * Pull every REG_SZ out of a `reg query` dump, remembering its key.
 *
 * The bytes are read as latin1 on purpose. `reg.exe` writes the console's OEM
 * code page, not UTF-8, so a per-user install under a non-ASCII profile
 * (`C:\Users\<中文名>\AppData\...`) arrives as CP936 bytes; decoding those as
 * UTF-8 yields U+FFFD and the path silently stops existing. latin1 is a
 * byte-exact 1:1 mapping, so the real bytes survive for `exeFromCommand` to
 * decode properly.
 *
 * ⚠️ Do NOT match on the `(Default)` label — `reg.exe` LOCALISES it, so on a
 * Chinese Windows the dump says `(默认)` and it arrives here as `(Ä¬ÈÏ)`.
 * Filtering on it silently matches nothing. Callers select by KEY instead.
 * @param buffer - output of regQuery.
 * @returns `{ key, name, raw }` per value, in dump order.
 */
function regValues (buffer) {
  if (buffer === null) return []
  const values = []
  let key = ''
  for (const line of buffer.toString('latin1').split(/\r?\n/)) {
    if (line.startsWith('HKEY_')) {
      key = line.trim()
      continue
    }
    const hit = /^\s+(\S+)\s+REG_SZ\s+(.*)$/.exec(line)
    if (hit !== null && key !== '') values.push({ key, name: hit[1], raw: hit[2].trim() })
  }
  return values
}

/**
 * Turn one `shell\open\command` value into an executable that is on disk.
 *
 * The value is a command LINE (`"C:\...\msedge.exe" --single-argument %1`), so
 * the path is the quoted head when there is one. Both plausible decodings of
 * the raw bytes are tried and the first that names a real file wins — which is
 * also the install test, so nothing is ever reported as installed unless it
 * exists. A wrong code-page guess therefore costs nothing but that candidate.
 * @param raw - the value as regValues returned it.
 * @returns the executable path, or null when nothing there is on disk.
 */
function exeFromCommand (raw) {
  const bytes = Buffer.from(raw, 'latin1')
  const texts = [bytes.toString('utf8')]
  try {
    const oem = new TextDecoder('gbk').decode(bytes)
    if (oem !== texts[0]) texts.push(oem)
  } catch {
    /* No OEM code-page table in this build: ASCII installs still resolve. */
  }
  for (const text of texts) {
    const quoted = /^"([^"]+)"/.exec(text)
    const candidate = (quoted !== null ? quoted[1] : text.split(/\s+--/)[0]).trim()
    if (candidate !== '' && existsSync(candidate)) return candidate
  }
  return null
}

/** First kind matching either hint, or null for a client we do not manage. */
function browserKind (key, exe) {
  for (const kind of BROWSER_KINDS) {
    if (kind.pattern.test(key) || kind.pattern.test(exe)) return kind
  }
  return null
}

/**
 * Every browser registered on Windows, the user's default first.
 *
 * The default is read from the same `UserChoice` value Explorer uses, and its
 * owning entry is moved to the front — "the browser the user actually browses
 * in" beats "whichever we happened to find first" for every message this list
 * feeds.
 * @returns `{ kind, exe }` entries, one per browser, at most one per kind.
 */
function scanWindowsBrowsers () {
  const found = []
  const seen = new Set()
  for (const root of REG_ROOTS) {
    for (const value of regValues(regQuery(root))) {
      /* 按 KEY 选，不按值名选：`(Default)` 这个名字是本地化的（见 regValues）。 */
      if (!value.key.endsWith('\\shell\\open\\command')) continue
      const kind = browserKind(value.key, value.raw)
      if (kind === null || seen.has(kind.id)) continue
      const exe = exeFromCommand(value.raw)
      if (exe === null) continue
      seen.add(kind.id)
      found.push({ kind, exe })
    }
  }
  const choice = regValues(regQuery(USER_CHOICE)).find((value) => value.name === 'ProgId')
  const index = choice === undefined ? -1 : found.findIndex((entry) => entry.kind.pattern.test(choice.raw))
  if (index > 0) found.unshift(found.splice(index, 1)[0])
  return found
}

/**
 * macOS and Linux scan.
 *
 * Both platforms install browsers at fixed, documented locations, so the
 * candidates are plain paths — and a per-user macOS install is reached through
 * `homedir()` rather than a hard-coded user name. There is no registry
 * equivalent to lean on, so this cannot see a browser unpacked somewhere
 * unusual; a missed browser only costs a hint, never a wrong action.
 * @param platform - value of process.platform.
 * @returns `{ kind, exe }` entries, one per browser, in BROWSER_KINDS order.
 */
function scanPosixBrowsers (platform) {
  const roots = [join('/', 'Applications'), join(homedir(), 'Applications')]
  const dirs = ['/usr/bin', '/usr/local/bin', '/snap/bin']
  const found = []
  for (const kind of BROWSER_KINDS) {
    const candidates = platform === 'darwin'
      ? (kind.darwin === '' ? [] : roots.map((root) => join(root, kind.darwin)))
      : kind.linux.flatMap((name) => dirs.map((dir) => join(dir, name)))
    const exe = candidates.find((candidate) => existsSync(candidate))
    if (exe !== undefined) found.push({ kind, exe })
  }
  return found
}

/**
 * The browsers found on this machine — scanned once per process.
 *
 * The scan costs a few `reg.exe` spawns on Windows, and installing a browser
 * while a DSH session is open is not worth re-scanning for.
 */
let browserScan = null
function browserEntries () {
  if (browserScan === null) {
    browserScan = process.platform === 'win32' ? scanWindowsBrowsers() : scanPosixBrowsers(process.platform)
  }
  return browserScan
}

/**
 * Load-the-extension steps for one browser, naming the real directory.
 * @param kind - entry from BROWSER_KINDS.
 * @param dir - staged extension directory, or null when it is unknown.
 * @returns instructions a human can follow verbatim.
 */
function howToInstall (kind, dir) {
  if (kind.chromium) {
    return `打开 ${kind.url} → 右上角打开「开发者模式」→ 点「加载解压缩的扩展」→ 选 ${dir ?? '扩展目录'}`
  }
  const file = dir === null ? '扩展目录里的 manifest.json' : join(dir, 'manifest.json')
  return `打开 ${kind.url} → 点「临时载入附加组件」→ 选 ${file}（Firefox 重启后失效，要重新载入）`
}

/**
 * What the user can open and what they have to click, ready for the UI.
 * @param dir - staged extension directory, for the paths in `howTo`.
 * @returns `{ id, name, exe, extensionsUrl, howTo }` per installed browser.
 */
function installedBrowsers (dir) {
  return browserEntries().map((entry) => ({
    id: entry.kind.id,
    name: entry.kind.name,
    exe: entry.exe,
    extensionsUrl: entry.kind.url,
    /* UI 渲染自己的本地化步骤时要用它区分「加载解压缩的扩展」与 Firefox 的
       「临时载入附加组件」—— 宿主给不出本地化文案，只能把事实交出去。 */
    chromium: entry.kind.chromium === true,
    howTo: howToInstall(entry.kind, dir)
  }))
}

/**
 * 「扩展没连，接下来该怎么办」——一句话，给人和给 UI 用同一份。
 *
 * 为什么要有它：`sources.extension === 0` 只是个数，UI 拿到它只能显示空白，
 * 用户也看不出来是没装、装错浏览器、还是浏览器没开。这里把**已探测到的第一个
 * 浏览器**（Windows 上就是默认浏览器）的扩展页和步骤直接写进返回值，
 * 调用方不用猜、也不用自己拼 URL。
 * @param dir - staged 的扩展目录，or null when it could not be resolved.
 * @returns 一段可直接展示的说明文字。
 */
function extensionAdvice (dir) {
  try {
    const browsers = installedBrowsers(dir)
    if (browsers.length === 0) {
      return `没探测到已安装的浏览器。手工装：打开浏览器的扩展管理页 → 加载解压缩的扩展 → 选 ${dir ?? '本插件包里的 extension/ 目录'}`
    }
    const first = browsers[0]
    const rest = browsers.slice(1).map((browser) => browser.name).join('、')
    return `${first.name}：${first.howTo}${rest === '' ? '' : `（本机还装了 ${rest}）`}`
  } catch (error) {
    return `扩展目录不可用（${error instanceof Error ? error.message : String(error)}），浏览器里手工加载本插件包里的 extension/ 目录`
  }
}

/**
 * 「扩展没连」时给 UI 和日志用的那一句话 —— 要用时才算，且只算一次。
 *
 * `sources.extension === 0` 只是个计数：UI 看不出是没装、装在了别的浏览器、
 * 还是浏览器压根没开。这里把已探测到的第一个浏览器（Windows 上就是默认浏览器）
 * 的扩展页和步骤直接写进返回值，调用方不用猜、也不用自己拼 URL。
 * staging 是一次幂等的文件拷贝，而 /tabs 是被轮询的 —— 所以算过就缓存。
 * @returns 一段可直接展示的说明文字。
 */
let extensionHintText = null
function extensionHint () {
  if (extensionHintText === null) {
    let dir = null
    try {
      dir = resolveExtensionDir()
    } catch {
      /* 目录都拿不到：下面的文案会退回「手工选本插件包里的 extension/」。 */
    }
    extensionHintText = `扩展未连：${extensionAdvice(dir)}`
  }
  return extensionHintText
}

/**
 * 与 extensionHint() 同一份诊断，但给的是数据不是句子：staged 目录 + 每个已装
 * 浏览器一条。宿主侧拿不到界面语言，所以上面那句话保持中文、只给日志用；
 * 客户端半边拿这个结构自己出文案，那份文案才跟随界面语言。
 *
 * 这里与 extensionHint() 各自 staging 一次是允许的：staging 是幂等拷贝，
 * 而两者都只算一次。
 * @returns `{ extensionDir, browsers }`。
 */
let extensionStatusCache = null
function extensionStatus () {
  if (extensionStatusCache === null) {
    let dir = null
    try {
      dir = resolveExtensionDir()
    } catch {
      /* 目录都拿不到：客户端退回「加载本插件包里的 extension/」。 */
    }
    let browsers = []
    try {
      browsers = installedBrowsers(dir)
    } catch {
      browsers = []
    }
    extensionStatusCache = { extensionDir: dir, browsers }
  }
  return extensionStatusCache
}

/**
 * The Chromium binary to launch for the CDP fallback.
 *
 * Firefox is filtered out on purpose: the launch passes Chromium-only flags, so
 * handing it a `firefox.exe` would fail in a way the user cannot act on.
 * @returns an executable path, or null when no Chromium is installed.
 */
function findBrowser () {
  const hit = browserEntries().find((entry) => entry.kind.chromium)
  return hit === undefined ? null : hit.exe
}

/**
 * Is the extension actually mounted in the browser listening on `port`?
 *
 * Reads the RAW CDP target list, not the filtered tab list: the extension shows
 * up as a service worker, and every Chromium ships several of those of its own
 * (`.../_generated_background_page.html`, `.../background.rollup.js`), so the
 * discriminator has to be this manifest's own worker path —
 * `chrome-extension://<id>/background.js`.
 * @param port - the CDP port to ask.
 * @returns whether a target belonging to our extension is present.
 */
async function extensionMounted (port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return false
    const list = await res.json()
    return Array.isArray(list) && list.some((t) =>
      typeof t.url === 'string' && t.url.startsWith('chrome-extension://') && t.url.endsWith('/background.js'))
  } catch {
    return false
  }
}

/**
 * Kill the browser we spawned, its children included. Best effort on purpose:
 * the profile it leaves behind is disposable, so a failure here is not a state
 * the caller has to recover from.
 * @param pid - process id from `spawn`.
 */
function killBrowserTree (pid) {
  if (process.platform !== 'win32' || !Number.isInteger(pid) || pid <= 0) return
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } catch {
    /* Already gone. */
  }
}

/**
 * One launch attempt: spawn the browser and wait for its CDP endpoint.
 *
 * Never throws — "spawn refused" and "did not come up in time" are both ordinary
 * answers. The caller decides what they mean.
 * @param binary - browser executable.
 * @param port - the CDP port to open.
 * @param userDataDir - the profile directory for this attempt.
 * @param extensionDir - staged extension directory, or null for a plain launch.
 * @returns `{ ok, pid, error }`.
 */
async function spawnDebugAttempt (binary, port, userDataDir, extensionDir) {
  const withExtension = typeof extensionDir === 'string' && extensionDir.length > 0
  const spawnArgs = [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check'
  ]
  if (withExtension) {
    /* Chromium/Edge **不允许**把扩展静默装进用户的日常浏览器（安全限制，无解），
       但**本插件自己 spawn 的这个进程**可以 --load-extension 自带扩展 ——
       这就是「新电脑零人工」的另一半。Edge/Chrome 137+ 还要求配套下面这个
       disable-features，否则 --load-extension 会被直接忽略。 */
    spawnArgs.push(
      `--load-extension=${extensionDir}`,
      `--disable-extensions-except=${extensionDir}`,
      '--disable-features=DisableLoadExtensionCommandLineSwitch'
    )
  }
  spawnArgs.push('about:blank')
  let child = null
  try {
    child = spawn(binary, spawnArgs, { detached: true, stdio: 'ignore' })
    child.unref()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, pid: null, error: `拉起失败：${detail}` }
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    const probe = await listTabs(port)
    if (probe.error === null) return { ok: true, pid: child.pid, error: null }
  }
  return { ok: false, pid: child.pid, error: `已启动但 ${port} 端口没起来` }
}

/**
 * Launch the local debug browser on `port` and wait for its CDP endpoint.
 *
 * Never throws: "no browser installed" and "did not come up in time" are both
 * ordinary answers the launcher renders as a state, not as an exception.
 *
 * The extension half is verified, not assumed. A profile that was ever opened
 * WITHOUT the command-line switches can stop honouring them — measured on this
 * machine: the same `--load-extension` mounts the extension on a fresh profile
 * 100% of the time and on the long-lived `~/.dsh-edge-agent` 0% of the time, and
 * Chromium gives no error either way. Silently degrading to CDP-only would make
 * the "zero manual steps" promise a lie, so the first attempt is checked and, if
 * the extension is missing, one retry on a clean profile follows.
 * @param port - the CDP port to open.
 * @param extensionDir - staged extension directory, or null for a plain launch.
 * @returns a result the launcher can display.
 */
async function launchDebugBrowser (port, extensionDir = null) {
  const withExtension = typeof extensionDir === 'string' && extensionDir.length > 0
  const existing = await listTabs(port)
  if (existing.error === null) {
    return { ok: true, launched: false, extensionLoaded: false, note: `CDP ${port} 已经在跑了` }
  }
  const binary = findBrowser()
  if (binary === null) {
    return { ok: false, launched: false, extensionLoaded: false, error: '没找到 Chromium 系浏览器（Edge / Chrome / Brave / Vivaldi / Opera），装一个再试' }
  }
  const primary = join(homedir(), '.dsh-edge-agent')
  const first = await spawnDebugAttempt(binary, port, primary, extensionDir)
  if (!first.ok) {
    return { ok: false, launched: true, binary, userDataDir: primary, extensionLoaded: false, error: first.error }
  }
  if (!withExtension) {
    return { ok: true, launched: true, binary, userDataDir: primary, extensionLoaded: false }
  }
  await new Promise((resolve) => setTimeout(resolve, 1500))
  if (await extensionMounted(port)) {
    return { ok: true, launched: true, binary, userDataDir: primary, extensionLoaded: true }
  }
  logExtensionIssue(`调试浏览器的 profile（${primary}）不再接受命令行扩展，换一个干净 profile 重来一次`)
  killBrowserTree(first.pid)
  let freed = false
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 400))
    const probe = await listTabs(port)
    if (probe.error !== null) {
      freed = true
      break
    }
  }
  if (!freed) {
    return {
      ok: true,
      launched: true,
      binary,
      userDataDir: primary,
      extensionLoaded: false,
      note: '这个 profile 不接受命令行扩展，而它没退干净，换 profile 重试不了；标签页改由调试端口读'
    }
  }
  const fallback = `${primary}-ext`
  const second = await spawnDebugAttempt(binary, port, fallback, extensionDir)
  if (!second.ok) {
    return { ok: false, launched: true, binary, userDataDir: fallback, extensionLoaded: false, healed: true, error: second.error }
  }
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const mounted = await extensionMounted(port)
  return {
    ok: true,
    launched: true,
    binary,
    userDataDir: fallback,
    extensionLoaded: mounted,
    healed: true,
    note: mounted
      ? `旧 profile 已经不被接受，改用干净 profile：${fallback}`
      : '换了干净 profile 也没挂上扩展：这台机器的浏览器可能忽略了 --load-extension，标签页改由调试端口读'
  }
}

/**
 * Trust check for state-changing routes.
 *
 * This prefix is reachable from every page the user has open, so a mutating
 * verb must prove it is not a cross-site request. Browsers attach Origin to
 * every POST/PUT/DELETE, so a foreign Origin is decisive; a request with no
 * Origin at all is not page-initiated (the extension's service worker sends
 * none in some Chromium versions, as do curl and the headless tests) and is
 * allowed. Without this, any website could POST /tabs and poison the launcher
 * menu of every session — and, via favIconUrl, run script in the GUI origin.
 * @param req - the incoming request.
 * @returns whether this caller may mutate host state.
 */
function isTrustedCaller (req) {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  if (/^(chrome|moz)-extension:\/\//i.test(origin)) return true
  const host = req.headers.host
  if (typeof host === 'string' && host !== '') {
    if (origin === `http://${host}` || origin === `https://${host}`) return true
  }
  return false
}

/**
 * Drop favIconUrl values that could not be rendered safely.
 *
 * Defense in depth: the browser half escapes and scheme-checks too, but a
 * hostile push should not even reach storage. Rejects anything carrying an
 * attribute-breaking character or a non-inert scheme.
 * @param value - the candidate value from a push.
 * @returns a storable URL, or '' when it must be discarded.
 */
function safeIconField (value) {
  if (typeof value !== 'string' || value === '') return ''
  if (/[<>"'`\s]/.test(value)) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (/^data:image\/(png|jpe?g|gif|webp|bmp|x-icon|vnd\.microsoft\.icon);/i.test(value)) return value
  return ''
}

/**
 * Absolute path of the running profile's manifest.
 *
 * The Host is the only half with a filesystem, so it is the only half that can
 * answer "which packages does THIS profile actually mount". `dshHome()` resolves
 * the harness root (DSH_HOME first, then each platform's conventional location),
 * so this works on any machine without a hard-coded path.
 * @returns the manifest path, or null when no root can be resolved.
 */
function profileManifestPath () {
  let home = ''
  try {
    home = dshHome()
  } catch {
    home = ''
  }
  if (typeof home !== 'string' || home === '') return null
  return join(home, 'profiles', 'web', 'package.json')
}

/**
 * Read `dsh.profile.bundles` — the profile's authoritative mount list.
 *
 * The browser half cannot read the manifest, and the raw Loader inventory is
 * NOT a substitute: it also carries internal/preset layers
 * (`@deepseek-ai/cordis-plugin-hmr` and friends) and repeats one package under
 * several entries, which is what turned 全部插件 into a jumbled list.
 * @returns the package-name array, or null when the manifest is unreadable.
 */
function readProfileBundles () {
  const manifest = profileManifestPath()
  if (manifest === null) return null
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return null
    const dsh = parsed.dsh
    if (dsh === null || typeof dsh !== 'object') return null
    const profile = dsh.profile
    if (profile === null || typeof profile !== 'object') return null
    const bundles = profile.bundles
    if (!Array.isArray(bundles)) return null
    /* Names only. Nothing else from the manifest (dependency pins, pnpm
       overrides, generation projections, any path) may leave this route. */
    return bundles.filter((name) => typeof name === 'string' && name !== '')
  } catch {
    return null
  }
}

/* ── favicon 同源代理（自适应图标的另一半） ────────────────────────────────
   为什么要绕这一圈：站点 favicon 是**跨源图片**，直接 <img src> 画进 canvas
   会污染画布 ⇒ getImageData 抛 SecurityError ⇒ 客户端**永远判不出**这张图标
   本身是浅色还是深色（实测症状：浅色模式下 GitHub 这种白图标看不见）。
   走本插件的同源前缀取回来以后画布可读，16x16 量一次就行；顺带把 hotlink
   (Referer 403) 和 GUI 的 img-src CSP 一起绕掉。

   延迟纪律（毫秒级）：
   · 显示的那张图**就是**代理这张 —— 浏览器只发一次请求，没有第二次取样往返；
   · 成图缓存在进程内 Map 里（默认 6 小时 / 300 条），命中直接回字节；
   · 失败也做 60 秒短缓存，免得每次开菜单都为同一张坏图等 4 秒超时。 */
const FAVICON_CACHE = new Map()
const FAVICON_FAIL = new Map()
const FAVICON_TTL_MS = 6 * 60 * 60 * 1000
const FAVICON_FAIL_TTL_MS = 60 * 1000
const FAVICON_MAX_ENTRIES = 300
const FAVICON_MAX_BYTES = 512 * 1024
const FAVICON_TIMEOUT_MS = 4000

/**
 * Decide an image's content type from its own bytes.
 *
 * The declared header is only a hint: plenty of favicons come back as
 * `application/octet-stream` (or text/plain), and serving those from the GUI
 * origin would be an XSS hole. Bytes win; a non-image is refused outright.
 * @param buf - the fetched body.
 * @param declared - the upstream content-type header, if any.
 * @returns an image/* content type, or '' when this is not an image.
 */
function sniffImageType (buf, declared) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 6 && buf.toString('latin1', 0, 3) === 'GIF') return 'image/gif'
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp'
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x00010000) return 'image/x-icon'
  const head = buf.toString('utf8', 0, Math.min(buf.length, 512)).trimStart().toLowerCase()
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.includes('<svg')) return 'image/svg+xml'
  if (typeof declared === 'string' && /^image\//i.test(declared)) return declared.split(';')[0].trim().toLowerCase()
  return ''
}

/**
 * Fetch one favicon for the launcher, with the two caches described above.
 *
 * Never throws: a dead icon is a normal state, and the browser half walks to its
 * next candidate (or the neutral fallback glyph) on any non-200.
 * @param target - the absolute http(s) URL of the icon.
 * @returns the bytes and content type, or a status/error describing the miss.
 */
async function proxyFavicon (target) {
  let parsed
  try {
    parsed = new URL(target)
  } catch {
    return { ok: false, status: 400, error: 'u must be an absolute URL' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, status: 400, error: 'only http(s) icons are proxied' }
  }
  const key = parsed.href
  const now = Date.now()
  const hit = FAVICON_CACHE.get(key)
  if (hit !== undefined && now - hit.at < FAVICON_TTL_MS) return { ok: true, type: hit.type, buf: hit.buf }
  const miss = FAVICON_FAIL.get(key)
  if (miss !== undefined && now - miss.at < FAVICON_FAIL_TTL_MS) return { ok: false, status: miss.status, error: miss.error }
  try {
    const response = await fetch(key, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FAVICON_TIMEOUT_MS),
      /* No Referer is sent by Node at all, which is exactly what the common
         hotlink rule wants (the same reason the client used no-referrer). */
      headers: { accept: 'image/*,*/*;q=0.8' }
    })
    if (!response.ok) {
      FAVICON_FAIL.set(key, { status: 502, error: `upstream HTTP ${String(response.status)}`, at: now })
      return { ok: false, status: 502, error: `upstream HTTP ${String(response.status)}` }
    }
    const declared = response.headers.get('content-type')
    const buf = Buffer.from(await response.arrayBuffer())
    if (buf.length === 0) {
      FAVICON_FAIL.set(key, { status: 502, error: 'empty body', at: now })
      return { ok: false, status: 502, error: 'empty body' }
    }
    if (buf.length > FAVICON_MAX_BYTES) {
      FAVICON_FAIL.set(key, { status: 413, error: 'icon too large', at: now })
      return { ok: false, status: 413, error: 'icon too large' }
    }
    const type = sniffImageType(buf, declared)
    if (type === '') {
      FAVICON_FAIL.set(key, { status: 415, error: 'not an image', at: now })
      return { ok: false, status: 415, error: 'not an image' }
    }
    if (FAVICON_CACHE.size >= FAVICON_MAX_ENTRIES) {
      const oldest = FAVICON_CACHE.keys().next()
      if (!oldest.done) FAVICON_CACHE.delete(oldest.value)
    }
    FAVICON_CACHE.set(key, { type, buf, at: now })
    return { ok: true, type, buf }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    FAVICON_FAIL.set(key, { status: 504, error: detail, at: now })
    return { ok: false, status: 504, error: detail }
  }
}

/**
 * Route handler for the whole `/composer-launcher` prefix.
 * @param req - the incoming request.
 * @param res - the response to write.
 */
async function handle (req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')

  const method = req.method ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD' && !isTrustedCaller(req)) {
    sendJson(res, 403, { ok: false, error: 'cross-site request rejected' })
    return
  }

  if (url.pathname === `${ROUTE_PREFIX}/tabs` && req.method === 'POST') {
    const body = await readJsonBody(req)
    const tabs = body !== null && Array.isArray(body.tabs) ? body.tabs : null
    if (tabs === null) {
      sendJson(res, 400, { ok: false, error: 'body must be { tabs: [...] }' })
      return
    }
    /* Trust only the shape the launcher renders; drop anything else so a
       stray local caller cannot inject arbitrary rows. */
    const incoming = tabs
      .filter((tab) => tab !== null && typeof tab === 'object' && typeof tab.url === 'string')
      .slice(0, 200)
      .map((tab) => ({
        id: typeof tab.id === 'string' ? tab.id : String(tab.id ?? ''),
        title: typeof tab.title === 'string' ? tab.title : '',
        url: tab.url,
        host: typeof tab.host === 'string' ? tab.host : '',
        favIconUrl: safeIconField(tab.favIconUrl),
        /* F4 — the browser name the extension reports; bounded here as well,
           because this record comes from a non-credentialed local caller. */
        browser: typeof tab.browser === 'string' ? tab.browser.slice(0, 24) : ''
      }))
    /* EMPTY-PUSH-GUARD: 实测：**空推送不该抹掉非空数据**。
       同一个扩展可以同时装在两个浏览器里（用户自己的 Edge + 本插件拉起的调试浏览器），
       而调试浏览器常常"只有 about:blank" ⇒ 过滤后 0 条 ⇒ 一次空推送就把已有的那 6 条
       真实标签页覆盖成空，面板立刻显示"0 个标签页"，看起来像桥接坏了。
       所以：缓冲区非空时收到空推送 ⇒ 保留旧的（连时间戳也不动，免得假装数据新鲜）。 */
    if (incoming.length === 0 && pushed.tabs.length > 0) {
      sendJson(res, 200, { ok: true, accepted: 0, ignored: 'empty-push-kept-previous', kept: pushed.tabs.length })
      return
    }
    pushed.tabs = incoming
    pushed.at = Date.now()
    sendJson(res, 200, { ok: true, accepted: pushed.tabs.length })
    return
  }

if (url.pathname === `${ROUTE_PREFIX}/tabs` && req.method === 'GET') {
    const port = portOf(url)
    const pushFresh = Date.now() - pushed.at < PUSH_TTL_MS

    /* 两个来源**都要**，不是二选一：
         · extension —— 用户自己浏览器里的扩展推上来的
         · cdp       —— 调试浏览器（CDP 探针）
       合并去重后一起返回；`sources` 告诉 UI 各自有几条，`origin` 标在每条上。 */
    const extensionTabs = pushed.tabs.map((tab) => ({ ...tab, origin: 'extension' }))
    const extensionStale = !pushFresh && extensionTabs.length > 0

    let cdpTabs = []
    let cdpError = null
    try {
      const probe = await listTabs(port)
      cdpError = probe.error
      if (probe.error === null) {
        cdpTabs = probe.tabs.map((tab) => ({
          ...tab,
          origin: 'cdp',
          /* 调试浏览器的行没有 browser 字段，补一个可读名字，别让 UI 显示空白 */
          browser: typeof tab.browser === 'string' && tab.browser !== '' ? tab.browser : '调试浏览器'
        }))
      }
    } catch (error) {
      cdpError = error instanceof Error ? error.message : String(error)
    }

    const tabs = mergeTabSources(extensionTabs, cdpTabs)
    const anyExtension = extensionTabs.length > 0
    const anyCdp = cdpTabs.length > 0
    /* 只在扩展一条都没推上来时才准备：宿主出不了本地化文案（它拿不到界面
       语言），所以把 staged 目录与每个已装浏览器的扩展页、加载步骤一起交给
       UI，由 UI 用自己的语言表渲染。null 表示「扩展连着，不需要引导」。 */
    const extensionInfo = anyExtension ? null : extensionStatus()

    sendJson(res, 200, {
      ok: true,
      /* 旧字段（兼容既有 UI）：主来源。两个都有时以扩展为主。 */
      source: anyExtension || !anyCdp ? 'extension' : 'cdp',
      stale: anyExtension ? extensionStale : false,
      port: anyCdp ? port : null,
      /* 新字段：两个来源各自的条数 —— UI 可显示「扩展 N · 调试 M」 */
      sources: { extension: extensionTabs.length, cdp: cdpTabs.length, mixed: anyExtension && anyCdp },
      /* 扩展一条都没推上来时，把「没装/没连 + 去哪装」直接写进状态里，UI 不用猜。
         注意计数为 0 有两种情况，不能都当成"没装"：pushed.at === 0 是本进程从没
         收到过推送（真没装/没连），已经推过但这次是空列表则是浏览器里本来就没标签页。 */
      extensionHint: anyExtension
        ? null
        : pushed.at === 0 ? extensionHint() : '扩展已连，但当前没有可推送的标签页。',
      extensionInfo,
      tabs,
      error: anyExtension || anyCdp ? null : cdpError
    })
    return
  }

  /* 把扩展 staged 到 harness\extensions，并把目录 + 「本机装了哪些浏览器、
     各自该打开哪个页面、点哪几步」一起写给调用方。
     Chromium 不允许静默侧载扩展（安全限制，无解），所以这里只能把路径和入口
     备好，装那一下必须用户自己点。本插件拉起的调试浏览器不需要这一步。 */
  if (url.pathname === `${ROUTE_PREFIX}/stage-extension` && req.method === 'GET') {
    const dir = resolveExtensionDir()
    if (dir === null) {
      sendJson(res, 200, { ok: false, error: '插件包里没带 extension/ 目录，且 harness\\extensions 下也没有' })
      return
    }
    const browsers = installedBrowsers(dir)
    sendJson(res, 200, {
      ok: true,
      extensionDir: dir,
      /* 旧字段，留着不删：调用方按名取值，删掉就是一次无谓的破坏。 */
      dir,
      browsers,
      note: browsers.length === 0
        ? '没探测到已安装的浏览器。手工装：打开浏览器的扩展管理页 → 加载解压缩的扩展 → 选 extensionDir。'
        : `Chromium 不允许静默侧载扩展（安全限制，无解），只能手工装一次：打开 ${browsers[0].name} 的 ${browsers[0].extensionsUrl}，按 howTo 走一遍；本插件拉起的调试浏览器自带它，不需要这一步。`
    })
    return
  }

  /* 联动插件：有就连、没有就报 absent（不是错误）。 */
  if (url.pathname === `${ROUTE_PREFIX}/linked-plugins` && req.method === 'GET') {
    const localPort = req.socket === undefined || req.socket === null ? null : req.socket.localPort
    /* 探测目标 = 本机 Web GUI 服务器的端口，**不是**收到请求的那个端口。
       这条路由同时挂在 Web GUI 端口与桥接端口上，而联动插件的路由只注册在
       Web GUI 端口；从桥上探测会稳定拿到 404，把装好的插件误报成未连接。
       webServer 拿不到时（极端情况）才回落到请求端口 —— 至少不比原来更差。 */
    const webPort = typeof webServerRef?.port === 'number' && webServerRef.port > 0 ? webServerRef.port : localPort
    sendJson(res, 200, {
      ok: true,
      linked: typeof webPort === 'number' && webPort > 0 ? await probeLinkedPlugins(webPort) : []
    })
    return
  }
  if (url.pathname === `${ROUTE_PREFIX}/open-debug-browser` && req.method === 'POST') {
    const body = await readJsonBody(req)
    const raw = body === null ? null : Number(body.port)
    const port = Number.isInteger(raw) && raw > 0 && raw < 65536 ? raw : DEFAULT_PORT
    /* 把 staged 目录一起交给它 —— 这是「零人工」那一半的全部：浏览器不允许我们
       静默装进**用户自己的**日常浏览器，但它允许我们把扩展塞进**我们自己 spawn 的**
       那个进程。早先这条路由漏传了这个参数，于是 launchDebugBrowser 里的
       --load-extension 分支从来没被执行过，「拉起的调试浏览器自带扩展」只是注释里
       的一句话。拿不到目录也照常拉起（退化成纯 CDP 读标签），不抛错。 */
    let extensionDir = null
    try {
      extensionDir = extensionStatus().extensionDir
    } catch {
      extensionDir = null
    }
    sendJson(res, 200, await launchDebugBrowser(port, extensionDir))
    return
  }

  /* 打开某个已安装浏览器的扩展管理页。手工装扩展的第一步（打开扩展页）本来要用户
     自己复制 URL 再粘进地址栏，这一路由把它变成一次点击；浏览器已经在跑时，新 URL
     会交给现有实例开一个新标签页，正是我们要的效果。失败不抛错：报 ok:false 让界面
     回落成「自己打开 {url}」的文案。 */
  if (url.pathname === `${ROUTE_PREFIX}/open-extensions-page` && req.method === 'POST') {
    const status = extensionStatus()
    const list = status.browsers
    const hit = list.find((entry) => entry.chromium === true) ?? list[0]
    if (hit === undefined || typeof hit.exe !== 'string' || hit.exe === '') {
      sendJson(res, 200, { ok: false, error: '没探测到已安装的浏览器' })
      return
    }
    try {
      const child = spawn(hit.exe, [hit.extensionsUrl], { detached: true, stdio: 'ignore' })
      child.unref()
      sendJson(res, 200, { ok: true, browser: hit.name, url: hit.extensionsUrl })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      sendJson(res, 200, { ok: false, browser: hit.name, url: hit.extensionsUrl, error: detail })
    }
    return
  }

  if (url.pathname === `${ROUTE_PREFIX}/bundles` && req.method === 'GET') {
    const bundles = readProfileBundles()
    if (bundles === null) {
      /* The caller needs to tell "manifest unreadable" apart from "empty
         profile"; either way the browser half falls back to the raw roster. */
      sendJson(res, 200, { ok: false, bundles: [], error: 'profile manifest unreadable' })
      return
    }
    sendJson(res, 200, { ok: true, bundles })
    return
  }

  if (url.pathname === `${ROUTE_PREFIX}/favicon` && (req.method === 'GET' || req.method === 'HEAD')) {
    const raw = url.searchParams.get('u')
    const result = await proxyFavicon(raw === null ? '' : raw)
    if (!result.ok) {
      res.writeHead(result.status, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      })
      res.end(result.error)
      return
    }
    res.writeHead(200, {
      'content-type': result.type,
      'content-length': String(result.buf.length),
      'cache-control': 'private, max-age=21600',
      /* Bytes from a foreign site, served from the GUI origin: an SVG opened
         directly must not be able to run script there. */
      'content-security-policy': "default-src 'none'; sandbox",
      'x-content-type-options': 'nosniff'
    })
    res.end(req.method === 'HEAD' ? undefined : result.buf)
    return
  }

  /* 桥接自述：新实例靠它认出"端口上是不是同一套插件"，人靠它一眼看出谁在监听。 */
  if (url.pathname === `${ROUTE_PREFIX}/bridge` && (req.method === 'GET' || req.method === 'HEAD')) {
    /* `port` is the socket the caller reached, so the same answer serves the Web
       GUI route (holding: false) and a real bridge. */
    const local = req.socket === undefined || req.socket === null ? null : req.socket.localPort
    sendJson(res, 200, {
      ok: true,
      bridge: true,
      pid: process.pid,
      port: typeof local === 'number' && local > 0 ? local : null,
      holding: typeof local === 'number' && bridges.has(local),
      startedAt: BOOT_AT
    })
    return
  }

  /* 让位：更新的 DSH 实例启动时这里放手，扩展就只喂最新那个实例。
     不杀进程、不抢端口 —— 只关掉自己这一个监听，本实例继续正常服务 Web GUI。 */
  if (url.pathname === `${ROUTE_PREFIX}/bridge-yield` && req.method === 'POST') {
    const local = req.socket === undefined || req.socket === null ? null : req.socket.localPort
    const target = typeof local === 'number' ? bridges.get(local) : undefined
    if (target === undefined) {
      sendJson(res, 200, { ok: true, yielding: false, note: 'this instance holds no bridge' })
      return
    }
    sendJson(res, 200, { ok: true, yielding: true, pid: process.pid })
    /* 先回话再关：调用方的下一步就是绑这个端口。 */
    setTimeout(() => {
      if (bridges.get(local) === target) bridges.delete(local)
      try {
        target.close()
      } catch {
        /* already closing */
      }
    }, 50)
    return
  }

  if (url.pathname === `${ROUTE_PREFIX}/health` && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      plugin: 'dsh-composer-launcher',
      extensionTabs: pushed.tabs.length,
      extensionAt: pushed.at
    })
    return
  }
  sendJson(res, 404, { ok: false, error: 'not found' })
}

/**
 * Host plugin body. Registers the CDP proxy route; does nothing else.
 * @param ctx - the owning plugin context.
 */
export function apply (ctx) {
  /* Settings 卡片：新版 DSH 靠**宿主读插件导出的 Config** 推导 namespace，
     不再需要（也没有）`settings.register(ns, schema, opts)`。
     这里改用新的 `configure(presentation, owner)` —— 它只声明"设置页策略"，
     `auto: true` 表示本实例的设置页由宿主自动生成。
     旧写法 `settingsCtx.settings.register(...)` 在新版会抛
     "settings.register is not a function"，日志里表现为
     "dsh-composer-launcher: settings namespace registration FAILED"。 */
  ctx.inject(['settings'], (settingsCtx) => {
    try {
      if (typeof settingsCtx.settings?.configure === 'function') {
        settingsCtx.settings.configure({ auto: true }, ctx.fiber)
      }
    } catch (error) {
      ctx.logger?.warn?.('dsh-composer-launcher: settings page configure FAILED', error)
    }
  })

  const webserver = ctx.get('webServer')
  if (webserver === undefined) {
    // A deployment without the shared webserver has no Web client either, so
    // there is nothing for this route to serve. Log and stay inert instead of
    // throwing — a throw here fails the whole plugin tree.
    ctx.logger?.warn?.('dsh-composer-launcher: webServer unavailable; CDP route not registered')
    return
  }
  ctx.effect(() => webserver.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: (req, res) => handle(req, res)
  }), 'dsh-composer-launcher: CDP tabs route')

  /* 存下来给 `/linked-plugins` 用：探测联动插件必须打到 Web GUI 端口，
     而不是收到请求的那个端口（桥接端口上没有联动插件的路由）。见 webServerRef。 */
  webServerRef = webserver

  /* 扩展的固定落点。跟 Web GUI 路由同一个 handle ⇒ 同一份 pushed 缓冲，
     UI 走 /tabs 读到的就是扩展推到这里的数据。 */
  installBridge(ctx, BRIDGE_PORT)

  /* ── 三条「新电脑零人工」的自举动作 ──────────────────────────────────────
     ① 扩展：从插件包自带目录 staged 到 harness\extensions（幂等）。
     ② 调试浏览器：**只有两个条件都不满足时**才自动拉起 ——
        CDP 端口已经活着，或者用户自己浏览器里的扩展正在推数据（那就没必要再开一个）。
        拉起来的那份会通过 --load-extension 自带扩展，所以 CDP 源也是有数据的。
     ③ 联动插件：有就连、没有就静默跳过。
     全部包在 try/catch 里：自举失败绝不能影响插件启动。 */
  void (async () => {
    try {
      /* 让 resolveExtensionDir 能把失败原因写出来（模块级函数拿不到 ctx）。 */
      extensionLogger = ctx.logger ?? null
      const extensionDir = resolveExtensionDir()
      ctx.logger?.info?.(`dsh-composer-launcher: 扩展目录 = ${extensionDir === null ? '(未找到)' : extensionDir}`)

      /* 扩展没连时用户只看得到「连不上」，看不出来要去装一次，所以启动就打一条。
         启动这一刻 `pushed` 必然是空的（内存态，刚起来的进程），所以这条按
         「提醒」写而不是按「诊断」写：第一句是条件句，已经装好的人读到了也不会
         被误导，报出来的浏览器和页面又正好是他该点的那一个。
         ⚠️ 只打日志。NEVER-auto-launch-marker 说了：启动路径不许自己开浏览器、
         也不许替用户做决定 —— 提醒和代劳是两回事。 */
      if (extensionDir !== null) {
        ctx.logger?.info?.(`dsh-composer-launcher: 若菜单里标签页显示「扩展未连」，装一次就好 —— ${extensionAdvice(extensionDir)}`)
      }

      /* NEVER-auto-launch-marker: 更正：**启动时绝不自动拉起浏览器**。
         上一版写成"9222 没在跑就拉"，实际效果是每次打开 DSH 都会弹出一个浏览器 ——
         那是打扰，不是自举。**开不开浏览器必须由人决定**：
           · UI 里的「拉起调试浏览器」按钮（它会自动带上扩展，见 launchDebugBrowser）
           · 或者用户自己那台已经装了扩展的浏览器
         所以启动路径只剩两件不打扰的事：staging 扩展 + 探测联动插件。 */
      const cdpReady = (await listTabs(DEFAULT_PORT)).error === null
      ctx.logger?.info?.(`dsh-composer-launcher: CDP ${String(DEFAULT_PORT)} = ${cdpReady ? '已就绪' : '未启动（要读调试端口请点「拉起调试浏览器」；脚本不会自动开浏览器）'}`)

      const webPort = webserver.port
      if (typeof webPort === 'number' && webPort > 0) {
        const linked = await probeLinkedPlugins(webPort)
        ctx.logger?.info?.(`dsh-composer-launcher: 联动插件 -> ${linked.map((x) => `${x.id}:${x.ok ? 'connected' : 'absent'}`).join(', ')}`)
      }
    } catch (error) {
      ctx.logger?.warn?.(`dsh-composer-launcher: 自举动作失败（不影响启动）: ${error instanceof Error ? error.message : String(error)}`)
    }
  })()
}
