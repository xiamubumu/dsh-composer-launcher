/**
 * Install dsh-composer-launcher the way DSH Desktop itself does.
 *
 * WHY THIS REPLACED HAND-EDITED package.json FIELDS
 * -------------------------------------------------
 * Hand-writing `dependencies` + `dsh.profile.bundles` + `pnpm.overrides` LOOKS
 * like an install and survives until the next DSH launch — then the desktop
 * generation projector rewrites the profile manifest FROM ITS OWN REGISTRY and
 * silently drops every field it does not own. Measured: after one restart all
 * three entries were gone and the plugin was invisible (no `composer-launcher`
 * line anywhere in harness.log).
 *
 * The registry, not package.json, is the source of truth:
 *   profiles/.generations/desired.json          <- authoritative generation id list
 *   profiles/.generations/live/<id>/generation.json  <- per-generation metadata
 * and `projectGenerations()` is the function that turns that registry into the
 * profile manifest. This script writes the registry, then CALLS that function,
 * so all four manifest fields are written by the official code.
 *
 * Usage: node install.mjs
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolveDshHomeStrict, resolveAppRoot, resolveProjectorPath } from './dsh-paths.mjs'

/* 位置无关：HERE 由文件自身推出。 */
const HERE = dirname(fileURLToPath(import.meta.url))

/* 两个根目录一律自适应解析（见 dsh-paths.mjs）；**本文件不允许出现字面量盘符**。 */
const HARNESS = resolveDshHomeStrict()
if (HARNESS === undefined) {
  console.error('FAILED: 找不到 DSH 主目录（含 profiles\\ 的那层）。')
  console.error('        自查：设 DSH_HOME=<DSH 主目录>，或确认 DSH Desktop 已经跑过一次。')
  process.exit(2)
}
const APP_ROOT = resolveAppRoot()
if (APP_ROOT === undefined) {
  console.error('FAILED: 找不到 DSH Desktop 安装目录（含 node_modules\\dsh-desktop-market-installer 的那层）。')
  console.error('        手工指定：先设 DSH_APP_ROOT=<安装目录>\\resources\\app，再重跑本脚本。')
  process.exit(2)
}
const LIVE = join(HARNESS, 'profiles', '.generations', 'live')
const DESIRED = join(HARNESS, 'profiles', '.generations', 'desired.json')
const INSTALLER = resolveProjectorPath(APP_ROOT)

const PLUGIN = 'dsh-composer-launcher'
const VERSION = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8')).version

let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (detail === undefined ? '' : '  -> ' + detail))
}

/* ---- 1. stage the generation directory ------------------------------- */
const hash = createHash('sha256').update(readFileSync(join(HERE, 'lib', 'client.js'))).digest('hex').slice(0, 12)
const generationId = PLUGIN + '+' + VERSION + '+' + hash
const genDir = join(LIVE, generationId)
const pkgDir = join(genDir, 'node_modules', PLUGIN)

/* 实装包里只放**插件本体**，不放开发目录；不做软链接，也不整体拷贝开发目录 ——
   装进 DSH 的是确认可用、可以实装的那一份，而不是开发版。
   ⇒ 边界：开发目录（install*.mjs / install*.ps1 / vault-*.mjs / register.mjs /
   strip-backticks.mjs / dsh-paths.mjs / bridge-selfcheck.mjs / .git …）**只在开发
   目录**，永远不进 DSH；DSH 里那份是"基于开发版、已经确认没问题"的实装副本。
   ⇒ 拷哪些**完全以 package.json 的 files 为准**（再加 package.json 自己）——
   那是插件自己的发货清单，以后加文件只改 files，不用改这里。
   ⇒ 先清掉旧内容再拷：同一个 generation id 会被重用（id 只由 lib/client.js 的哈希
   决定），不清的话上一版多出来的文件会赖在实装目录里。 */
rmSync(pkgDir, { recursive: true, force: true })
mkdirSync(join(pkgDir, 'lib'), { recursive: true })

const SHIPPED = ['package.json', ...(JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8')).files ?? [])]
const shipped = []
const copyInto = (rel) => {
  const from = join(HERE, rel)
  if (!existsSync(from)) return
  if (statSync(from).isDirectory()) {
    mkdirSync(join(pkgDir, rel), { recursive: true })
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (entry.isDirectory()) copyInto(join(rel, entry.name))
      else if (entry.isFile()) copyInto(join(rel, entry.name))
    }
    return
  }
  mkdirSync(dirname(join(pkgDir, rel)), { recursive: true })
  copyFileSync(from, join(pkgDir, rel))
  shipped.push(rel)
}
for (const rel of SHIPPED) copyInto(rel)

const mismatch = []
for (const rel of shipped) {
  const a = createHash('sha256').update(readFileSync(join(HERE, rel))).digest('hex')
  const b = createHash('sha256').update(readFileSync(join(pkgDir, rel))).digest('hex')
  if (a !== b) mismatch.push(rel)
}
check('实装包 = 本插件的发货清单（' + shipped.length + ' 个文件，与开发目录逐文件 sha256 一致）',
  mismatch.length === 0,
  mismatch.length === 0 ? shipped.join(', ') : 'mismatch: ' + mismatch.join(', '))

/* The registry reads THIS file to learn which plugin a generation holds. Its
   validator requires pluginName to match the safe-package-name pattern and
   version the safe-version pattern — get either wrong and
   resolveEnabledGenerations() throws, which takes DSH's startup down. */
writeFileSync(join(genDir, 'generation.json'),
  JSON.stringify({ pluginName: PLUGIN, version: VERSION }, undefined, 2) + '\n', 'utf8')

/* The generation is a tiny pnpm project; mirror that shape. */
writeFileSync(join(genDir, 'package.json'),
  JSON.stringify({ name: 'dsh-generation', private: true, version: '0.0.0', dependencies: { [PLUGIN]: VERSION } }, undefined, 2) + '\n',
  'utf8')

console.log('stage : ' + generationId)
check('generation.json written', existsSync(join(genDir, 'generation.json')))

/* ---- 2. register in desired.json (the authoritative pointer) ---------- */
if (!existsSync(DESIRED)) {
  console.error('FAILED: ' + DESIRED + ' not found — refusing to create it from scratch')
  process.exit(1)
}
copyFileSync(DESIRED, DESIRED + '.bak-before-composer-launcher')

const desired = JSON.parse(readFileSync(DESIRED, 'utf8'))
const before = desired.length
/* Drop any earlier generation of THIS plugin, then add the current one. */
const next = desired.filter((id) => !String(id).startsWith(PLUGIN + '+'))
next.push(generationId)
writeFileSync(DESIRED, JSON.stringify(next, undefined, 2) + '\n', 'utf8')

const reread = JSON.parse(readFileSync(DESIRED, 'utf8'))
check('desired.json parses and lists this generation', reread.includes(generationId),
  before + ' -> ' + reread.length + ' entries')
check('no stale generation of this plugin left in desired',
  reread.filter((id) => String(id).startsWith(PLUGIN + '+')).length === 1)

/* ---- 3. let DSH's own projector write the profile manifest ------------ */
const { projectGenerations } = await import(pathToFileURL(INSTALLER).href)
const result = await projectGenerations(HARNESS, 'web')

check('projection linked this plugin', result.linked.includes(PLUGIN),
  'linked=' + result.linked.length + ' unlinked=' + JSON.stringify(result.unlinked))

/* ---- 4. verify the manifest the projector just wrote ------------------ */
const manifest = JSON.parse(readFileSync(join(HARNESS, 'profiles', 'web', 'package.json'), 'utf8'))
const projection = manifest.dsh?.desktop?.generationProjection?.plugins ?? {}
void result.bundles
check('dependencies has the plugin', manifest.dependencies[PLUGIN] !== undefined,
  String(manifest.dependencies[PLUGIN]))
check('dsh.profile.bundles has the plugin', manifest.dsh.profile.bundles.includes(PLUGIN))
check('pnpm.overrides has the plugin', manifest.pnpm?.overrides?.[PLUGIN] !== undefined)
check('generationProjection has the plugin', projection[PLUGIN] !== undefined,
  JSON.stringify(projection[PLUGIN] || null))
check('projection generationId matches the staged dir',
  projection[PLUGIN]?.generationId === generationId,
  String(projection[PLUGIN]?.generationId))

const link = join(HARNESS, 'profiles', 'web', 'node_modules', PLUGIN)
check('node_modules link exists', existsSync(link))

console.log('')
console.log(failures === 0
  ? 'ALL CHECKS PASSED — restart DSH to load the plugin'
  : failures + ' CHECK(S) FAILED — do NOT restart yet')
process.exit(failures === 0 ? 0 : 1)
