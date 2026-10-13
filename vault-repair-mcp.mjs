/**
 * Repair the vault manifest entry for dsh-mcp-manager-ui.
 *
 * WHAT WENT WRONG: vault-register-any.mjs replaced the whole file list when it
 * re-registered an existing plugin, so the entry went from 8 files to 1 — the
 * index.js patch ("隐藏黑悬浮按钮 + 侧栏 footer 竖排") was no longer referenced
 * and restore.ps1 would have skipped it. The snapshot FILES were never lost.
 *
 * This rebuilds the entry as the UNION of the pre-write entry (from the backup)
 * and the freshly written one, refreshing hashes from the snapshot directory,
 * and concatenates both notes.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { resolveDshHome } from './dsh-paths.mjs'

/* 自适应：`DSH_HOME` → 各平台约定位置。**不硬编码盘符 / 用户名。** */
const VAULT = join(resolveDshHome(), 'dsh-patch-vault')
const MANIFEST = join(VAULT, 'manifest.json')
const PLUGIN = 'dsh-mcp-manager-ui'
const VERSION = '1.2.1'
const SNAPSHOT = join(VAULT, 'files', PLUGIN + '@' + VERSION)

const backups = readdirSync(VAULT)
  .filter((name) => name.startsWith('manifest.json.bak-before-' + PLUGIN))
  .sort()
if (backups.length === 0) {
  console.error('no backup found; refusing to guess')
  process.exit(2)
}
const backupPath = join(VAULT, backups[backups.length - 1])
console.log('using backup: ' + backups[backups.length - 1])

const before = JSON.parse(readFileSync(backupPath, 'utf8')).find((row) => row.plugin === PLUGIN)
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const now = manifest.find((row) => row.plugin === PLUGIN)
if (before === undefined || now === undefined) {
  console.error('entry missing on one side; refusing to guess')
  process.exit(2)
}

/* Union of file names, preserving the pre-write order. */
const names = []
for (const f of before.files) names.push(f.rel)
for (const f of now.files) if (!names.includes(f.rel)) names.push(f.rel)

const files = names.map((rel) => {
  const abs = join(SNAPSHOT, rel)
  if (!existsSync(abs)) throw new Error('snapshot file missing: ' + abs)
  const bytes = readFileSync(abs)
  return {
    rel,
    sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase(),
    bytes: bytes.length
  }
})

const merged = {
  generation: before.generation,
  plugin: PLUGIN,
  version: VERSION,
  note: before.note + ' ｜ ' + now.note,
  subdir: before.subdir,
  files
}

const next = manifest.map((row) => (row.plugin === PLUGIN ? merged : row))
writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + '\n', 'utf8')

const check = JSON.parse(readFileSync(MANIFEST, 'utf8')).find((row) => row.plugin === PLUGIN)
console.log('repaired: files ' + before.files.length + ' (before) / ' + now.files.length + ' (broken) -> ' + check.files.length)
for (const f of check.files) console.log('  ' + f.rel + '  ' + f.bytes + ' bytes')
console.log('note: ' + check.note)
