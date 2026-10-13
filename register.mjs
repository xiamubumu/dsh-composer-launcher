/**
 * Register dsh-composer-launcher into the web profile the same way the market
 * does: a `link:` dependency, a matching pnpm override, and one entry in
 * dsh.profile.bundles. Idempotent — running it twice changes nothing.
 *
 * Deliberately Node rather than PowerShell: the profile manifest is a 17 KB
 * JSON document with a `pnpm.overrides` map and a `dsh.profile.bundles`
 * array, and PowerShell 5.1's ConvertTo-Json round-trip is not trustworthy on
 * structures like that. JSON.parse/stringify is.
 *
 * Usage:
 *   node register.mjs <generationDir>
 * where <generationDir> is the directory UNDER .generations/live that holds
 * node_modules/dsh-composer-launcher (install.ps1 stages it and passes it in).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { resolveDshHome } from './dsh-paths.mjs'

const NAME = 'dsh-composer-launcher'

/* 自适应：`DSH_HOME` → 各平台约定位置。**不硬编码盘符 / 用户名。** */
const harness = resolveDshHome()
const profile = join(harness, 'profiles', 'web')
const genLive = join(harness, 'profiles', '.generations', 'live')

const genDir = process.argv[2]
if (genDir === undefined || genDir === '') {
  console.error('usage: node register.mjs <generationDir>')
  process.exit(2)
}

/* pnpm link: targets are relative to the profile directory. The generation
   tree lives in a SIBLING of the profile (profiles/web vs profiles/.generations),
   so the spec must climb out of the profile first — path.relative gets that
   right, string slicing does not. */
const target = join(genDir, 'node_modules', NAME)
const rel = relative(resolve(profile), resolve(target)).split('\\').join('/')
const linkSpec = 'link:' + rel

const manifestPath = join(profile, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const changes = []

manifest.dependencies ??= {}
if (manifest.dependencies[NAME] !== linkSpec) {
  manifest.dependencies[NAME] = linkSpec
  changes.push('dependencies[' + NAME + ']')
}

manifest.pnpm ??= {}
manifest.pnpm.overrides ??= {}
if (manifest.pnpm.overrides[NAME] !== linkSpec) {
  manifest.pnpm.overrides[NAME] = linkSpec
  changes.push('pnpm.overrides[' + NAME + ']')
}

manifest.dsh ??= {}
manifest.dsh.profile ??= {}
manifest.dsh.profile.bundles ??= []
if (!manifest.dsh.profile.bundles.includes(NAME)) {
  manifest.dsh.profile.bundles.push(NAME)
  changes.push('dsh.profile.bundles += ' + NAME)
}

if (changes.length === 0) {
  console.log('register: already present, nothing written')
} else {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log('register: wrote ' + manifestPath)
  for (const change of changes) console.log('  + ' + change)
}
console.log('register: link spec = ' + linkSpec)
console.log('register: bundles now = ' + manifest.dsh.profile.bundles.length)

/* Re-read to prove the document still parses after the write. */
const check = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (!check.dsh.profile.bundles.includes(NAME)) {
  console.error('register: verification failed')
  process.exit(1)
}
void genLive
