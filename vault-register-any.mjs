/**
 * Register ANY patched plugin lib file in the DSH source-patch vault.
 *
 * The vault is how a source-level patch survives "the plugin updated and my
 * edit is gone": manifest.json records plugin/version/subdir/files, and
 * restore.ps1 copies them back when the installed version still matches.
 *
 * Usage:
 *   node vault-register-any.mjs <pluginPackageDir> <relPath>... --note "<why>"
 * Example:
 *   node vault-register-any.mjs "C:\...\node_modules\dsh-mcp-manager-ui" lib/client.js --note "collapsed section padding"
 *
 * Idempotent per (plugin, file set): an existing entry for the same plugin is
 * replaced. The vault manifest is backed up before every write.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, basename } from 'node:path'

const argv = process.argv.slice(2)
const noteIndex = argv.indexOf('--note')
const note = noteIndex >= 0 ? argv[noteIndex + 1] : '(no note)'
const positional = argv.filter((_, i) => i !== noteIndex && i !== noteIndex + 1)

const pluginDir = positional[0]
const rels = positional.slice(1)

if (pluginDir === undefined || rels.length === 0) {
  console.error('usage: node vault-register-any.mjs <pluginPackageDir> <relPath>... --note "why"')
  process.exit(2)
}

const manifest = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'))
const pluginName = manifest.name
const version = manifest.version
/* The vault resolves files relative to <pkg>/<subdir>; every relPath here is
   expected to live under `lib`, which restore.ps1 uses as its default. */
const subdir = 'lib'

const VAULT = join(resolveDshHome(), 'dsh-patch-vault')
const MANIFEST = join(VAULT, 'manifest.json')
if (!existsSync(MANIFEST)) {
  console.error('vault manifest not found: ' + MANIFEST)
  process.exit(2)
}

const files = rels.map((rel) => {
  const abs = join(pluginDir, rel)
  const bytes = readFileSync(abs)
  return {
    /* rel is stored relative to `subdir`, matching how restore.ps1 joins it. */
    rel: basename(rel),
    sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase(),
    bytes: bytes.length
  }
})

const all = JSON.parse(readFileSync(MANIFEST, 'utf8'))
copyFileSync(MANIFEST, MANIFEST + '.bak-before-' + pluginName.replace(/[^a-z0-9]+/gi, '-'))

const entry = {
  generation: pluginName + '+' + version + '+vault',
  plugin: pluginName,
  version,
  note,
  subdir,
  files
}

/* MERGE, never replace. An earlier version of this script replaced the whole
   entry, which silently dropped the 7 other recorded files of a plugin that
   already had a patch — restore.ps1 would then have skipped them. The union is
   over file names; any file the caller did not name keeps its existing
   recorded hash, so a partial re-registration cannot shrink the ledger. */
const existing = all.find((row) => row.plugin === pluginName)
const kept = all.filter((row) => row.plugin !== pluginName)
if (existing !== undefined) {
  const merged = existing.files.slice()
  const byRel = new Map(merged.map((f, i) => [f.rel, i]))
  for (const f of files) {
    const at = byRel.get(f.rel)
    if (at === undefined) merged.push(f)
    else merged[at] = f
  }
  entry.files = merged
  const missing = existing.files.filter((old) => !files.some((f) => f.rel === old.rel))
  if (missing.length > 0) {
    console.log('vault: kept ' + missing.length + ' previously recorded file(s): ' + missing.map((f) => f.rel).join(', '))
  }
  if (existing.note !== undefined && existing.note !== note) {
    entry.note = existing.note + ' ｜ ' + note
  }
}
kept.push(entry)
writeFileSync(MANIFEST, JSON.stringify(kept, null, 2) + '\n', 'utf8')

const snapshotDir = join(VAULT, 'files', pluginName + '@' + version)
mkdirSync(snapshotDir, { recursive: true })
for (const rel of rels) copyFileSync(join(pluginDir, rel), join(snapshotDir, basename(rel)))

const check = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const landed = check.find((row) => row.plugin === pluginName)
if (landed === undefined) {
  console.error('FAILED: entry missing after write')
  process.exit(1)
}
console.log('vault: entries ' + all.length + ' -> ' + check.length)
console.log('vault: ' + pluginName + ' @' + version + '  files=' + landed.files.length + '  subdir=' + landed.subdir)
for (const f of landed.files) console.log('  ' + f.rel + '  ' + f.bytes + ' bytes')
console.log('vault: note = ' + landed.note)
