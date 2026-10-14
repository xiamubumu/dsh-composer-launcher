# 浏览器扩展教程：怎么装、怎么验证、装不上怎么办

> 适用：`dsh-composer-launcher` **1.0.0** 及以上。
> 只讲组合器里那一行「标签页」用的浏览器扩展。
> **不装扩展，插件其余功能一切正常** —— 只是「标签页」行会退回用调试端口读（也能读到，只是不含扩展自己的信息）。

---

## 一、先看结论

| 路线 | 装到哪个浏览器 | 需要你做什么 | 实测状态 |
|---|---|---|---|
| **A. 插件拉起的浏览器** | 插件自己启动的那个浏览器进程 | **什么都不用做**，点一下按钮 | ✅ 已核实（Edge 155.0.4283.45） |
| **B. 你日常那个浏览器** | 你平时用的 Edge / Chrome / Brave / … | 一次性手工装（约 20 秒），之后一劳永逸 | ✅ 通用做法 |
| **C. 企业策略** | 全机器强制安装 | 需要管理员 + 自托管已签名 CRX + HTTPS 清单 | ❌ 本仓库不提供，只作说明 |

**Chromium 的硬限制（先讲清楚，免得你以为我们偷懒）**：任何插件都**不可能**把磁盘上的一个文件夹静默塞进你日常浏览器的扩展列表 —— 这需要用户手势，或者企业策略。
所以「装插件就自动装好扩展」**只对路线 A 成立**；路线 B 我们把它压缩成两个按钮 + 五步手工；路线 C 只能管理员做，本仓库不提供。

---

## 二、路线 A：让插件拉起的浏览器自带扩展（推荐，零人工）

### 怎么触发

- 界面：组合器空态 / 标签页那一行的 **[用带扩展的浏览器打开]** 按钮
- 接口：`POST /composer-launcher/open-debug-browser`

### 插件到底做了什么

1. **暂存扩展**：把插件安装目录里的 `extension/` 拷到 `<DSH_HOME>\extensions\dsh-tab-bridge`（Windows 上是 `%APPDATA%\dsh-desktop\harness\extensions\dsh-tab-bridge`），并**逐项校验 6 个必需文件**：`manifest.json`、`background.js`、`popup.html`、`popup.js`、`_locales\en\messages.json`、`_locales\zh_CN\messages.json`。缺任何一项就清掉半成品重拷；拷不动就写日志并如实返回失败（**不会**把半个扩展丢给浏览器）。
2. **拉起浏览器**（Chromium 系，自动探测已装的那一个），命令行参数：

   ```
   --user-data-dir=<插件自己的 profile>
   --remote-debugging-port=<调试端口>
   --no-first-run --no-default-browser-check
   --load-extension=<暂存目录>
   --disable-extensions-except=<暂存目录>
   --disable-features=DisableLoadExtensionCommandLineSwitch
   about:blank
   ```

   > `--disable-features=…` 是给 Edge/Chrome **137+** 用的：没有它，`--load-extension` 会被直接忽略。
   > `--user-data-dir` 是必需的：Chromium 不允许在默认 profile 上开调试端口。

3. **核实挂没挂上**（这一步是关键）：读 `http://127.0.0.1:<调试端口>/json/list`，**只有当出现 `chrome-extension://<本扩展>/background.js` 才算成功**，返回结果里 `extensionLoaded: true`。
   Edge 自带扩展用的是 `_generated_background_page.html` / `background.rollup.js`，**不算**我们的。
4. **自愈**：如果这份 profile 没挂上（长活的旧 profile 实测挂上率 0%），插件会：
   杀掉这个浏览器进程树 → 等调试端口真正释放（轮询确认）→ 换 `<原 profile>-ext` 干净 profile **重试一次** → 再核实。
   两次都不行就如实返回 `extensionLoaded: false` + `note` 说明原因，标签页改走调试端口读 —— **绝不假称成功**。

### 返回长什么样

```json
{"ok":true,"launched":true,"binary":"…\\msedge.exe","userDataDir":"…\\.dsh-edge-agent-ext",
 "extensionLoaded":true,"healed":true,"note":"旧 profile 已经不被接受，改用干净 profile：…"}
```

`extensionLoaded` 是**核实过**的；`healed:true` 表示它换过干净 profile 才成功。

---

## 三、路线 B：装进你日常那个浏览器（一次性，约 20 秒）

1. 点 **[打开扩展管理页]** —— 插件会打开你这台机器上第一个 Chromium 浏览器的扩展页（`edge://extensions` 或 `chrome://extensions`）。
   （接口：`POST /composer-launcher/open-extensions-page`）
2. 打开右上角 **开发者模式**。
3. 点 **加载解压缩的扩展**。
4. 选中这个目录：
   ```
   %APPDATA%\dsh-desktop\harness\extensions\dsh-tab-bridge
   ```
   也就是 `<DSH_HOME>\extensions\dsh-tab-bridge`。点 **[复制扩展路径]** 可以直接粘贴。
5. 装完点扩展图标，确认里面的**桥端口 = 43130**（不是的话填实际端口 —— 端口被 `DSH_LAUNCHER_BRIDGE_PORT` 改过时用得上）。

脚本方式（非交互也行）：仓库根目录的 `install-extension.ps1`，`-Browser <id>` 可指定浏览器。

---

## 四、路线 C：企业策略（本仓库不提供）

想让全机器每个人免手工，只能用管理员手段：组策略/注册表 `ExtensionSettings` + `ExtensionInstallForcelist`，配**自托管的已签名 CRX** 与 HTTPS 的 update manifest。
这需要证书、管理员权限和一台分发服务器，**超出本插件的范围**，这里只说明「理论上有这条路」。

---

## 五、怎么确认真的装上了

| 判据 | 怎么看 |
|---|---|
| 组合器「标签页」行开始有页面 | 界面直接看 |
| `extensionTabs` > 0 | `GET /composer-launcher/health` → `{"ok":true,"plugin":"dsh-composer-launcher","extensionTabs":N,"extensionAt":…}` |
| 浏览器自己认它 | `edge://extensions` / `chrome://extensions` 列表里能看到 |
| 调试端口判据（最硬） | `GET http://127.0.0.1:<调试端口>/json/list`，出现 `chrome-extension://…/background.js` |

---

## 六、装不上怎么办

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 点了按钮，浏览器起来了，但标签页行没数据 | 那份 profile 拒绝挂载扩展（旧 profile 常见） | 再点一次（插件会自愈换干净 profile）；或走路线 B |
| `extensionLoaded:false` + `note` | 两次都没挂上（浏览器忽略了 `--load-extension`） | 走路线 B；顺手看看浏览器是不是被其它策略/启动参数锁了 |
| `extensionTabs:0` | 扩展装了但连不上桥：端口不一致 / 桥没起 | 在扩展 popup 里把端口改成实际的桥端口；确认 43130（或 `DSH_LAUNCHER_BRIDGE_PORT`）在监听 |
| 日志里报暂存扩展失败 | 安装目录里的 `extension/` 缺失或被杀软拦了 | 先看日志里的 `[extension]` 行；必要时重装插件 |
| 用的是 Firefox / Safari | 本扩展是 Chromium 系扩展 | 目前不支持，用 Chrome/Edge/Brave/Vivaldi/Opera |
| 一台机器跑两个 DSH 实例 | 两个实例抢 43130 | 给其中一个设 `DSH_LAUNCHER_BRIDGE_PORT`，并在扩展 popup 里填同一个端口 |

---

## 七、给你自己的 agent 的提示词（复制粘贴）

```
请帮我把 DSH 组合器的浏览器扩展装进我日常使用的浏览器。
扩展的暂存目录是：%APPDATA%\dsh-desktop\harness\extensions\dsh-tab-bridge
如果这个目录不存在或缺少 manifest.json，先告诉我，不要自己造。
步骤：打开我常用浏览器的扩展页（edge://extensions 或 chrome://extensions）→ 打开开发者模式 →
加载解压缩的扩展 → 选上面那个目录 → 装好后确认它显示为已启用。
最后告诉我：装到了哪个浏览器、有没有报错、以及扩展 popup 里应该填的桥端口（默认 43130）。
不要修改浏览器启动参数，不要改注册表，不要装企业策略。
```

---

## 八、一句话总结

**路线 A 是零人工且经过核实的**（插件自己拉的浏览器自带扩展，并且会验、会自愈、失败会如实说）；**路线 B 是唯一能把扩展装进你日常浏览器的方式**，现在只需两个按钮 + 五步；日常浏览器里做不到静默安装，这是 Chromium 的安全限制，不是本插件的缺陷。
