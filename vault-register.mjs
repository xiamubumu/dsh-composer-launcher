/**
 * Register dsh-composer-launcher in the DSH source-patch vault.
 *
 * WHY THIS IS NOT A FAKE ENTRY: the vault's model is "a patched lib tree that
 * an update would overwrite". This plugin is not a patch of somebody else's
 * bundle, but its lib tree IS an installed artifact that can be lost (a
 * generation sweep, a profile rebuild, a plugin update). Registering it means
 * restore.ps1 can put the code back, exactly like it does for the other 13.
 *
 * SCOPE: the vault entry covers lib/*.js (subdir defaults to 'lib'). The
 * package manifest and cordis.patch.yml live at the package ROOT and are not
 * reachable through that path, so install.ps1 remains the complete-reinstall
 * path. The two are complementary, not redundant.
 *
 * Idempotent: an existing entry for the same plugin is replaced.
 *
 * Usage: node vault-register.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDshHomeStrict } from './dsh-paths.mjs'

/* 位置无关：由文件自身推出。 */
const HERE = dirname(fileURLToPath(import.meta.url))
const HARNESS = resolveDshHomeStrict()
if (HARNESS === undefined) {
  console.error('FAILED: 找不到 DSH 主目录（含 profiles\\ 的那层）；设 DSH_HOME 后重跑。')
  process.exit(2)
}
const VAULT = join(HARNESS, 'dsh-patch-vault')
const MANIFEST = join(VAULT, 'manifest.json')
const GEN_LIVE = join(HARNESS, 'profiles', '.generations', 'live')

const PLUGIN = 'dsh-composer-launcher'
const VERSION = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8')).version
const FILES = ['index.js', 'client.js']

/* The generation dir restore.ps1 will actually match, recorded for humans —
   restore.ps1 itself locates it by name, not from this field. */
const generation = (() => {
  try {
    const match = readdirSync(GEN_LIVE).find((name) => name.split('+').includes(PLUGIN))
    return match === undefined ? PLUGIN + '+' + VERSION : match
  } catch {
    return PLUGIN + '+' + VERSION
  }
})()

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const before = manifest.length

/* Back up the manifest before touching it — 13 other plugins depend on it. */
copyFileSync(MANIFEST, MANIFEST + '.bak-before-composer-launcher')

const files = FILES.map((rel) => {
  const abs = join(HERE, 'lib', rel)
  const bytes = readFileSync(abs)
  return {
    rel,
    sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase(),
    bytes: bytes.length
  }
})

const entry = {
  generation: PLUGIN + '+' + VERSION + '+vault',
  plugin: PLUGIN,
  version: VERSION,
  note: '自研插件（非他人补丁）：lib 两个 js 的快照。整包重装走 install.ps1；本条目只恢复 lib/。',
  subdir: 'lib',
  files
}

const kept = manifest.filter((row) => row.plugin !== PLUGIN)
kept.push(entry)
writeFileSync(MANIFEST, JSON.stringify(kept, null, 2) + '\n', 'utf8')

/* Stage the snapshot exactly where restore.ps1 looks for it:
   files/<base>@<version>/<rel> */
const snapshotDir = join(VAULT, 'files', PLUGIN + '@' + VERSION)
mkdirSync(snapshotDir, { recursive: true })
for (const rel of FILES) {
  copyFileSync(join(HERE, 'lib', rel), join(snapshotDir, rel))
}

/* Prove the manifest still parses and the entry landed. */
const check = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const landed = check.find((row) => row.plugin === PLUGIN)
if (landed === undefined) {
  console.error('FAILED: entry missing after write')
  process.exit(1)
}
console.log('vault: entries ' + before + ' -> ' + check.length)
console.log('vault: ' + PLUGIN + ' @' + VERSION + '  files=' + landed.files.length + '  subdir=' + landed.subdir)
for (const f of landed.files) console.log('  ' + f.rel + '  ' + f.bytes + ' bytes  ' + f.sha256.slice(0, 16) + '...')
console.log('vault: snapshot at ' + snapshotDir)
if (!existsSync(join(VAULT, 'restore.ps1'))) { console.error('FAILED: restore.ps1 missing'); process.exit(1) }
