# dsh-composer-launcher

[English](README.md) · **简体中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-1.5-4c6ef5.svg)](#兼容性)
[![Host](https://img.shields.io/badge/host-desktop%20%7C%20web-2f9e44.svg)](#兼容性)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#兼容性)

**把输入框左边的「+」按钮，变成一个真正的菜单。**

---

## 目录

- [这是什么](#这是什么)
- [它做什么](#它做什么)
- [截图](#截图)
- [浏览器扩展](#浏览器扩展)
- [设置项](#设置项)
- [HTTP 路由](#http-路由)
- [界面语言](#界面语言)
- [🔗 插件联动](#-插件联动)
- [已知边界（如实说明）](#已知边界如实说明)
- [安装](#安装)
- [兼容性](#兼容性)
- [常见问题](#常见问题)
- [仓库结构](#仓库结构)
- [自检](#自检)
- [License](#license)

---

## 这是什么

默认情况下，输入框左边的 `+` 按钮只会打开一个文件选择器。其它任何你想「指给模型看」的东西 —— 你正在浏览的标签页、一段历史对话、一个技能、一台 MCP 服务器、这台机器上装的某个插件 —— 都只能手打，或者用 `@` 引用。

`dsh-composer-launcher` 把这个按钮换成一个**三组菜单**：

| 分组 | 里面有什么 |
|---|---|
| **添加** | 文件与文件夹、历史对话、计划模式、目标模式 |
| **能力** | 斜杠指令、技能、MCP 服务器 |
| **常用插件** | 每个已装插件一行，外加一行「全部插件」 |

你选中的东西**不会被当成文本粘贴进去**，而是落成输入框上方一条栏上的**原生引用芯片** —— 和宿主自己为 `@` 引用渲染的芯片是同一种 —— 只有在你真正发送时，它才变成消息文本。

另有一个**可选的浏览器扩展**（`DSH Tab Bridge`），它把你真实浏览器里的标签页通过一条本机回环 HTTP 桥推进插件，所以「标签页」那一行列的是你**真的开着**的页面，而不是一个临时调试实例。

---

## 它做什么

### 1. 加号菜单（三组）

一个 360px 高的面板，挂在 `conversation.input.left` 插槽上。

- **添加** —— *文件与文件夹*（宿主自己的选择器，支持多选与拖拽；宿主没有目录选择器时自动退回 `@` 引用）、*历史对话*（走 `remote.sessionReferenceResolver`，只列对话，不含文件）、*计划*、*目标*。
- **能力** —— *指令*（宿主斜杠指令服务提供什么就列什么）、*技能*（用 `ctx.remote.skills.list({ sessionId })` 实时读取）、*MCP*（需要宿主的 `remote.mcpManager`）。
- **常用插件** —— `ctx.remote.pluginInventory.list()` 返回的每个插件一行。这份清单**每次加载都从宿主重新读**，所以装、卸、停用插件会立刻反映出来，不存在需要同步的缓存。三种模式决定显示哪些行：`pinned` / `frequent` / `mixed`（见[设置项](#设置项)）。

每一行都能在设置卡片里单独关掉。

### 2. 引用芯片

选中的东西落在输入框**上方**的一条栏上（`conversation.input.dock`）。一个芯片是 `{ label, kind, icon }` 加一个可选的 `url`，其中 `kind` 只取 `web` / `plugin` / `skill` / `mcp` 之一。点 `×` 删掉它。

有两条特性值得单独说，因为它们在变成特性之前都是 bug：

- **网页芯片一定带着地址。** 一个没有 URL 的页面标题，对读这条消息的人来说毫无用处 —— 所以芯片带着 URL，载荷里也带。
- **会话引用始终是芯片。** 把一个引用写回宿主的纯文本草稿接口，会把它悄悄降级成正文；本插件不这么干，它把引用渲染成芯片，并且绝不让它绕一圈变成文本。

芯片是**按会话隔离**的，两个对话标签页不会共用一条栏。

发送时，每个芯片会被序列化成带短标记的消息文本，这样模型能区分「引用的网页」和「附上的文件」：

| 芯片种类 | 标记 |
|---|---|
| 网页 | `【参考网页】<标题> — <URL>` |
| 插件 | `【使用插件】<名字>` |
| 技能 | `【技能】<名字>` |
| MCP 服务器 | `【MCP】<名字>` |

> 这些标记是**字面量**，两种界面语言下都是中文。它们是**给模型读的**消息文本，不是界面文案 —— 翻译它们等于改变模型看到的内容。

### 3. 设置卡片

注册在 `settings.plugin.item` 插槽上，标题是**启动器**（英文界面下是 *Launcher*）。第一次打开时是折叠的，并且会记住这个选择。十二个字段见[设置项](#设置项)。

### 4. 调试浏览器（退路）

如果你装不了扩展，「标签页」那一行仍然可以从一个带远程调试端口的 Chromium 进程里读标签页 —— 那就是**拉起调试浏览器**做的事：用一份一次性的配置目录启动一个实例。这是退路，不是推荐路径：它只能看到那一个实例里的标签页，而且刻意没有被放在主入口上。

### 5. 本机回环桥

宿主半边在 `127.0.0.1:43130` 上持有一条很小的 HTTP 桥，好让扩展把标签页推进来。它只绑回环地址，遇到旧实例占着端口时会主动让位，除此之外不做任何别的事。

---

## 截图

**加号菜单 —— 添加 / 能力 / 常用插件 —— 以及由扩展供数的「标签页」行**

![扩展已连接时的加号菜单与标签页分组](screenshots/01-composer-menu-tab-bridge.png)

**「标签页」行通过桥读取一个真实的 Microsoft Edge 窗口**

![从 Microsoft Edge 推上来的标签页列表](screenshots/02-tab-list-edge.png)

**能力组能引用的 MCP 服务器 —— 这一行由宿主的 `remote.mcpManager` 供数**

![宿主列出的 MCP 服务器](screenshots/03-mcp-servers.png)

**「常用插件」组所依据的插件清单，包括它那个「N / M」收窄计数**

![带组合收窄的插件清单](screenshots/04-plugin-inventory.png)

---

## 浏览器扩展

没有它插件照样能用 —— 「标签页」行会直接说明扩展没装，并指向那个按钮。装了它，这一行列的就是你**日常那个浏览器**里的标签页。

### 它怎么工作

它**不轮询**，是扩展主动**推送**：

| 触发 | 动作 |
|---|---|
| `tabs.onCreated` / `onUpdated` / `onRemoved` / `onActivated` / `onMoved` / `onAttached` / `onDetached` | 立刻推 |
| 一分钟一次的 `alarms` 心跳 | 推 |
| 浏览器启动、安装、更新 | 推 |

每次推送都是 `POST http://127.0.0.1:43130/composer-launcher/tabs`，body 是 `{ tabs: [...] }`。推送失败会被吞掉，绝不抛出 —— 桥是允许关着的，扩展不能因此在控制台里刷错误。

宿主把最后一次推送保留 **65 秒**（`PUSH_TTL_MS`），**刻意比一分钟心跳长**，这样一次慢心跳不会让这一行闪成空的。**空推送会被忽略而不是照做**（返回 `ignored: 'empty-push-kept-previous'`），因为浏览器偶尔报个空列表，绝不能把清单清掉。

推送的字段是 `{ id, title, url, host, favIconUrl, browser }`。内部页在发送前就被过滤掉了：`chrome:`、`edge:`、`brave:`、`opera:`、`vivaldi:`、`about:`、`devtools:`、`chrome-extension:`、`extension:`、`moz-extension:`。

扩展的弹窗会显示连接状态、允许你改端口，还有一个**保存并立刻推送**按钮，用于不想等下一次心跳的时候。

### 支持哪些浏览器

扩展是 Manifest V3，并且统一走 `globalThis.browser ?? globalThis.chrome`，所以每个 Chromium 浏览器和 Firefox 都能装。

| 浏览器 | 扩展页 | 安装方式 |
|---|---|---|
| Microsoft Edge | `edge://extensions` | 加载解压缩的扩展 |
| Google Chrome | `chrome://extensions` | 加载已解压的扩展程序 |
| Brave | `brave://extensions` | Load unpacked |
| Vivaldi | `vivaldi://extensions` | Load unpacked |
| Opera | `opera://extensions` | Load unpacked |
| Arc | `arc://extensions` | Load unpacked |
| 360 极速浏览器 | `chrome://extensions` | 加载已解压的扩展程序 |
| QQ 浏览器 | `chrome://extensions` | 加载已解压的扩展程序 |
| Firefox | `about:debugging#/runtime/this-firefox` | 临时载入附加组件 |

Chromium 不允许静默旁加载扩展 —— 这是浏览器的安全规则，插件绕不过去。所以插件能做的是**把路指准**：`install-extension.ps1` 会枚举**这台机器上真正装了的**浏览器（Windows 上读 `StartMenuInternet` 注册表项，macOS 与 Linux 读各自平台的位置），把它们打出来，然后为你选中的那个打开正确的扩展页。`-Browser <id>` 可以非交互地指定。那个脚本里**没有任何盘符或用户名**。

Firefox 也在支持列表里，但在插件自己的浏览器表里被单独标记：它**不会被提供给调试浏览器启动器**，因为那个启动器传的是 Chromium 专有的参数。

### 端口

默认 `43130`。宿主那半边的端口是个常量；扩展那半边可以在弹窗里改。改了一边就要改另一边 —— 不一致的唯一后果是「标签页」行报告扩展离线，并退回调试端口那条路。

`43129` 被识别为旧端口，第一次读到时会自动迁移。

---

## 设置项

命名空间 `composer-launcher`。除了最后一项，其余全是布尔或数字，且全部可选。

| 字段 | 默认 | 含义 |
|---|---|---|
| `showWeb` | `true` | 显示「标签页」行 |
| `webCount` | `3` | 显示几个标签页后收成「还有 N 个标签页」 |
| `port` | `9222` | 本机 **CDP** 端口（调试浏览器那条路，不是桥） |
| `showFiles` | `true` | 显示「文件与文件夹」行 |
| `showPlan` | `true` | 显示「计划」行 |
| `showGoal` | `true` | 显示「目标」行 |
| `showCmd` | `true` | 显示斜杠指令行 |
| `showSkill` | `true` | 显示技能行 |
| `showMcp` | `true` | 显示 MCP 行 |
| `pluginMode` | `"mixed"` | `pinned` \| `frequent` \| `mixed` |
| `pluginCount` | `5` | 显示几个插件行后收成「全部插件」 |
| `pinned` | `[]` | 无论什么模式都固定显示的插件 |

> `pinned` 默认为空是**有意的**，客户端半边也保持同样的空默认。它曾经只在宿主侧的 schema 里列了两个插件名，导致两半不一致 —— 一个从没打开过设置的用户会看到两行自己从没选过的固定插件。

---

## HTTP 路由

全部挂在宿主已有的 web 服务器的 `/composer-launcher` 前缀下。插件**不自开第二个 web 端口**（43130 那条桥是另一条独立的、很小的回环 socket，只给扩展用）。

| 方法 | 路径 | 作用 |
|---|---|---|
| `POST` | `/tabs` | 扩展推送标签页。返回 `{ ok, accepted }`；空推送被拒时返回 `{ accepted: 0, ignored: 'empty-push-kept-previous', kept: N }` |
| `GET` | `/tabs?port=` | 合并后的标签页（扩展优先，CDP 次之）。返回 `{ source, stale, port, sources: { extension, cdp, mixed }, extensionHint, tabs, error }` |
| `GET` | `/stage-extension` | 把随包的扩展拷到一个稳定路径，返回 `{ extensionDir, dir, browsers, note }` —— `browsers` 就是这台机器上真正装了的浏览器列表 |
| `GET` | `/linked-plugins` | 探测伙伴插件。返回 `{ linked: [{ id, label, ok, detail }] }` |
| `POST` | `/open-debug-browser` | 起一个带调试端口的 Chromium 实例 |
| `GET` | `/bundles` | profile 挂载的插件清单 |
| `GET`\|`HEAD` | `/favicon?u=<编码后>` | 同源 favicon 代理：嗅探字节、缓存 6 小时、响应头带 `default-src 'none'; sandbox` |
| `GET`\|`HEAD` | `/bridge` | 桥的身份：`{ bridge: true, pid, port, holding, startedAt }` |
| `POST` | `/bridge-yield` | 请旧实例让出桥端口 |
| `GET` | `/health` | `{ plugin, extensionTabs, extensionAt }` |

该前缀下其它任何路径返回 404 `{ ok: false, error: 'not found' }`。

写操作是有闸的：非 `GET`/`HEAD` 的请求，如果不是「完全没有 Origin」、不是 `chrome-extension://` 或 `moz-extension://` 来源、也不是同 Host，一律 403 `cross-site request rejected`。favicon 代理是唯一一条接受任意 URL 的路由 —— 正因如此它被沙箱化并做了字节嗅探，而不是被信任。

---

## 界面语言

插件自己的界面文案**跟随宿主语言**，没有独立开关。

- 客户端半边注入 `locale` 服务、读当前语言，并在它变化时**实时重译**，不用刷新。
- 目前随包两份表：**中文**与**英文**，各 194 条，扁平点分命名（`'button.title'`、`'settings.title'`、`'jump.composer.missing'`）。
- 取词顺序是**当前语言 → 英文 → 键名本身**。`t()` 永远不可能返回 `undefined`，也永远不会抛错 —— 缺一条翻译就降级到英文，连键都没有就显示键名，而不是留一行空白。
- 拿不到 locale 服务时，语言依次退回 `document.documentElement.lang` → `navigator.language` → `en`。
- 注册表是**可扩展的**：`registerLanguage(id, table)` 加一份表，插件还会把自己已有的语言通报给宿主 locale 服务，好让它们出现在宿主的语言选择里。
- **扩展**用不了宿主的 locale 服务（它是另一个浏览器进程），所以它走浏览器自己的 `_locales` 机制，带 `en` 与 `zh_CN` 两份，并读 `api.i18n.getUILanguage()`。

---

## 🔗 插件联动

### 与 `dsh-capability-composer` —— 一条真实、双向的联动

> **这是唯一一条会改变你看到什么的联动，所以必须说清楚。**

**启动器做了什么。** 它声明了一个联动插件：

```
{ id: 'capability-composer', label: '能力组合器', path: '/dsh-capability-composer/state' }
```

启动时它探一下那个路径，逐个打印 `connected` 或 `absent`。在客户端半边，它使用组合器自己的接口：

| 用途 | 接口 | 组合器不在时 |
|---|---|---|
| 插件行的收窄范围 | `/dsh-capability-composer/effective?sessionId=…` | 退回**列出全部**插件，并说明为什么 |
| 「设置组合」跳转按钮 | `/dsh-capability-composer/state` | 不跳转，并显示一条可关闭的提示，点名缺失的插件 |

**组合器不在时会发生什么。** 什么都不会坏。「常用插件」组列出所有已装插件，而不是被收窄过的那一撮；两个**设置组合**按钮拒绝跳转，点击后显示 15 秒：

> 未检测到组合器插件 dsh-capability-composer —— 请先安装并启用它，再回来点「设置组合」。

**探测是刻意偏乐观的。** 被拒绝或非 2xx 的响应会被判为「没装」，但**网络层抛错会被当成「可达」**。一个假的「没装」比一个假的「装了」更糟：前者把一个能用的按钮藏起来，后者只是让跳转落到一个暂时没有那个页签的设置页上。

**启动器不做什么。** 它**不计算**收窄数字。「N / M 已装插件」这个计数是在这里渲染的，但两个数字分别来自组合器（`N`）和本插件的插件清单（`M`）。启动器**从不写**组合器的状态。

### 与 MCP 面板 —— 一个入口，不是依赖

「能力」组里的 **MCP** 行由宿主的 `remote.mcpManager` 服务供数（实际场景里由某个 MCP 管理插件提供）。本插件的宿主半边**一行 MCP 代码都没有**；它不读、不配、不重启任何 MCP 服务器。

那个服务不在时，MCP 这一行就是不可用，点了会给出一个直白的理由，而不是静默失败。有哪些服务器、是不是启用的、暴露了哪些工具，完全是 MCP 面板自己的事。

### 与本系列其它插件

`dsh-composer-launcher` 与 `dsh-context-reclaim`、`dsh-aux-degrade` **没有代码级关系**。它们解决的问题不同 —— 那两个管的是「什么进入上下文」和「辅助调用花掉多少预算」，这个管的是「你怎么把东西指给输入框」。单独装任何一个都能用；兄弟插件缺失时，插件清单里那一行只会显示为未安装。

---

## 已知边界（如实说明）

- **启用 / 禁用开关没有接。** 插件行会显示状态并链到设置页，但不会从这里开关一个插件。
- **真标签页只能靠扩展**（或调试浏览器）。没有第三条路 —— 插件没法伸手进一个自己不在其中运行的浏览器。
- **桥的端口在宿主侧不可配置。** 它是一个常量 `43130`；扩展那半边可以改。
- **Firefox 的 MV3 支持在多数构建里意味着临时载入**，这是浏览器限制，不是插件的。
- **favicon 代理接受任意 URL。** 它被沙箱化、做了字节嗅探与体积限制，但它仍然是唯一一条在把机器暴露出去之前值得先搞明白的路由。

---

## 安装

### 从插件市场

搜 **dsh-composer-launcher** 装上即可。这就是全部步骤 —— 没有脚本，没有要改的路径。

### 从 GitHub

```bash
dsh plugin --profile web add github:xiamubumu/dsh-composer-launcher
```

### 从本地目录

```bash
node install.mjs
```

或者在 Windows PowerShell 里：

```powershell
pwsh -ExecutionPolicy Bypass -File .\install.ps1
```

`install.ps1` 跑三步，遇到第一个失败就停：

1. **反引号闸门**（`strip-backticks.mjs`）—— 客户端 bundle 在部署前必须一个反引号都没有。它排在第一位是因为它会改文件：改之前检查过的 bundle，不等于最后发出去的那个 bundle。
2. **部署**（`install.mjs`）—— 把发货清单里的文件拷进一个新的 generation，写这个 generation 的 `generation.json` 与 `desired.json`，然后调宿主自己的 `projectGenerations()` 让它生效。它最后会**真的 import 一次宿主半边**并回读 profile 清单，所以一个装不起来的 bundle 会在这里就被抓到，而不是等你下次开机。
3. **复核** —— 回读 profile 的 `dependencies`、`dsh.profile.bundles` 与 generation 投影并断言。

脚本自己找 Node：先看 `PATH`，再看 DSH Desktop 自带的运行时。**你不需要自己装 Node。**

### 然后重启 DSH

插件的宿主半边和它的补丁文件都**只在启动时读一次**。装完重启一次 DSH；客户端半边随后随应用一起加载。

### 扩展（可选）

```powershell
pwsh -ExecutionPolicy Bypass -File .\install-extension.ps1
```

它会把扩展放到一个稳定路径，列出它在这台机器上找到的浏览器，并打开对应的扩展页。加 `-Browser edge`（或 `chrome`、`brave`、`vivaldi`、`opera`、`arc`、`360`、`qq`、`firefox`）可以跳过选择。

---

## 兼容性

| | |
|---|---|
| **DSH** | **只支持 1.5 系列** —— `engines.dsh: ">=0.1.5-rc.2 <0.2.0"` |
| **桌面版** | ✅ 支持 |
| **网页版** | ✅ 支持 |
| **其它 DSH 宿主** | ✅ 只要是 DSH 就支持 —— 这里没有任何一处是桌面版专有的 |
| **操作系统** | Windows、macOS、Linux |
| **Node** | 随 DSH 一起提供；这里用到的语法面向 Node 20+，但你从来不用自己装 |
| **第三方依赖** | 没有 —— peer 依赖全是 DeepSeek Harness 官方包加 React |

上界是**有意**的。插件挂的是客户端插槽和宿主路由，这些契约在 1.5 这条线里还在动，所以它只声明自己真正测过的那条线，不多claim一点。后续版本会放宽。

### 网页版没有原生文件夹对话框 —— 所以本插件补一个

DSH 自己的目录选择流（`@deepseek-ai/dsh-client-ui-directory-picker-native`）只读一个浏览器全局：`window.dshDesktopDirectoryPicker.pick()`。**只有桌面外壳**会注入它；网页版里这个全局不存在，于是那条流直接 reject：

```
DSH Desktop directory picker bridge is unavailable
```

DSH 的工作区界面把它显示成「无法打开文件夹」。你自己的文件夹按钮和 DSH 自己的选择器走的是**同一个全局**，所以本插件在**真桥缺席时**才装一个替身：

- 真的桌面外壳 ⇒ 替身**一行都不装**；而且替身的 `pick()` 每次调用都会重新检查，迟到的真桥照样优先；
- 网页版 ⇒ 替身让你**手填**文件夹的绝对路径（浏览器出于安全限制不给绝对路径 —— `showDirectoryPicker()` 给回的句柄里唯一有用的是最后一段名字 —— 所以手填是**唯一**能把一个真实目录交给服务端的办法）。相对路径会被拒绝；`D:\…`、`\\服务器\共享`、`/…` 都接受。

不想要这个行为就别装本插件：这个替身不存在于任何其它地方。

---

## 常见问题

<details>
<summary>我需要装那个浏览器扩展吗？</summary>

不需要。插件的菜单、芯片、技能、指令、MCP 和插件行，不用扩展全都能用。扩展只负责把**标签页**那一行填成你真实浏览器里开着的页面。没有它，那一行仍然可以读你自己拉起来的调试实例。

</details>

<details>
<summary>我刚装了扩展，「标签页」行却说没装？</summary>

两个常见原因，扩展的弹窗里都看得到：

- 弹窗显示*连不上* —— 端口对不上。两边默认都是 `43130`；你改了一边，就把另一边也改了。
- 弹窗说推过了，但那一行还是旧的 —— 宿主把一次推送保留 65 秒，心跳是一分钟一次，稍等一下，或者点**保存并立刻推送**。

</details>

<details>
<summary>我点「设置组合」没反应。</summary>

那个按钮是往 `dsh-capability-composer` 拥有的设置页里跳。那个插件没装时，启动器**拒绝跳转**并告诉你原因。两个都装了的时候，这个跳转是**真的去点** DSH 自己的设置导航 —— 启动器不会伪造一条设置路由。

</details>

<details>
<summary>「添加」组和「常用插件」组有什么区别？</summary>

**添加**组管的是文件与文件夹（支持多选与拖拽）。**常用插件**组是在消息里**点名一个插件**，不是附加它的文件。

</details>

<details>
<summary>芯片在重新加载后还在吗？</summary>

芯片是按会话的，活在客户端为那个会话保留的内存里。客户端重载时，那条栏会从会话自己的状态重建，而不是丢掉；但芯片不是持久存储 —— 它是一种输入方式，你一发送它就变成了消息文本。

</details>

<details>
<summary>这个插件会往网上发东西吗？</summary>

不会。桥只绑回环（`127.0.0.1`），标签页数据不离开你的机器，favicon 代理也是通过宿主自己的 web 服务器去取，而不是从页面里取。没有任何遥测。

</details>

<details>
<summary>为什么端口是 43130，不做成可配置的？</summary>

因为两半必须对**同一个**数字达成一致，而其中一半（扩展）本来就已经允许用户改了。把两边都做成可配置，只会让「配错」的路径翻倍，换来一个人人都不需要改的设置项。

</details>

---

## 仓库结构

```
.
├── .github/
│   └── workflows/ci.yml         在 Linux / macOS / Windows 上做验证
├── extension/                   浏览器扩展（可选）
│   ├── _locales/en/messages.json
│   ├── _locales/zh_CN/messages.json
│   ├── background.js            采集、推送、心跳
│   ├── manifest.json
│   ├── popup.html
│   └── popup.js
├── lib/
│   ├── client.js                菜单、芯片、设置卡片、多语言
│   └── index.js                 路由、桥、联动探测、favicon 代理
├── screenshots/
├── cordis.patch.yml             插件如何被插入 profile
├── bridge-selfcheck.mjs         跨进程验证桥
├── dsh-paths.mjs                自适应解析 DSH 的主目录与 app 根
├── install-extension.ps1        放置扩展、找已装浏览器
├── install.mjs                  部署（被 install.ps1 调用）
├── install.ps1                  反引号闸门 → 部署 → 复核
├── register.mjs                 开发期用到的注册表辅助
├── strip-backticks.mjs          客户端 bundle 闸门
├── verify.mjs                   布局 / 清单 / 语法 / 密钥检查
├── vault-*.mjs                  本机补丁库的开发辅助脚本
├── package.json
├── README.md                    English
└── README.zh-CN.md              简体中文（本文件）
```

`vault-*.mjs` 与 `register.mjs` 是作者本机的开发工具。除非你手工运行，它们是惰性的，也不属于被部署的那一份。

---

## 自检

在一个干净的检出上可以跑两项检查，都是离线、且除非注明否则只读：

```bash
node verify.mjs
```

布局（清单里 `dsh.bundle.patch` 指向的文件真的存在）、清单字段、对每个源文件做 `node --check`、扫描密钥与残留备份文件、以及硬编码机器路径扫描。它打印 `VERIFY PASSED` 或 `VERIFY FAILED`，失败时退出码非零。

```bash
node bridge-selfcheck.mjs
```

它会**真的起两个 Node 进程**，证明桥在跨进程时的行为 —— 包括第二个实例会主动让位而不是抢端口。**请在 `install.ps1` 之后跑**，因为它需要已部署的插件。

---

## License

MIT —— 见 [LICENSE](LICENSE)。
