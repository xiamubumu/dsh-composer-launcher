/**
 * dsh-paths —— **自适应**地解析 DSH 的两个根目录。**不硬编码盘符 / 用户名 / 安装位置。**
 *
 * 换机器纪律：dsh-composer-launcher 的所有脚本
 * （`install.mjs` / `vault-register.mjs` / `vault-register-any.mjs` / `register.mjs`）
 * 一律从这里取路径，**任何脚本里都不允许再出现字面量盘符或用户名**。
 *
 * 这个文件**随包发布**（`package.json` 的 `files` 里列了它），因为 `install.mjs` 依赖它：
 * 用户从市场或 npm 装完插件后要跑 `install.mjs`，那个脚本必须能解析出这台机器的 DSH 主目录。
 * 只有作者本机的开发脚本（`vault-*.mjs` / `register.mjs` / `strip-backticks.mjs`）不随包发布。
 *
 * @module dsh-paths
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

/**
 * DSH 主目录（那个含 `profiles\`、`settings.yaml`、`dsh-patch-vault\` 的目录）。
 *
 * 顺序：① `DSH_HOME`（DSH 自己会导出，最权威）；② 各平台的约定位置。
 * @returns {string} 绝对路径（**不保证存在**，调用方自行 `existsSync`）。
 */
export function resolveDshHome () {
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

/** DSH 主目录，且**必须存在**；不存在返回 undefined（调用方给出可读的报错）。 */
export function resolveDshHomeStrict () {
  const home = resolveDshHome()
  return existsSync(home) ? home : undefined
}

/**
 * DSH Desktop 的 app 根 —— 那个含 `node_modules\dsh-desktop-market-installer` 的目录。
 *
 * 只有部署脚本需要它（用来 import 官方 `projectGenerations`）。
 * 顺序：
 *   ① `DSH_APP_ROOT`（`install.ps1` 会先用注册表解析好再导出，Windows 上最可靠）
 *   ② 从当前 node 可执行文件 / 脚本位置逐级上溯（脚本跑在 app 内部时命中）
 *   ③ 各平台常见安装位置
 *   ④ Windows：按盘符扫 `<盘>:\DSH Desktop\resources\app`（26 次 stat，代价可忽略）
 * @returns {string|undefined} 找不到返回 undefined。
 */
export function resolveAppRoot () {
  const seen = new Set()
  const probe = (dir) => {
    if (typeof dir !== 'string' || dir === '' || seen.has(dir)) return undefined
    seen.add(dir)
    return existsSync(join(dir, 'node_modules', 'dsh-desktop-market-installer')) ? dir : undefined
  }

  const fromEnv = probe(process.env.DSH_APP_ROOT)
  if (fromEnv !== undefined) return fromEnv

  for (const start of [process.execPath, process.argv[1]]) {
    if (typeof start !== 'string' || start === '') continue
    let dir = dirname(start)
    for (let depth = 0; depth < 8; depth += 1) {
      const hit = probe(dir) ?? probe(join(dir, 'resources', 'app'))
      if (hit !== undefined) return hit
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }

  const home = homedir()
  const roots = [
    join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs'),
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    '/Applications',
    join(home, 'Applications'),
    join(home, '.local', 'share'),
  ].filter((root) => typeof root === 'string' && root !== '')
  for (const root of roots) {
    const hit = probe(join(root, 'DSH Desktop', 'resources', 'app'))
      ?? probe(join(root, 'dsh-desktop', 'resources', 'app'))
      ?? probe(join(root, 'DSH Desktop'))
    if (hit !== undefined) return hit
  }

  if (process.platform === 'win32') {
    for (let code = 67; code <= 90; code += 1) {
      const hit = probe(join(String.fromCharCode(code) + ':\\', 'DSH Desktop', 'resources', 'app'))
      if (hit !== undefined) return hit
    }
  }
  return undefined
}

/** 官方 projector 的绝对路径（部署脚本用它写 profile 清单，保证重启不被覆盖）。 */
export function resolveProjectorPath (appRoot) {
  return join(appRoot, 'node_modules', 'dsh-desktop-market-installer', 'generations', 'projection.mjs')
}
