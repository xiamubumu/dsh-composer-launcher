/**
 * dsh-composer-launcher — Web (browser) half.
 *
 * Hand-written in the loader wrapper DSH expects for client bundles:
 * window.__ModuleLoader__.load({ id, factory: (require) => module.exports }).
 * "require" resolves against the shared client module registry, so react and
 * react-dom come from the host rather than being bundled.
 *
 * Three registrations, all through documented slots:
 *   1. conversation.input.left      -> the "+" launcher button
 *   2. conversation.input.dock      -> the picked-items rail, floating directly
 *                                      above the composer card
 *   3. settings.plugin.item         -> the launcher settings card under
 *                                      Settings -> Plugins
 *   4. conversation.input.overlay   -> the drag-to-resize handle (ResizeHandle)
 *                                      in the card's own overlay anchor
 *
 * Behaviour note: a pick is mirrored into the draft as a compact marker line
 * AND shown as a removable chip on the rail. The rail is the interface the
 * user asked for; the draft line is what actually reaches the model, because
 * the composer exposes no submit hook a plugin can extend.
 *
 * House rule: no backticks anywhere in this file.
 */
window.__ModuleLoader__.load({
  id: 'dsh-composer-launcher',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const react = require('react');
    const reactDom = require('react-dom');
    const h = react.createElement;

    const NS = 'composer-launcher';
    const STYLE_ID = 'dsh-composer-launcher/style';
    const ROUTE = '/composer-launcher';

    /* ------------------------------------------------------------------ *
     * Copy
     * ------------------------------------------------------------------ */
    const ZH = {
      'button.title': '添加',
      'group.add': '添加',
      'group.capability': '能力',
      'group.plugins': '常用插件',
      'web.title': '标签页',
      'web.more': '还有 {n} 个标签页',
      'web.hoverHint': '悬停查看全部 {n} 个标签页',
      'web.empty': '没读到标签页',
      'web.emptyHint': '点上面的按钮装一次 DSH Tab Bridge 扩展，就能读到你真实浏览器里的标签页',
      'web.hint': '读自浏览器扩展「DSH Tab Bridge」，看到的是你真实浏览器里的标签页',
      'web.state.extension': '扩展已连接 · {n} 个标签页',
      'web.state.cdp': '扩展未连，走调试端口 {port} · {n} 个标签页',
      'web.state.none': '两条路都没通：扩展没装，调试端口 {port} 也没开',
      /* B2 — 「浏览器」 is the tab list, so there is deliberately NO copy here
         that offers a debug browser as the entry. The launch action moved to
         设置 → 启动器, where a maintenance action belongs. */
      'web.retry': '重试',
      'web.debugGo': '拉起调试浏览器',
      /* 装扩展这一步只能用户自己点（Chromium 不允许静默侧载），所以这里给的是
         可照做的步骤。浏览器名、扩展页 URL、staged 目录都来自宿主，措辞来自本表
         —— 宿主的 howTo 是中文的，只给日志看。 */
      'web.installHow': '在 {browser} 里：打开 {url} → 打开「开发者模式」→ 点「加载解压缩的扩展」→ 选 {dir}',
      'web.installHowFf': '在 {browser} 里：打开 {url} → 点「临时载入附加组件」→ 选 {file}（Firefox 重启后失效，要重新载入）',
      'web.installMore': '本机还装了：{list}',
      'web.installManual': '没探测到已安装的浏览器。手工装：打开浏览器的扩展管理页 → 加载解压缩的扩展 → 选 {dir}',
      'web.loading': '读取标签页…',
      'files.title': '文件与文件夹',
      /* #6 / #9 — one click, no second level. Windows cannot offer a folder
         picker next to a file picker (Electron only allows BOTH properties on
         macOS), and Codex's own "Files and folders" label is silently half-dead
         there, so this label says exactly what it does: pick files. Folders go
         through the Host's own @ reference or a drag-and-drop. */
      'files.desc': '点一下选文件或文件夹；文件支持多选，也可以拖进来',
      'files.pick': '选择文件',
      /* R41 — ONE click must offer both halves. Windows cannot put openFile and
         openDirectory in a single OS dialog (only macOS can) and the Host's
         in-app browser only lists directories, so the click opens OUR two-row
         chooser instead; the side 「文件夹」 button is gone. */
      'files.pickTitle': '文件与文件夹',
      'files.pickFileHint': '可以多选，作为附件发送',
      'files.pickFolderHint': '把整个目录作为引用',
      'files.dir': '引用路径（@）',
      'files.dirBtn': '文件夹',
      'files.noHostPicker': '宿主没有文件夹选择器（remote.directoryPicker 不可用），已改用 @ 引用',
      'files.chat': '对话',
      'files.chatHint': '引用一段历史对话（只列对话，不含文件与文件夹）',
      'chat.loading': '读取对话列表…',
      'chat.retry': '重试',
      'chat.empty': '没有可引用的对话',
      'chat.unavailable': '宿主没有提供对话候选（remote.sessionReferenceResolver 不可用）',
      /* 按工作区分组。宿主返回的是**全部工作区**的候选（同工作区优先
         排序、上限 500），平铺 180+ 行根本没法扫 —— 而且原先被宿主默认的 50 上限
         截断过，表现得像"只显示当前工作区"。 */
      'chat.current': '当前工作区',
      'chat.noWorkspace': '未记录工作区',
      'search.chats': '筛选对话…',
      'files.dirHint': '用 DSH 原生的 @ 引用，支持整个文件夹',
      'files.dirAria': '打开 @ 引用菜单',
      'files.missing': '没找到宿主的文件选择器',
      'files.noScope': '拿不到会话作用域，打不开 @ 引用',
      'files.noMention': '这个路径的写法不在 @ 引用语法里（含引号或控制字符），没有写入输入框',
      'resize.aria': '拖动调整输入框高度',
      'resize.title': '上下拖动调整输入框高度（双击复位）',
      'plan.title': '计划',
      'plan.desc': '开启计划模式',
      /* R34 — the row must say which state it is IN, not only what clicking
         does: 计划 and 目标 were two independently-armable rows with no visible
         answer to "which one owns my next message?". */
      'plan.on': '计划模式已开启 · 再点关闭',
      /* R35 — 计划模式 is HOST state that is ALREADY IN FORCE, not a pending
         action. The strip used to say "下一条消息：进入计划模式" while the Host's
         own Plan chip was on screen, which reads as "the plugin did not notice I
         am already in plan mode". The copy is picked from the projection's real
         { active, pending } now. */
      /* R54/R55/R56 — THE STRIP IS GONE, AND 目标 IS A CHIP.
         R54 removed the "already on" mirror (the Host's own chip says that),
         R55 the pending one (the Host chip covers that window too), and R56
         moves the last remaining mode — the LOCAL 目标 arming — into a chip that
         wears the Host Plan chip's own geometry, rendered in the SAME modes row
         beside 完全权限. The two modes are exclusive, so they share one seat, and
         nothing of ours is a full-width bar that could read as a leftover after
         a send. */
      'mode.goalChip': '目标',
      'mode.goalChipAria': '目标模式已武装：下一条消息设为目标，点击取消',
      'mode.goalChipTip': '下一条消息：设为目标 — 点击取消',
      'goal.title': '目标',
      /* G3 / R56 — a failed goal write must be readable somewhere. */
      'goal.failed': '目标设置失败：',
      'goal.desc': '设置要持续追求的目标',
      'goal.descArmed': '目标模式已武装 · 下一条消息设为目标（再点取消）',
      /* R36 — the mutual exclusion is enforced WITHOUT sending a command, so a
         refusal has to say why and what to do instead. */
      'goal.planOn': '计划模式正开着（两者互斥）——请先在「计划」行关闭它，再设目标',
      'goal.active': '进行中：{text}',
      'goal.on': '已开启',
      'goal.off': '未开启',
      'cmd.title': '指令',
      'cmd.desc': '原生斜杠命令，选中直接执行',
      'cmd.sub': '指令',
      'cmd.loading': '读取指令列表…',
      'cmd.empty': '没有可用指令',
      'cmd.error': '指令列表读取失败',
      'cmd.native': '打开原生指令面板',
      'cmd.count': '共 {n} 条指令；这里与宿主下发的列表逐条一致，未列出的请用原生面板',
      'skill.title': '技能',
      'skill.desc': '按来源分组，选中填入 /技能名',
      'skill.loading': '读取中…',
      'skill.empty': '无可用技能',
      'skill.noSession': '读技能需要会话上下文，当前拿不到会话标识。',
      'skill.error': '技能列表读取失败。',
      'mcp.title': 'MCP',
      'mcp.desc': '{n} 个服务器',
      'mcp.descLoading': '读取服务器…',
      'mcp.loading': '读取 MCP 服务器…',
      'mcp.error': 'MCP 列表读取失败',
      'mcp.empty': '无 MCP 服务器',
      'mcp.emptyHint': '在设置 → MCP 里添加服务器后，这里会自动出现',
      'mcp.workspace': '当前工作区',
      'mcp.workspaceNone': '未选择工作区',
      'mcp.global': '全局 MCP',
      'mcp.legend': '开关 = 全局启停 · 眼睛 = 在本工作区是否可见',
      'mcp.visible': '在本工作区可见，点击屏蔽',
      'mcp.excluded': '已在本工作区屏蔽，点击恢复',
      'mcp.eyeNoWorkspace': '先选择一个工作区，这个眼睛才会生效',
      'mcp.eyeNotPersisted': '{name}：宿主的本工作区可见性没有按预期写入（回读不一致）',
      'mcp.enable': '启用（写入 profile patch）',
      'mcp.disable': '停用（写入 profile patch）',
      'mcp.footnote': '当前工作区：{ws} · 屏蔽改动对新建会话生效',
      'mcp.noWorkspace': '（未选择）',
      'mcp.tools': '{n} 个工具',
      'mcp.pickTitle': '点击引用这个服务器（提交时并入 【MCP】名字）',
      'mcp.toolsBtn': '工具',
      'mcp.toolsTitle': '展开这个服务器暴露的工具',
      'mcp.noTools': '这个服务器没有暴露工具',
      'mcp.reconnect': '重连',
      'mcp.reconnectTitle': '重新连接这个服务器',
      'mcp.reconnecting': '重连中',
      'mcp.reconnectTitleBusy': '正在重新连接…',
      'mcp.reconnected': '已重连 ✓',
      'mcp.reconnectFail': '重连失败',
      'mcp.reconnectFailTitle': '上次重连失败，点击再试一次',
      'mcp.sync': '刷新',
      'mcp.syncHint': '立即重新读取；MCP 面板那边改了这里也会自动跟上',
      'plugins.title': '全部插件',
      'plugins.desc': '按用途分类浏览',
      'plugins.descN': '共 {n} 个已装插件',
      /* 收窄时**两个数都写**。以前无论有没有被组合收窄都写
         「共 {n} 个已装插件」，而 n 是收窄后的条数 ⇒ 读起来像"机器上只装了这么多"
         （原话：「不止14个吧」）。 */
      'plugins.descScoped': '按组合收窄 {n} / 共 {total} 个已装插件',
      'plugins.loading': '读取插件清单…',
      'plugins.empty': '没有可用的插件',
      'plugins.error': '插件清单读取失败（远程服务不可用）',
      'plugins.retry': '重试',
      'plugins.gear': '自定义',
      /* 与「插件组合器」联动：列表按当前生效的组合收窄，右上角能跳过去改。 */
      'scope.all': '组合：不过滤（全部 {n} 个都可见）',
      'scope.none': '组合：全不选（一个都不显示）—— 去右上角设置里改',
      'scope.plugins': '按组合「{names}」收窄：{n} / 共 {total} 个插件',
      'scope.skills': '按组合「{names}」收窄：{n} 个技能',
      'scope.unknown': '读不到组合器（插件组合由 dsh-capability-composer 提供）；下面列的是全部。',
      'scope.outside': '常驻但不在当前组合里',
      'jump.plugins.short': '设置组合',
      'jump.plugins': '跳到「设置 → 插件 → 插件组合」去改插件组合',
      'jump.skill.short': '设置组合',
      'jump.skill': '跳到「设置 → 技能 → 组合技能」去改技能组合',
      'search.plugins': '筛选插件…',
      'search.skills': '筛选名称或描述…',
      'search.commands': '筛选指令…',
      'search.web': '筛选标签页…',
      'back': '返回',
      'settings.title': '启动器',
      'settings.subtitle': 'composer 的「+」菜单：显示什么、显示几个、按什么规则挑。',
      'settings.section.add': '添加',
      'settings.section.cap': '能力',
      'settings.section.plug': '常用插件',
      'settings.showWeb': '标签页',
      'settings.showWeb.hint': '读本机调试浏览器的标签页',
      'settings.webCount': '默认显示条数',
      'settings.webCount.hint': '超出的收进「还有 N 个」',
      'settings.port': '浏览器调试端口',
      'settings.port.hint': 'CDP 端口；读的是这个端口上的浏览器标签页',
      'settings.debugBrowser': '调试浏览器',
      'settings.debugBrowser.hint': '扩展没装时的备用读法；会在本机 {port} 端口开一个独立浏览器',
      'settings.debugBrowser.go': '拉起调试浏览器',
      'settings.showFiles': '选择文件',
      'settings.showFiles.hint': '文件用系统选择器；文件夹可用 @ 引用或直接拖进来',
      'settings.showPlan': '计划',
      'settings.showPlan.hint': '开启计划模式',
      'settings.showGoal': '目标',
      'settings.showGoal.hint': '设置要持续追求的目标',
      'settings.showCmd': '指令',
      'settings.showCmd.hint': '原生斜杠命令，选中直接执行',
      'settings.showSkill': '技能',
      'settings.showSkill.hint': '技能列表，选中填入 /技能名',
      'settings.showMcp': 'MCP',
      'settings.showMcp.hint': '服务器开关与工具',
      'settings.pluginMode': '挑选规则',
      'settings.pluginMode.hint': '固定 = 只显示钉住的；高频 = 按用量自动排；混合 = 钉住的在前，其余按高频补满',
      'settings.mode.pinned': '固定',
      'settings.mode.frequent': '高频',
      'settings.mode.mixed': '混合',
      'settings.pluginCount': '显示条数',
      'settings.pluginCount.hint': '默认 5',
      'settings.pinned': '常驻插件',
      'settings.pinned.hint': '绿点 = 常驻（一直显示）；蓝点 = 按用量补位',
      /* R61 — the picker reports its own states instead of silently doing nothing. */
      'settings.pinned.loading': '正在读取插件列表…',
      'settings.pinned.empty': '宿主机没有报告任何插件',
      'settings.pinned.add': '+ 添加插件',
      'settings.pinned.none': '还没有常驻插件',
      'settings.pinned.missing': '未安装',
      /* 选择器加了筛选框：40+ 个插件里"找不到 = 加不了"，
         而且必须说清楚这里只列**已装**的插件（市场里没装的不会出现）。 */
      'settings.pinned.search': '筛选插件…',
      'settings.pinned.count': '显示 {n} / {total} 个已装插件',
      'settings.pinned.nomatch': '没有名字匹配的插件。若它还没装，先去「插件市场」装上再来这里常驻。',
      'settings.pinned.installedOnly': '这里只列这台机器上**已安装**的插件；市场里还没装的不会出现。点一下加常驻，再点一下取消。',
      'settings.pinned.failed': '插件清单读取失败（远程服务不通），不是"没有插件"。',
      'settings.pinned.retry': '重试',
      /* 选择器补：筛选片 + 每个插件的工具数/大概 token（认得出 + 知道代价）。 */
      'settings.pinned.filterAll': '全部',
      'settings.pinned.filterOn': '只看启用',
      'settings.pinned.filterPinned': '只看常驻',
      'settings.pinned.tools': '{n} 个工具',
      'settings.pinned.noTools': '0 个工具（纯界面插件）',
      'settings.pinned.tokens': '≈{n} tokens',
      'settings.pinned.disabled': '未启用',
      'settings.pinned.uiOnly': '体验插件',
      'plugins.fromCache': '显示的是缓存的插件清单（正在后台刷新…）',
      'settings.reset': '恢复默认',
      'settings.source': '插件清单每次从 Host 实时读，装 / 卸 / 停用后自动跟着变，不用手工维护。',
      'conflict.plan': '计划模式与目标不能同时开，已自动关掉目标',
      'conflict.goal': '目标与计划模式不能同时开，已自动关掉计划模式',
      'chip.plan': '计划模式',
      'chip.goal': '目标模式',
      'chip.web': '网页',
      'chip.plugin': '用 {name} 插件',
      'chip.skill': '{name}',
      'chip.mcp': 'MCP {name}',
      'chip.pick': '选择目标：',
      /* R11 — shown whenever a send gesture arrives with chips armed and the
         interceptor refuses it, so the failure can never be silent again. */
      'exec.declined': '这一条没能带上你的选择就发出去了',
      'jump.composer.missing': '未检测到组合器插件 dsh-capability-composer —— 请先安装并启用它，再回来点「设置组合」',
      /* ------------------------------------------------------------------ *
       * Copy that used to be hard-coded Chinese OUTSIDE this table: status
       * dots, goal-mode failures, slash-command failures, MCP phase labels and
       * the banner actions. They are keys now, so switching the interface
       * language repaints them too. The EN table below carries the same keys
       * in the same order.
       * ------------------------------------------------------------------ */
      'status.on': '已启用',
      'status.off': '未启用',
      'status.bad': '异常',
      'mode.on': '已开启',
      'goal.placeholder': '描述你的目标，定义可衡量的成果，以获得最佳效果',
      'goal.noRemote': '宿主没有暴露 remote.goals',
      'goal.createFailed': '创建目标失败',
      'goal.updateFailed': '更新目标失败',
      'goal.resumeFailed': '恢复目标失败',
      'cmd.noSession': '没有会话上下文，命令发不出去',
      'cmd.noResponse': '命令服务没有响应',
      'cmd.execFailed': '执行失败',
      'cmd.unknown': '未知命令：{line}',
      'cmd.noButton': '没找到宿主的指令按钮',
      'mcp.noService': 'MCP 管理服务未连接（先启用 dsh-mcp-manager-ui）',
      'mcp.callFailed': '调用失败',
      'mcp.phase.connecting': '连接中…',
      'mcp.phase.connectingFailed': '连接失败',
      'mcp.phase.starting': '启动中…',
      'mcp.phase.startingFailed': '启动失败',
      'mcp.phase.registering': '注册工具中…',
      'mcp.phase.syncing': '同步中…',
      'mcp.phase.reconnecting': '重连中…',
      'mcp.phase.restarting': '重启中…',
      'mcp.phase.stopping': '停止中…',
      'mcp.phase.initializing': '初始化中…',
      'mcp.phase.pending': '等待中…',
      'mcp.phase.disabled': '已停用',
      'mcp.phase.stopped': '已停止',
      'mcp.phase.error': '连接失败',
      'mcp.phase.failed': '连接失败',
      'mcp.phase.disconnected': '已断开',
      'mcp.conflictReadOnly': '重名冲突（只读）',
      'exec.submitFailed': '提交失败，已还原输入框',
      'exec.enterDeclined': 'Enter 被拒绝',
      'exec.sendDeclined': '发送按钮被拒绝',
      'settings.collapseAria': '收起：',
      'settings.expandAria': '展开：',
      'common.close': '关闭'
    };

    /* English table. Same key set as ZH above: the missing-key chain is
       active -> en, so 'en' is the chain terminator and has to be shipped. */
    const EN = {
      'button.title': 'Add',
      'group.add': 'Add',
      'group.capability': 'Capabilities',
      'group.plugins': 'Common plugins',
      'web.title': 'Tabs',
      'web.more': '{n} more tabs',
      'web.hoverHint': 'Hover to see all {n} tabs',
      'web.empty': 'No tabs read',
      'web.emptyHint': 'Install the DSH Tab Bridge extension from the button above to read tabs from your real browser',
      'web.hint': 'Read through the DSH Tab Bridge browser extension — these are the tabs in your real browser',
      'web.state.extension': 'Extension connected · {n} tabs',
      'web.state.cdp': 'Extension offline, using debug port {port} · {n} tabs',
      'web.state.none': 'Neither path works: the extension is not installed and debug port {port} is closed',
      'web.retry': 'Retry',
      'web.debugGo': 'Launch debug browser',
      'web.installHow': 'In {browser}: open {url} → turn on Developer mode → Load unpacked → pick {dir}',
      'web.installHowFf': 'In {browser}: open {url} → Load Temporary Add-on → pick {file} (Firefox drops it on restart, so load it again)',
      'web.installMore': 'Also installed here: {list}',
      'web.installManual': 'No installed browser was detected. Load it by hand: open your browser extensions page → Load unpacked → pick {dir}',
      'web.loading': 'Reading tabs…',
      'files.title': 'Files and folders',
      'files.desc': 'Click to pick a file or folder; files support multi-select, and you can also drag them in',
      'files.pick': 'Pick file',
      'files.pickTitle': 'Files and folders',
      'files.pickFileHint': 'Multi-select is supported; sent as an attachment',
      'files.pickFolderHint': 'Reference the whole directory',
      'files.dir': 'Reference a path (@)',
      'files.dirBtn': 'Folder',
      'files.noHostPicker': 'The host has no folder picker (remote.directoryPicker unavailable); falling back to @ references',
      'files.chat': 'Chats',
      'files.chatHint': 'Reference an earlier chat (chats only — no files or folders)',
      'chat.loading': 'Reading chats…',
      'chat.retry': 'Retry',
      'chat.empty': 'No chats to reference',
      'chat.unavailable': 'The host exposes no chat candidates (remote.sessionReferenceResolver unavailable)',
      'chat.current': 'Current workspace',
      'chat.noWorkspace': 'No workspace recorded',
      'search.chats': 'Filter chats…',
      'files.dirHint': 'Uses the native DSH @ reference, whole folders included',
      'files.dirAria': 'Open the @ reference menu',
      'files.missing': 'Host file picker not found',
      'files.noScope': 'No session scope, so the @ reference cannot be opened',
      'files.noMention': 'This path cannot be written as an @ reference (it contains a quote or a control character), so nothing was inserted',
      'resize.aria': 'Drag to resize the input box',
      'resize.title': 'Drag up or down to resize the input box (double-click to reset)',
      'plan.title': 'Plan',
      'plan.desc': 'Turn on plan mode',
      'plan.on': 'Plan mode on · click to turn off',
      'mode.goalChip': 'Goal',
      'mode.goalChipAria': 'Goal mode armed: the next message sets a goal, click to cancel',
      'mode.goalChipTip': 'Next message: set as goal — click to cancel',
      'goal.title': 'Goal',
      'goal.failed': 'Setting the goal failed: ',
      'goal.desc': 'Set a goal to keep pursuing',
      'goal.descArmed': 'Goal mode armed · the next message sets a goal (click again to cancel)',
      'goal.planOn': 'Plan mode is on (the two are mutually exclusive) — turn it off in the Plan row first, then set a goal',
      'goal.active': 'Active: {text}',
      'goal.on': 'On',
      'goal.off': 'Off',
      'cmd.title': 'Commands',
      'cmd.desc': 'Native slash commands; selecting one runs it',
      'cmd.sub': 'Commands',
      'cmd.loading': 'Reading commands…',
      'cmd.empty': 'No commands available',
      'cmd.error': 'Could not read the command list',
      'cmd.native': 'Open the native command palette',
      'cmd.count': '{n} commands; this list matches what the host sends item by item, use the native palette for anything missing',
      'skill.title': 'Skills',
      'skill.desc': 'Grouped by source; selecting one inserts /skill-name',
      'skill.loading': 'Reading…',
      'skill.empty': 'No skills available',
      'skill.noSession': 'Reading skills needs a session context, and no session id is available here.',
      'skill.error': 'Could not read the skill list.',
      'mcp.title': 'MCP',
      'mcp.desc': '{n} servers',
      'mcp.descLoading': 'Reading servers…',
      'mcp.loading': 'Reading MCP servers…',
      'mcp.error': 'Could not read the MCP list',
      'mcp.empty': 'No MCP servers',
      'mcp.emptyHint': 'Add a server under Settings → MCP and it shows up here',
      'mcp.workspace': 'Current workspace',
      'mcp.workspaceNone': 'No workspace selected',
      'mcp.global': 'Global MCP',
      'mcp.legend': 'Switch = enable/disable globally · Eye = visible in this workspace',
      'mcp.visible': 'Visible in this workspace, click to hide',
      'mcp.excluded': 'Hidden in this workspace, click to restore',
      'mcp.eyeNoWorkspace': 'Pick a workspace first; only then does this eye do anything',
      'mcp.eyeNotPersisted': '{name}: the host did not persist this workspace visibility as expected (read-back mismatch)',
      'mcp.enable': 'Enable (writes the profile patch)',
      'mcp.disable': 'Disable (writes the profile patch)',
      'mcp.footnote': 'Current workspace: {ws} · visibility changes apply to new sessions',
      'mcp.noWorkspace': '(none)',
      'mcp.tools': '{n} tools',
      'mcp.pickTitle': 'Click to reference this server (adds 【MCP】name to the message)',
      'mcp.toolsBtn': 'Tools',
      'mcp.toolsTitle': 'Expand the tools this server exposes',
      'mcp.noTools': 'This server exposes no tools',
      'mcp.reconnect': 'Reconnect',
      'mcp.reconnectTitle': 'Reconnect this server',
      'mcp.reconnecting': 'Reconnecting',
      'mcp.reconnectTitleBusy': 'Reconnecting…',
      'mcp.reconnected': 'Reconnected ✓',
      'mcp.reconnectFail': 'Reconnect failed',
      'mcp.reconnectFailTitle': 'The last reconnect failed, click to try again',
      'mcp.sync': 'Refresh',
      'mcp.syncHint': 'Read again right now; changes made in the MCP panel show up here too',
      'plugins.title': 'All plugins',
      'plugins.desc': 'Browse by category',
      'plugins.descN': '{n} plugins installed',
      'plugins.descScoped': 'Narrowed by composition: {n} of {total} plugins installed',
      'plugins.loading': 'Reading the plugin list…',
      'plugins.empty': 'No plugins available',
      'plugins.error': 'Could not read the plugin list (remote service unavailable)',
      'plugins.retry': 'Retry',
      'plugins.gear': 'Customize',
      'scope.all': 'Composition: no filter ({n} visible)',
      'scope.none': 'Composition: nothing selected (nothing is shown) — change it in Settings, top right',
      'scope.plugins': 'Narrowed by composition 「{names}」: {n} of {total} plugins',
      'scope.skills': 'Narrowed by composition 「{names}」: {n} skills',
      'scope.unknown': 'Cannot read the composer (plugin compositions are provided by dsh-capability-composer); everything is listed below.',
      'scope.outside': 'Always on, but outside the current composition',
      'jump.plugins.short': 'Set composition',
      'jump.plugins': 'Open Settings → Plugins → Plugin composition to change it',
      'jump.skill.short': 'Set composition',
      'jump.skill': 'Open Settings → Skills → Skill composition to change it',
      'search.plugins': 'Filter plugins…',
      'search.skills': 'Filter by name or description…',
      'search.commands': 'Filter commands…',
      'search.web': 'Filter tabs…',
      'back': 'Back',
      'settings.title': 'Launcher',
      'settings.subtitle': 'The composer plus menu: what to show, how many, and how they are picked.',
      'settings.section.add': 'Add',
      'settings.section.cap': 'Capabilities',
      'settings.section.plug': 'Common plugins',
      'settings.showWeb': 'Tabs',
      'settings.showWeb.hint': 'Read tabs from the local debug browser',
      'settings.webCount': 'Rows shown by default',
      'settings.webCount.hint': 'The rest go into “N more”',
      'settings.port': 'Browser debug port',
      'settings.port.hint': 'CDP port; tabs are read from the browser on this port',
      'settings.debugBrowser': 'Debug browser',
      'settings.debugBrowser.hint': 'Fallback when the extension is not installed; opens a separate browser on local port {port}',
      'settings.debugBrowser.go': 'Launch debug browser',
      'settings.showFiles': 'Pick files',
      'settings.showFiles.hint': 'Files use the system picker; folders go through an @ reference or a drag-and-drop',
      'settings.showPlan': 'Plan',
      'settings.showPlan.hint': 'Turn on plan mode',
      'settings.showGoal': 'Goal',
      'settings.showGoal.hint': 'Set a goal to keep pursuing',
      'settings.showCmd': 'Commands',
      'settings.showCmd.hint': 'Native slash commands; selecting one runs it',
      'settings.showSkill': 'Skills',
      'settings.showSkill.hint': 'Skill list; selecting one inserts /skill-name',
      'settings.showMcp': 'MCP',
      'settings.showMcp.hint': 'Server switches and tools',
      'settings.pluginMode': 'Selection rule',
      'settings.pluginMode.hint': 'Pinned = pinned only; Frequent = ranked by usage; Mixed = pinned first, the rest filled by usage',
      'settings.mode.pinned': 'Pinned',
      'settings.mode.frequent': 'Frequent',
      'settings.mode.mixed': 'Mixed',
      'settings.pluginCount': 'Rows shown',
      'settings.pluginCount.hint': '5 by default',
      'settings.pinned': 'Always-on plugins',
      'settings.pinned.hint': 'Green dot = always on (always shown); blue dot = fills a slot by usage',
      'settings.pinned.loading': 'Reading the plugin list…',
      'settings.pinned.empty': 'The host reported no plugins',
      'settings.pinned.add': '+ Add plugin',
      'settings.pinned.none': 'No always-on plugins yet',
      'settings.pinned.missing': 'Not installed',
      'settings.pinned.search': 'Filter plugins…',
      'settings.pinned.count': 'Showing {n} of {total} installed plugins',
      'settings.pinned.nomatch': 'No plugin matches that name. If it is not installed yet, install it from the plugin marketplace first and come back.',
      'settings.pinned.installedOnly': 'This only lists plugins **installed** on this machine; anything not installed from the marketplace will not appear. Click once to pin it, click again to unpin.',
      'settings.pinned.failed': 'Could not read the plugin list (remote service unreachable) — this is not "no plugins".',
      'settings.pinned.retry': 'Retry',
      'settings.pinned.filterAll': 'All',
      'settings.pinned.filterOn': 'Enabled only',
      'settings.pinned.filterPinned': 'Always-on only',
      'settings.pinned.tools': '{n} tools',
      'settings.pinned.noTools': '0 tools (UI-only plugin)',
      'settings.pinned.tokens': '≈{n} tokens',
      'settings.pinned.disabled': 'Disabled',
      'settings.pinned.uiOnly': 'Experience plugin',
      'plugins.fromCache': 'Showing a cached plugin list (refreshing in the background…)',
      'settings.reset': 'Reset to defaults',
      'settings.source': 'The plugin list is read live from the host on every load, so installs, removals and disables follow automatically with nothing to maintain by hand.',
      'conflict.plan': 'Plan mode and Goal cannot both be on; Goal was turned off',
      'conflict.goal': 'Goal and Plan mode cannot both be on; Plan mode was turned off',
      'chip.plan': 'Plan mode',
      'chip.goal': 'Goal mode',
      'chip.web': 'Web',
      'chip.plugin': 'Use the {name} plugin',
      'chip.skill': '{name}',
      'chip.mcp': 'MCP {name}',
      'chip.pick': 'Pick a target: ',
      'exec.declined': 'That message went out without your selection',
      'jump.composer.missing': 'Composer plugin dsh-capability-composer not detected — install and enable it, then come back and click Set composition',
      /* The same 39 rows as the ZH table above, in the same order. */
      'status.on': 'Enabled',
      'status.off': 'Disabled',
      'status.bad': 'Error',
      'mode.on': 'On',
      'goal.placeholder': 'Describe your goal, define measurable outcomes, and get the best results',
      'goal.noRemote': 'The host does not expose remote.goals',
      'goal.createFailed': 'Could not create the goal',
      'goal.updateFailed': 'Could not update the goal',
      'goal.resumeFailed': 'Could not resume the goal',
      'cmd.noSession': 'No session context — the command cannot be sent',
      'cmd.noResponse': 'The command service did not respond',
      'cmd.execFailed': 'Command failed',
      'cmd.unknown': 'Unknown command: {line}',
      'cmd.noButton': 'Could not find the command button in the host UI',
      'mcp.noService': 'The MCP management service is not connected (enable dsh-mcp-manager-ui first)',
      'mcp.callFailed': 'The call failed',
      'mcp.phase.connecting': 'Connecting…',
      'mcp.phase.connectingFailed': 'Connection failed',
      'mcp.phase.starting': 'Starting…',
      'mcp.phase.startingFailed': 'Could not start',
      'mcp.phase.registering': 'Registering tools…',
      'mcp.phase.syncing': 'Syncing…',
      'mcp.phase.reconnecting': 'Reconnecting…',
      'mcp.phase.restarting': 'Restarting…',
      'mcp.phase.stopping': 'Stopping…',
      'mcp.phase.initializing': 'Initializing…',
      'mcp.phase.pending': 'Waiting…',
      'mcp.phase.disabled': 'Disabled',
      'mcp.phase.stopped': 'Stopped',
      'mcp.phase.error': 'Connection failed',
      'mcp.phase.failed': 'Connection failed',
      'mcp.phase.disconnected': 'Disconnected',
      'mcp.conflictReadOnly': 'Name conflict (read-only)',
      'exec.submitFailed': 'Submit failed; your text was restored',
      'exec.enterDeclined': 'Enter was refused',
      'exec.sendDeclined': 'the send button was refused',
      'settings.collapseAria': 'Collapse: ',
      'settings.expandAria': 'Expand: ',
      'common.close': 'Close'
    };

    /* ------------------------------------------------------------------ *
     * Defaults
     * ------------------------------------------------------------------ */
    const DEFAULTS = {
      showWeb: true,
      showFiles: true,
      showPlan: true,
      showGoal: true,
      showCmd: true,
      showSkill: true,
      showMcp: true,
      webCount: 3,
      pluginCount: 5,
      /**
       * 挑选规则默认值仍是 「mixed」（钉住的 + 按用量补满）。
       *
       * 「那两个常用插件我都已经删掉了，然后我重启之后又出现了，
       * 说明是预设，可以把这个预设去掉，没必要。」
       * 查清后的真根因**不是 DEFAULTS**（「pinned」 本来就是空的），而是：
       *   「混合 / 高频」两种规则**按用量补满**，而**删 chip 只删了 pinned、没删用量记录**
       *   ⇒ 下次照旧把高频那两名补回来。
       * 所以修的是删除路径（dropFrequency，见下）与那两条历史记录，
       * **不是**把模式默认改成 「pinned」 —— 那会让「+」菜单的插件组直接空掉
       * （harness 实测 FAIL：plugin row present in menu）。
       * 想要"一个自动的都不出现"，在设置里点「固定」即可。
       */
      pluginMode: 'mixed',
      port: 9222,
      /* 「常驻插件」默认**空**。
       *
       * 「恢复默认会有两个常驻的，但是新电脑可能没有这两个插件，
       * 所以常驻的默认是没有恢复默认，那就是没有」。写死名字（原来的
       * ['dsh-pilot','codegraph']）在没装这两个插件的机器上只会留下两条永远不生效的
       * 常驻项 —— 名单本来就该由使用者自行固定，默认不代为决定。 */
      pinned: []
    };

    /* ------------------------------------------------------------------ *
     * Styles (concatenated — no template literals, house rule)
     * ------------------------------------------------------------------ */
    const CSS = [
      '.dcl-btn{width:28px;height:28px;border-radius:999px;background:var(--dsw-specific-selector);',
      'color:var(--dsw-alias-label-primary);display:grid;place-items:center;border:0;flex:none;',
      'cursor:pointer;transition:background-color .13s ease-out,transform .13s cubic-bezier(.32,.72,0,1)}',
      '.dcl-btn:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}',
      '.dcl-btn:active{transform:scale(.94)}',
      '.dcl-btn[data-open="1"]{background:var(--dsw-alias-button-info-fill);color:var(--dsw-alias-label-primary-foreground,#fff)}',

      '.dcl-menu{position:absolute;z-index:120;width:100%;box-sizing:border-box;',
      /**
       * 「换了颜色就这样的，应该随着颜色一起换」——深色主题下这个菜单
       * 还是浅色面板。根因：菜单底色的内联样式取自 composer 卡片实测到的颜色，
       * 内联样式压过 CSS，所以换主题它不跟。这里用 !important 把底色钉回主题令牌
       * （特定菜单色，回退到层 3）。
       * 注意：本注释**不许出现花括号** —— harness 对 .dcl-menu 的 max-height 兜底
       * 断言用跨字符串的正则找，一个花括号就把匹配截断（刚踩过）。
       */
      'background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-3))!important;border-radius:20px;padding:4px;',
      'height:360px;max-height:calc(100vh - 16px);display:flex;flex-direction:column;overflow:hidden;',
      'box-shadow:var(--dsw-elevation-prominent);',
      'animation:dclMenuIn .18s cubic-bezier(.32,.72,0,1)}',
      '@keyframes dclMenuIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}',
      /* #19 — the scroll indicator lives on the LEFT. A native scrollbar cannot
         be moved reliably (Electron overlay bars ignore direction tricks), so
         the native bar is hidden and a self-drawn 3px rail + thumb carries the
         position. That also removes the reason scrollbar-gutter:stable existed:
         with no native bar there is no width to appear and disappear, so the
         jitter it guarded against cannot happen. The thumb is 70% white — the
         old 35%("18%"-era complaint) was invisible, which is exactly the
         report. It is driven by a scroll listener (see MenuPortal). */
      '.dcl-scrollwrap{position:relative;flex:1;min-height:0;display:flex;flex-direction:column}',
      '.dcl-scroll{display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;',
      'padding:0 2px 10px 0;scrollbar-width:none}',
      '.dcl-scroll::-webkit-scrollbar{width:0;height:0}',
      /* R2 — no track, and the moving part fades out at BOTH ends so it reads as
         a gradient instead of a bar: "它底下有灰色的轨道，我不需要，并且滑动的条
         两端应该是渐变的效果，这样感觉更高级…颜色要深一点". */
      '.dcl-scrollbar-l{position:absolute;left:0;top:4px;bottom:8px;width:4px;',
      '--dcl-scroll-fg:var(--dsw-alias-label-caption);',
      'pointer-events:none;z-index:12;opacity:0;background:0 0;',
      'transition:opacity .18s cubic-bezier(.23,1,.32,1)}',
      '.dcl-scrollbar-l.is-active{opacity:1}',
      '.dcl-scrollbar-thumb{display:block;width:100%;min-height:24px;border-radius:999px;',
      'corner-shape:round;',
      'background:linear-gradient(180deg,transparent 0,var(--dcl-scroll-fg) 26%,',
      'var(--dcl-scroll-fg) 74%,transparent 100%);',
      'transition:transform .12s cubic-bezier(.23,1,.32,1)}',
      /* 空闲滚动条：也别写死 #ffffff80（深色下是一条亮白条）。跟着 theme 的
         caption 色走，和活动态用的是同一个 --dcl-scroll-fg。 */
      '.dcl-scrollbar-thumb.dcl-idle{background:var(--dcl-scroll-fg)}',

      '.dcl-sec{display:flex;align-items:center;min-height:26px;flex:none;padding:6px 10px 2px;',
      'font-size:12px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.dcl-sec+.dcl-sec,.dcl-sec:not(:first-child){margin-top:4px}',
      '.dcl-sec-end{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-caption)}',

      /* #3 — the tab row stays short; hovering it floats the full list out from
         ABOVE. The panel is PORTALLED to <body> and positioned fixed (see
         WebTabGroup): living inside the menu meant two clipping ancestors
         (.dcl-scroll overflow-y:auto and .dcl-menu overflow:hidden) cut it off
         whenever the menu was short — the first version relied on that clipping
         as if it were a feature. left/width/bottom come from the anchor's rect;
         the max-height below is what keeps a long list inside the viewport. */
      '.dcl-webbox{display:flex;flex-direction:column;gap:2px}',
      /* box-sizing is LOAD-BEARING here, not tidiness: the geometry's cap is
         the panel's OUTER height, so under the default content-box the 6px
         padding pushed the real box 12px past the cap and, in the tight-space
         case (anchor top=112 -> cap=100, budget 100), the panel overflowed the
         VIEWPORT'S TOP EDGE by 4px. A real-Chromium probe caught it. With
         border-box the cap and the box agree, which is what hoverPanelBox()
         assumes — same reason .dcl-menu and .dcl-searchbox declare it. */
      '.dcl-webhov{box-sizing:border-box;z-index:130;display:flex;flex-direction:column;gap:2px;padding:6px;',
      'border-radius:14px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-3));',
      'border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);',
      'max-height:min(45vh,320px);overflow-y:auto;',
      'animation:dclHoverIn .16s cubic-bezier(.32,.72,0,1)}',
      '@keyframes dclHoverIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
      '@media (prefers-reduced-motion: reduce){.dcl-webhov{animation:none}}',

      /* #21 — the drag handle sits on the composer card's top edge (the slot's
         overlay anchor is a zero-height, position:absolute box there). */
      '.dcl-resize{position:absolute;top:2px;left:50%;transform:translateX(-50%);width:64px;height:10px;',
      'display:flex;align-items:center;justify-content:center;cursor:row-resize;z-index:14;',
      'border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);touch-action:none;',
      'transition:background-color .12s ease}',
      '.dcl-resize:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}',
      '.dcl-resize-grip{width:26px;height:3px;border-radius:2px;',
      'background:var(--dsw-alias-label-caption);transition:background-color .12s ease}',
      '.dcl-resize:hover .dcl-resize-grip{background:var(--dsw-alias-label-secondary)}',

      '.dcl-item{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:8px 10px;',
      'border-radius:10px;color:var(--dsw-alias-label-primary);text-align:left;flex:none;border:0;',
      'background:transparent;font-family:inherit;font-size:14px;line-height:22px;cursor:pointer;',
      'transition:background-color .13s ease-out,transform .13s cubic-bezier(.32,.72,0,1)}',
      '.dcl-item:hover{background:var(--dsw-alias-interactive-bg-hover);transform:translateX(2px)}',
      '.dcl-item:active{transform:translateX(2px) scale(.995)}',
      '.dcl-ic{width:16px;height:16px;flex:none;color:var(--dsw-alias-label-tertiary);',
      'display:inline-flex;align-items:center;justify-content:center;overflow:hidden;border-radius:3px;position:relative}',
      '.dcl-ic img{width:16px;height:16px;display:block;border-radius:3px}',
      '.dcl-ic svg{width:15px;height:15px}',
      /* R32 — 真图标**加载完成后才露出来**，它下面永远垫着那张中性兜底图标。
         R31 的写法是"img 默认可见、onerror 才换成兜底"，于是**加载期间整行是空的**
         （CDP 实测：三行的 img 全是 complete:false / naturalWidth:0，
         而 .dcl-fb 是 display:none ⇒ 看到的"github 那一行是空白"）。
         现在：兜底图标**默认就可见**（absolute、z-index 0），img 绝对压在它上面、
         初始 opacity 0，onload 才置 data-ok=1 露出来。无论加载中、加载失败还是
         根本没发起请求，那一格都**不会空**。 */
      '.dcl-ic img.dcl-favi{position:relative;z-index:1;opacity:0;transition:opacity .12s ease-out}',
      '.dcl-ic img.dcl-favi[data-ok="1"]{opacity:1}',
      /* 兜底图标必须在真图标加载成功后就地撤掉**。
         收到的反馈「加号插件图标重叠」：截图里那一行正好是全部标签页中**唯一一个真
         favicon 加载成功**的（DeepSeek 开放平台），而 favicon 基本都是**透明背景**的
         PNG/ICO/SVG，于是垫在下面那张地球兜底图标会从透明处透出来 —— 看上去就是
         "两个图标叠在一起"，而旁边两条走兜底的分支画得干干净净。
         判据用 [data-ok="1"]（onload 才置位），加载中/加载失败时兜底照旧可见。 */
      '.dcl-ic img.dcl-favi[data-ok="1"]+.dcl-fb{opacity:0;visibility:hidden}',
      /* ── 自适应图标（B 方案）：浅色主题下把"本身就是白/浅色"的 favicon 压黑 ──
：「白色模式下，像 GitHub 这样的原生白色的图标混在一起
         看不到了」。判据来自**像素**，不是猜：favicon 走本插件同源前缀取回来
         ⇒ 画布不污染 ⇒ 16x16 取像素算 alpha 加权亮度（见 dclIconTone）。
         data-tone 四种值：light / dark / mixed / empty（+ unknown = 判不出来）。

          第二版，删掉一版里的"黑白双描边"兜底：mixed / unknown 曾套
         drop-shadow(0 0 1px …) 两道，结果**彩色图标全变糊**（重启后立刻报
         「有点图标变糊了」，截图里 bing 蓝放大镜 / git-scm 橙菱形边缘一圈灰）。
         原因有二：① 1px 模糊阴影在 16px 图上就是 2px 的灰边；② .dcl-ic 有
         overflow:hidden，阴影被裁成不完整的暗边，比不画更脏。
         现在：只有**真的会看不见**的图标才动（light/dark 才反色，且反色是
         brightness(0) —— 纯像素映射，不会有边缘软化）；彩色图标一个 filter 都不加。 */
      /* 浅色主题 + 浅色图标 ⇒ 压成黑。不用 opacity：亮度一变整体发灰，也是"糊"。 */
      '.dcl-ic img.dcl-favi[data-flip="dark"]{filter:brightness(0) saturate(100%)}',
      /* 暗色主题 + 深色图标 ⇒ 提成白。 */
      '.dcl-ic img.dcl-favi[data-flip="light"]{filter:brightness(0) invert(1)}',
      /* 全透明的 favicon（下下来是一张空图）不是"浅色"，是"什么都没画"：
         真图标让位，把垫在下面的中性兜底图标放回来，那一格不留空。 */
      '.dcl-ic img.dcl-favi[data-tone="empty"]{opacity:0}',
      '.dcl-ic img.dcl-favi[data-tone="empty"]+.dcl-fb{opacity:.55;visibility:visible}',
      /* EVERY inline SVG in the menu needs an explicit size. An SVG with a
         viewBox but no width/height is a replaced element and renders at the
         300x150 default — that single missing rule is what blew the rows out
         ("UI 都超出设计") AND made the breadcrumb arrow invisible. These two
         rules are the fix for both symptoms at once. */
      '.dcl-menu svg{width:16px;height:16px;display:block;flex:none}',
      '.dcl-sep svg,.dcl-dr svg{width:12px;height:12px}',
      /* R31 — 兜底图标**不能有底色**：'--dsw-alias-interactive-bg-hover' 在暗色主题下
         画出来就是一块白色小方块（反复收到的反馈「白色的方块」）。现在只画一个
         currentColor 的通用网页图标，明暗主题都不铺底。 */
      '.dcl-fb{position:absolute;inset:0;z-index:0;display:inline-flex;align-items:center;justify-content:center;',
      'color:inherit;opacity:.55}',
      '.dcl-fb svg{width:15px;height:15px}',
      /* Per-workspace visibility pill (the MCP view's second control). */
      /* R6a — an ICON button. It used to print 可见 / 屏蔽 as text, which is
         exactly why the control existed and the user still reported
         "我没有看到有眼睛". */
      '.dcl-eye{width:24px;height:22px;padding:0;display:inline-flex;align-items:center;',
      'justify-content:center;border-radius:999px;border:1px solid #4ed17e33;',
      'background:#4ed17e1f;color:#4ed17e;cursor:pointer;',
      'transition:background-color .12s ease,color .12s ease,border-color .12s ease}',
      '.dcl-eye svg{display:block}',
      '.dcl-eye.off{border-color:var(--dsw-alias-border-l2);background:transparent;',
      'color:var(--dsw-alias-label-caption)}',
      '.dcl-eye:disabled{opacity:.5;cursor:default}',
      /* V2 — flush left. The name column used to be a FIXED 44% of the row, so
         a short name ("计划" / "技能") parked a huge empty gap before the
         description and the row read as centre-spread ("中间空的还是很多，
         应该全部紧挨着左边"). The name sizes to its content now and only the
         CAP survives; the description follows immediately and the trailing
         slot still right-aligns through its own margin-left:auto. */
      '.dcl-nm{flex:0 1 auto;max-width:44%;min-width:0;overflow:hidden;text-overflow:ellipsis;',
      'white-space:nowrap}',
      '.dcl-ds{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
      'color:var(--dsw-alias-label-tertiary);font-size:13px}',
      '.dcl-tr{margin-left:auto;flex:none;min-width:0;justify-content:flex-end;display:inline-flex;align-items:center;gap:6px}',
      /* B3 — the 「＋」 menu's OWN scroll container needs the left indicator too,
         not just the MCP tool list. .dcl-scroll is the scroller and it clips
         (overflow-y:auto), so the bar lives OUTSIDE it, in .dcl-scrollwrap,
         which therefore has to be a positioning context. Track 4px + thumb
         min 24px: a 3px track at 55% opacity was not readable against the
         menu background. */
      '.dcl-scrollwrap{position:relative}',
      '.dcl-scrollbar-l{width:5px;z-index:2;background:0 0}',
      '.dcl-scrollbar-thumb{min-height:24px}',      /* C6 — an EMPTY rail contributes a whole flex gap (measured on the real
         host: pill bottom -> card top = 16px = gap8 + empty rail + gap8).
         position:absolute takes it out of the flex layout: no flex item, no gap;
         the wrapper still exists in the DOM for the assertions that read its
         class/aria, and max-height:0 is still its computed value. It is NOT
         display:none: display does not transition, so that mechanism silently
         killed the 0 -> 72px opening animation (real Edg/153: rail
         transitionstart count 1 -> 0, the box snapped straight to 40px).
         position:absolute keeps the box RENDERED, so the max-height
         transition still starts. */
      '.dcl-railbox:not(.has){position:absolute}',
      /* F4 — the browser name is the row's LAST slot and must never be
         squeezed: flex:none keeps 「· Edge」 at its natural width while the
         name (max-width:44%) and the address (flex:1;min-width:0) take every
         pixel the composer card's width does not have. No overflow/ellipsis
         here on purpose — a truncated browser name would be a lie. */
      '.dcl-br{flex:none;color:var(--dsw-alias-label-caption);font-size:12px;',
      'line-height:18px;white-space:nowrap}',
      '.dcl-note-web{margin:2px 10px 6px}',
      '.dcl-kbd{font-size:11px;color:var(--dsw-alias-label-caption)}',
      '.dcl-dr{width:20px;height:20px;border-radius:4px;color:var(--dsw-alias-label-caption);',
      'display:inline-grid;place-items:center}',
      /* V1 — corner-shape:round is NOT decoration. This app renders corners as
         SUPER-ELLIPSES by default, so a bare border-radius:50% comes out as a
         rounded SQUARE (verified pixel-for-pixel on the live GUI: the row
         indicators read as squircles, "所有的点都是一个小方的形状"). The
         framework's own primitives do exactly this pairing —
         @deepseek-ai/dsh-client-ui-primitives/lib/StateDot.module.css sets
         border-radius:50% AND corner-shape:round on both its layers. Every
         fully-round element in this sheet carries it for the same reason. */
      '.dcl-dot{width:6px;height:6px;min-width:6px;border-radius:50%;corner-shape:round;flex:none}',
      '.dcl-dot-pin{background:#4ed17e}',
      '.dcl-dot-warn{background:#e0a33a}',
      '.dcl-pin-miss{font-style:normal;font-size:10px;opacity:.75;color:#e0a33a;margin-left:2px}',
      '.dcl-dot-hot{background:#679efe}',
      '.dcl-tag{font-size:11px;line-height:18px;padding:0 6px;border-radius:999px}',
      '.dcl-tag-on{background:#4ed17e1f;color:#4ed17e;border:1px solid #4ed17e33}',
      '.dcl-tag-off{color:var(--dsw-alias-label-caption);border:1px solid var(--dsw-alias-border-l2)}',
      '.dcl-tag-err{background:#f25a5a1f;color:#f25a5a;border:1px solid #f25a5a33}',
      '.dcl-err{color:#f25a5a}',

      '.dcl-crumbs{display:flex;align-items:center;gap:2px;flex:none;padding:4px 4px 6px;',
      'margin-bottom:2px;border-bottom:.5px solid var(--dsw-alias-border-l1)}',
      '.dcl-crumb{padding:2px 6px;border-radius:6px;font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-label-tertiary);background:0 0;border:0;font-family:inherit;cursor:pointer;',
      'transition:background-color .12s ease,color .12s ease}',
      '.dcl-crumb:hover{background:var(--dsw-alias-interactive-bg-hover);',
      'color:var(--dsw-alias-label-primary)}',
      '.dcl-crumb-cur{color:var(--dsw-alias-label-primary);cursor:default}',
      '.dcl-crumb-cur:hover{background:transparent}',
      '.dcl-sep{color:var(--dsw-alias-label-caption);display:inline-flex}',
      /* #15 — hover grows the search field. Codex has no such effect on an
         input; the values come from its floating-composer collapse handle
         (duration .15s, ease-enter-snappy), the closest real Codex motion
         language there is.
         The old bound was a LIE: overflow:clip plus overflow-clip-margin:18px
         does not clip at the box edge — it moves the clip edge 18px OUTSIDE,
         so the grown pill painted over the menu padding and the breadcrumb
         ("都会超出限制它的"). The bound is now arithmetic: the box carries 8px
         of side padding and the scale is 1.02, so each edge grows by 1% of the
         field's width (a ~660px field -> 6.6px, inside the 8px budget), with
         the menu's own 4px padding as slack. Nothing clips, so nothing is cut
         off either. */
      '.dcl-searchbox{height:40px;flex:none;display:flex;align-items:center;',
      'box-sizing:border-box;padding:0 8px}',
      '.dcl-search{display:flex;align-items:center;gap:8px;height:36px;flex:1;min-width:0;margin:2px;',
      'padding:0 10px;border-radius:10px;background:#00000024;',
      'transition:transform .15s cubic-bezier(.23,1,.32,1)}',
      '.dcl-search:hover{transform:scale(1.02)}',
      '@media (prefers-reduced-motion: reduce){.dcl-search{transition:none}.dcl-search:hover{transform:none}}',
      '.dcl-search input{flex:1;background:0 0;border:0;outline:none;color:var(--dsw-alias-label-primary);',
      'font-family:inherit;font-size:13px}',
      '.dcl-search input::placeholder{color:var(--dsw-alias-label-caption)}',
      '.dcl-hint{flex:none;padding:6px 10px 5px;margin-top:2px;',
      'border-top:.5px solid var(--dsw-alias-border-l1);font-size:11px;line-height:16px;',
      'color:var(--dsw-alias-label-caption)}',
      '.dcl-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:24px 10px;',
      'color:var(--dsw-alias-label-caption);font-size:12.5px;text-align:center}',

      /* The rail must NOT reserve a row. An always-mounted empty spacer kept the
         composer still, but it also parked 34px (min-height:28px + 6px padding)
         between the 「N 条注释」 pill and the input card — permanently, with no
         menu open. The stable-composer job belongs to .dcl-railbox instead: a
         PERSISTENT wrapper whose max-height animates 0 <-> the chips' height,
         so the dock absorbs the change as motion rather than as a jump, and
         contributes exactly zero height while there is nothing to show. */
      '.dcl-railbox{overflow:hidden;max-height:0;',
      'transition:max-height .16s cubic-bezier(.23,1,.32,1)}',
      /* R26 — the cap must fit the chips the user actually picks. At 72px the
         third row was CLIPPED by this very rule ("这些UI显示到了第三行就看不见
         了"), because the rail wraps and 3 rows of 24px chips plus gaps exceed it.
         The cap only exists so the opening animation has a number to transition
         to; it is a ceiling, not a design size. */
      '.dcl-railbox.has{max-height:min(240px,42vh);overflow-y:auto}',
      '.dcl-railbox.has::-webkit-scrollbar{width:0;height:0}',
      '.dcl-rail{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:0 0 6px}',
      '.dcl-chip{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 9px;',
      'border-radius:999px;corner-shape:round;background:var(--dsw-alias-interactive-bg-hover);',
      'border:1px solid var(--dsw-alias-border-l2);',
      'color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:24px;',
      'max-width:240px;user-select:none;animation:dclChipIn .16s cubic-bezier(.32,.72,0,1)}',
      '@keyframes dclChipIn{from{opacity:0;transform:translateY(4px) scale(.96)}to{opacity:1;transform:none}}',
      '.dcl-chip-marker{flex:none;font-weight:500}',
      /* R62 — 兜底图标 .dcl-fb 是 absolute + inset:0，它的包含块必须就是这一格
         (12x12)。少了 position:relative，包含块会落到更远的定位祖先上，.dcl-fb
         因此铺成一整块巨大的透明层（CDP 实测：1108x166，父元素却是
         12x12 的 .dcl-chip-ic），而 favicon 加载成功后它只降到 opacity:0 ——
         **opacity 不退出命中测试**，于是 chip 右侧的 x 被整块盖住：逻辑上可点，
         真实鼠标点不动。证据：elementFromPoint 在 x 中心点返回 .dcl-fb（不是 x），
         把它 pointer-events:none 后同一次真实点击立刻把 chip 删掉。
         菜单里的 .dcl-ic 一直有 position:relative（见其定义），只有这里漏了。 */
      '.dcl-chip-ic{flex:none;position:relative;width:12px;height:12px;display:inline-flex;align-items:center;',
      'justify-content:center;overflow:hidden;border-radius:2px}',
      '.dcl-chip-ic img,.dcl-chip-ic svg{width:12px;height:12px;display:block;border-radius:2px}',
      /* R63 — chip 的图标格必须和菜单行的 .dcl-ic 消费**同一组** favicon 状态规则。
         这批规则（初始透明 / data-ok 露出 / 撤掉兜底 / 反色 / empty 让位）原先
         只写给 .dcl-ic，chip 一条都没有 ⇒ 兜底图标**从来不会被撤掉**：
          CDP 实测两个 chip 的 favicon 都已 data-ok=1 / naturalWidth=32
         （即真图标加载成功），而 .dcl-fb 仍是 opacity:.55 / visibility:visible，
         bothVisible=true。又因为 img 在 chip 里没有 position/z-index（菜单那侧的
         position:relative;z-index:1 同样只写给 .dcl-ic），absolute 的兜底图标
         绘制在 static 的真图标之上 ⇒ 看到的是**地球兜底压住真 favicon**
         （截图：DeepSeek 那条显示成蓝色地球）。 */
      '.dcl-chip-ic img.dcl-favi{position:relative;z-index:1;opacity:0;transition:opacity .12s ease-out}',
      '.dcl-chip-ic img.dcl-favi[data-ok="1"]{opacity:1}',
      /* 真图标一露脸，垫在下面的兜底就地撤掉（favicon 多为透明背景，不撤就是"两个图标叠着"）。 */
      '.dcl-chip-ic img.dcl-favi[data-ok="1"]+.dcl-fb{opacity:0;visibility:hidden}',
      /* 浅色主题 + 浅色图标 ⇒ 压黑；暗色主题 + 深色图标 ⇒ 提白（与菜单同一口径）。 */
      '.dcl-chip-ic img.dcl-favi[data-flip="dark"]{filter:brightness(0) saturate(100%)}',
      '.dcl-chip-ic img.dcl-favi[data-flip="light"]{filter:brightness(0) invert(1)}',
      /* 下下来是空图的 favicon（全透明）不算"浅色"，让兜底图标顶回来，那一格不留空。 */
      '.dcl-chip-ic img.dcl-favi[data-tone="empty"]{opacity:0}',
      '.dcl-chip-ic img.dcl-favi[data-tone="empty"]+.dcl-fb{opacity:.55;visibility:visible}',
      '.dcl-chip-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dcl-chip-x{flex:none;cursor:pointer;color:var(--dsw-alias-label-caption);font-size:13px;',
      'line-height:1;padding:0 1px;margin-left:2px;transition:color .12s ease}',
      '.dcl-chip-x:hover{color:var(--dsw-alias-label-primary)}',
      /* R44 — the 文件与文件夹 row shows its two halves AT ONCE, half-width each
         ("直接把它对半分，一边是文件，一边是文件夹"). */
      '.dcl-item.dcl-split{display:flex;gap:4px;padding:4px 6px}',
      /* R47 — the user found the two halves far too big ("这两个的好大呀，没必要
         那么大，真的缩小一下就行了"): tighter padding, 14px glyphs, a smaller
         second line and an 8px radius. */
      '.dcl-half{flex:1 1 0;min-width:0;display:inline-flex;align-items:center;gap:4px;',
      'padding:5px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;',
      'background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:left;',
      'transition:background .12s ease,border-color .12s ease}',
      '.dcl-half .dcl-ic,.dcl-half .dcl-ic svg{width:14px;height:14px}',
      '.dcl-half .dcl-nm{font-size:13px;line-height:17px}',
      '.dcl-half:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l4)}',
      '.dcl-half-t{display:flex;flex-direction:column;min-width:0;gap:0}',
      '.dcl-half-t .dcl-ds{padding:0;font-size:11.5px;line-height:15px}',
      /* R34 — the armed-mode announcement. 计划 / 目标 used to be two rows you
         could arm independently with nothing on screen to say which one would
         take over the next message ("我设置的计划和目标模式很容易混淆…应该是两个
         一起的"). This strip sits directly above the composer and names what the
         very next message will do; clicking it cancels. */
      /* R35 — the strip must line up with the composer card instead of
         stretching across the whole dock. It has no chip to measure against
         when it is the only thing in the dock, so it carries the same box the
         Host's own GoalBar uses (dsh-client-ui-goal/lib/client.js:127:
         width:100% + max-width:var(--dsh-composer-card-max-width) + margin auto)
         and the layout effect below aligns it exactly like the rail. */
      /* R56 — the 目标 chip, geometrically the Host Plan chip's twin.
         The Host's chip is padding:2px 8px / font-size:13px / line-height:20px /
         border-radius:999px in the warn-amber tokens
         (dsh-client-ui-plan/lib/client.js:11). Ours is the same box in
         orange-red, so the two exclusive modes read as a pair while staying
         distinguishable at a glance. */
      '.dcl-goalchip{display:inline-flex;align-items:center;gap:4px;flex:none;',
      'corner-shape:round;border:none;border-radius:999px;padding:2px 8px;',
      'background:rgba(232,89,12,.14);color:#D9480F;',
      'font-size:13px;font-weight:500;line-height:20px;cursor:pointer;user-select:none}',
      '.dcl-goalchip:hover{color:#B23A0B;background:rgba(232,89,12,.2)}',
      '.dcl-goalchip:focus-visible{outline:2px solid #D9480F;outline-offset:2px}',
      '.dcl-goalchip-i{display:inline-flex}',
      '.dcl-goalchip-x{display:inline-flex;opacity:.75}',
      '.dcl-goalchip:hover .dcl-goalchip-x{opacity:1}',

      '.dcl-card{display:flex;flex-direction:column;gap:14px}',
      '.dcl-card h3{font-size:13px;font-weight:600;margin:0}',
      '.dcl-card h3 small{display:block;margin-top:2px;font-size:11px;font-weight:400;',
      'color:var(--dsw-alias-label-tertiary)}',
      '.dcl-grp{border-top:1px solid var(--dsw-alias-border-l1);padding-top:12px;',
      'display:flex;flex-direction:column;gap:9px}',
      '.dcl-grp>h4{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;',
      'color:var(--dsw-alias-label-caption);margin:0}',
      '.dcl-f{display:flex;align-items:center;gap:12px;min-height:30px}',
      '.dcl-f .dcl-lab{flex:1;min-width:0}',
      '.dcl-f .dcl-lab b{display:block;font-size:12.5px;font-weight:500}',
      '.dcl-f .dcl-lab i{display:block;font-style:normal;font-size:11px;line-height:15px;',
      'color:var(--dsw-alias-label-caption)}',
      '.dcl-stepper{display:inline-flex;align-items:center;gap:2px;height:26px;padding:0 3px;',
      'border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);flex:none}',
      '.dcl-stepper button{width:20px;height:20px;border-radius:6px;border:0;background:transparent;',
      'color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:14px;line-height:1;',
      'font-family:inherit;transition:background-color .12s ease}',
      '.dcl-stepper button:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dcl-stepper span{min-width:20px;text-align:center;font-size:12.5px}',
      '.dcl-input{width:74px;height:26px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);',
      'background:transparent;color:var(--dsw-alias-label-primary);padding:0 8px;font-family:inherit;',
      'font-size:12.5px;outline:none}',
      '.dcl-sw{width:34px;height:18px;border-radius:999px;background:var(--dsw-alias-border-l3);',
      'position:relative;flex:none;cursor:pointer;border:0;padding:0;',
      'transition:background-color .16s ease-out}',
      '.dcl-sw::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;',
      /* 开关圆钮：**别写死 #fff** —— 深色模式下就是一堆刺眼的白点（
         收到的反馈：「两个 UI 还有白色小方块」，另一个是组合器面板里的强调色药丸）。
         旋钮必须和**轨道**对比，所以分两态取色：
           关：轨道是 --dsw-alias-border-l3（浅色≈浅灰 / 深色≈深灰）
               ⇒ 旋钮用 label-tertiary（浅 #81858c / 深 #adb2b8，两边都是中灰）
           开：轨道是业务蓝（浅 #4176e6 / 深 #679efe）
               ⇒ 旋钮用 label-primary-foreground（浅 #fff / 深 #0f1115，宿主的设计搭档）
         —— 结论：两种模式、两种状态，都不再出现"纯白小方块"。 */
      'border-radius:50%;corner-shape:round;background:var(--dsw-alias-label-tertiary,#81858c);',
      'transition:left .16s cubic-bezier(.32,.72,0,1)}',
      '.dcl-sw[data-on="1"]{background:var(--dsw-alias-state-business-primary)}',
      '.dcl-sw[data-on="1"]::after{left:18px;background:var(--dsw-alias-label-primary-foreground,#fff)}',
      '.dcl-seg{display:inline-flex;background:var(--dsw-alias-interactive-bg-hover);border-radius:9px;',
      'padding:2px;gap:2px;flex:none}',
      '.dcl-seg button{padding:2px 9px;border-radius:7px;font-size:11.5px;',
      'color:var(--dsw-alias-label-tertiary);background:0 0;border:0;cursor:pointer;',
      'font-family:inherit;transition:background-color .12s ease,color .12s ease}',
      '.dcl-seg button[data-on="1"]{background:var(--dsw-alias-bg-layer-3);',
      'color:var(--dsw-alias-label-primary)}',
      '.dcl-pinrow{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.dcl-pin{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 6px 0 10px;',
      'border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);font-size:12px;',
      'color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dcl-pin .dcl-dot{margin-right:0}',
      '.dcl-pin-x{cursor:pointer;color:var(--dsw-alias-label-caption);font-size:13px;line-height:1}',
      '.dcl-pin-x:hover{color:var(--dsw-alias-label-primary)}',
      '.dcl-pin-add{background:transparent;border:1px dashed var(--dsw-alias-border-l2);',
      'color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0 10px;font-family:inherit}',
      /* R61 — the real plugin picker behind 常驻插件's 「+ 添加插件」. */
      '.dcl-pickwrap{display:flex;flex-direction:column;gap:6px;padding:8px 0 2px}',
      '.dcl-pickbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dcl-picksearch{width:150px}',
      '.dcl-picklist{display:flex;flex-wrap:wrap;gap:6px;padding:2px 0;position:relative;',
      /* 「跑到底下去了」：44 个插件平铺会把整张卡片顶得很高，
         选择器一路铺到面板最底下。现在它有自己的滚动区（上限 240px）：
         筛选框/计数固定在上面，列表在下面滚，卡片高度不再被撑爆。 */
      'max-height:240px;overflow:auto;overscroll-behavior:contain;align-content:flex-start}',
      '.dcl-pickseg{flex:none}',
      /* 两行插件卡：第一行中文名，第二行包名 + 工具数 + 大概 token。 */
      '.dcl-pick2{display:flex;flex-direction:column;align-items:flex-start;gap:2px;',
      'height:auto;min-height:38px;padding:4px 10px;max-width:min(100%,320px);text-align:left;',
      'white-space:normal;line-height:1.3}',
      '.dcl-pick2 .dcl-pick-t{font-size:12.5px;color:var(--dsw-alias-label-primary)}',
      '.dcl-pick2 .dcl-pick-s{font-size:10.5px;color:var(--dsw-alias-label-caption);',
      'overflow:hidden;text-overflow:ellipsis;max-width:100%}',
      '.dcl-pick2.on{border-color:var(--dsw-alias-state-success-primary)}',
      '.dcl-pick2.on .dcl-pick-t{color:var(--dsw-alias-state-success-primary)}',
      /**
       * 类名撞车修复（「筛选插件里打字，它显示框在整个界面最右下角」）。
       *
       * .dcl-pick 原来身兼两职：
       *   · 4802 行 —— **下拉浮层**（role=listbox），样式是下面那条
       *     .dcl-pick{position:absolute;left:0;right:0;top:calc(100% + 4px);…}；
       *   · 6252 行 —— 「添加插件」列表里的**候选药丸**。
       * 后定义的浮层规则把候选药丸也变成 position:absolute，而 .dcl-picklist 没有
       * position:relative ⇒ 药丸脱离文档流、按更外层容器定位、还被拉成整行宽 ——
       * 看着就是"框跑到整个界面的右下角去了"。
       * 现在拆开：药丸一律用 .dcl-pick2（它本来就有这个类），.dcl-pick 只留给浮层。
       */
      '.dcl-pick2{cursor:pointer;font-family:inherit;border:1px solid var(--dsw-alias-border-l1);',
      'padding:0 10px;background:transparent}',
      '.dcl-pick2:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dcl-note{font-size:11px;line-height:15px;color:var(--dsw-alias-label-caption)}',
      /* R59 — the URI reads as a ROW of this list, not as a caption: same left
         axis as every row name (10px item padding + 16px icon + 8px gap), the
         row's own body size and colour, so it lines up in the column below the
         picker instead of hugging the far left ("靠太左边了…是一个队列上的平行"). */
      '.dcl-btn2{height:26px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);',
      'background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-family:inherit;',
      'font-size:12px;transition:background-color .12s ease}',
      '.dcl-btn2:hover{background:var(--dsw-alias-interactive-bg-hover)}',

      /* Settings card shell. Copied field for field from the framework's own
         PluginCard (dsh-client-ui-settings-plugins, .YyYd_a_*): the framework
         only DISPATCHES settings.plugin.item by namespace — renderSlot(
         "settings.plugin.item", {}, { entryKey: ns }) — so a card that wants
         the collapsed one-line header every other plugin shows has to draw it
         itself. Dumping every switch at level 1 is what made this one look out
         of place next to 表情 / Docker 容器面板. */
      '.dcl-sc{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);',
    /* 展开后这张卡片会比设置面板还高；给它一个滚动边距，标题永远不贴着顶边被切掉。 */
    'scroll-margin-top:14px;',
      'border-radius:16px;list-style:none;transition:border-color .16s,background .16s}',
      '.dcl-sc:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.dcl-sc.open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
      '.dcl-sc-h{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;',
      'background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}',
      '.dcl-sc-h:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dcl-sc-t{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}',
      '.dcl-sc-n{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}',
      '.dcl-sc-d{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}',
      '.dcl-sc-c{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}',
      '.dcl-sc.open .dcl-sc-c{transform:rotate(180deg)}',
      '.dcl-sc-b{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 16px;padding:14px 0 8px}',
      /**
       * Symptom: the settings panel looks like it opened somewhere else entirely.
       *
       * Measured: the card is **827px** tall when expanded, while the settings
       * pane's content area is only **746px** high. The whole page is therefore
       * pushed to 1907px, and because DSH restores the previous scroll position
       * when the plugins page opens, what you land on is **a slice from the
       * middle of the list**: both the top of the page and the card's own title
       * sit outside the viewport - which reads as "the card I picked opened
       * somewhere else".
       * The card body is now clamped to the pane height and **scrolls inside
       * itself**: the card always sits fully inside the frame, and it can no
       * longer push the top of the page out. The outer scroll still belongs to
       * DSH's own container - this never steals it.
       */
      '.dcl-sc.open .dcl-sc-b{max-height:min(62vh,520px);overflow-y:auto;overscroll-behavior:contain}',

      /* Level-2 marker inside the menu: a tinted band + bolder title, so a
         subpage never reads as another level-1 group. */
      '.dcl-lv2{display:flex;align-items:center;gap:8px;flex:none;padding:6px 8px 8px;',
      'border-bottom:.5px solid var(--dsw-alias-border-l2);',
      'background:linear-gradient(180deg,#ffffff0a,transparent)}',
      '.dcl-lv2-t{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      /* R4 — margin-left:auto belongs to the RIGHT slot ONLY. It used to live on
         the shared .dcl-lv2-b, which THREE children wear (the parent name, the
         › separator, and the right slot). Three competing auto margins split the
         free space three ways, so 「能力」 drifted into the middle of the bar and
         「› 指令」 to the far right — "二级菜单里面上方应该是全部靠左，但是实际上
         中间还是有空档". */
      '.dcl-lv2-b{font-size:11px;color:var(--dsw-alias-label-caption)}',
      /* 这里必须是 flex + gap：右侧槽现在会同时装「共 N 个…」和「设置组合」两件东西
         （数组子节点），而 .dcl-lv2 的 gap 只作用于它的**直接子元素**，
         不作用于这个槽内部 ⇒ 两件东西会紧贴在一起（收到的反馈"挨在一起了"）。 */
      '.dcl-lv2-r{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-caption);',
      'display:flex;align-items:center;gap:8px;white-space:nowrap}',
      /* V10 — padding:0 and line-height:0 are load-bearing. A <button> carries a
         user-agent padding (1px 6px in Chromium); combined with a 16px glyph in
         a 22px box the ink sat off-centre inside the button ("那个箭头不是在
         中间，在最右边"). ICON.back also declares width/height now, like every
         other sized glyph in this file. */
      '.dcl-back{width:22px;height:22px;padding:0;border-radius:6px;border:0;background:0 0;flex:none;',
      'color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-grid;place-items:center;',
      'line-height:0;transition:background-color .12s ease}',
      '.dcl-back svg{display:block;margin:0 auto;width:16px;height:16px}',
      '.dcl-back:hover{background:var(--dsw-alias-interactive-bg-hover)}',

      /* Workspace field: a real <select>, because this is a setting the user
         changes here, not a status line to read. */
      '.dcl-field{position:relative;display:flex;align-items:center;gap:8px;flex:none;padding:6px 10px 4px}',
      '.dcl-field-l{font-size:12px;color:var(--dsw-alias-label-tertiary);flex:none}',
      '.dcl-field-p{position:relative;flex:1;min-width:0;display:flex}',
      /* R6c — a themed control, not a native <select>: an OS control cannot
         inherit this app's tokens and read as "太简陋，没跟同一套主题". */
      '.dcl-select{flex:1;min-width:0;height:28px;border-radius:8px;font-family:inherit;font-size:12.5px;',
      'color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);',
      'border:1px solid var(--dsw-alias-border-l2);padding:0 6px 0 10px;outline:none;cursor:pointer;',
      'display:inline-flex;align-items:center;gap:6px;text-align:left;',
      'transition:border-color .12s ease,background-color .12s ease}',
      '.dcl-select:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}',
      '.dcl-select-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dcl-select:disabled{opacity:.5;cursor:default}',
      '.dcl-pick{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:60;max-height:220px;',
      'overflow-y:auto;padding:4px;border-radius:12px;box-sizing:border-box;',
      'background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-3));',
      'border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);',
      'display:flex;flex-direction:column;gap:2px}',
      '.dcl-pick-i{display:flex;flex-direction:column;gap:1px;width:100%;text-align:left;',
      'padding:6px 8px;border:0;border-radius:8px;background:0 0;cursor:pointer;font-family:inherit}',
      '.dcl-pick-i:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dcl-pick-i.on{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dcl-pick-n{font-size:12.5px;color:var(--dsw-alias-label-primary)}',
      '.dcl-pick-p{font-size:11px;color:var(--dsw-alias-label-caption);overflow:hidden;',
      'text-overflow:ellipsis;white-space:nowrap}',
      '.dcl-btn3{height:22px;padding:0 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);',
      'background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-family:inherit;',
      'font-size:11px;flex:none;transition:background-color .12s ease,color .12s ease}',
      '.dcl-btn3:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);',
      'color:var(--dsw-alias-label-primary)}',
      '.dcl-btn3.on{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dcl-btn3:disabled{opacity:.45;cursor:default}',
      /* Reconnect feedback. A disabled control alone was the whole problem
         ("没有任何显示，就是变灰色了"), so the in-flight face keeps FULL opacity
         and turns red while the dots animate; the outcome faces stay red/green
         on the button itself. Content-in-keyframes is a Blink/WebKit feature —
         where it does not animate the label still reads 重连中. */
      '.dcl-btn3.dcl-re-busy:disabled{opacity:1;color:#f25a5a;border-color:#f25a5a66;cursor:progress}',
      '.dcl-btn3.dcl-re-busy::after{content:"";display:inline-block;width:1em;text-align:left;',
      'animation:dclDots 1s steps(1,end) infinite}',
      '@keyframes dclDots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}',
      '100%{content:"..."}}',
      '.dcl-btn3.dcl-re-ok{color:#3ecf8e;border-color:#3ecf8e66}',
      '.dcl-btn3.dcl-re-err{color:#f25a5a;border-color:#f25a5a66}',
      '.dcl-tools{display:flex;flex-direction:column;gap:2px;flex:none;margin:0 10px 6px 34px;',
      'padding:6px 8px;border-radius:8px;background:#00000024;font-size:11.5px;',
      'color:var(--dsw-alias-label-tertiary)}',
      '.dcl-tool{display:flex;align-items:baseline;gap:6px;min-width:0}',
      '.dcl-tool-n{color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:none;max-width:45%;',
      'overflow:hidden;text-overflow:ellipsis}',
      '.dcl-tool-d{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      /* The empty state icon needs its own box, otherwise that bare span is
         another unsized-SVG case. */
      '.dcl-eic{display:inline-flex;width:22px;height:22px;align-items:center;justify-content:center;',
      'color:var(--dsw-alias-label-caption)}',
      '.dcl-eic svg{width:22px;height:22px}',
      '.dcl-state{display:flex;align-items:center;gap:6px;flex:none;margin:2px 10px 4px;',
      'font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-caption)}',
      '.dcl-state-warn{color:#e0a34a}',
      '.dcl-state-err{color:#f25a5a}',
      '.dcl-banner{display:flex;align-items:center;gap:8px;flex:none;margin:6px 8px 4px;padding:8px 10px;',
      'border-radius:10px;background:#f25a5a1a;border:1px solid #f25a5a33;color:#f25a5a;font-size:12px}',
      '.dcl-banner-x{margin-left:auto;cursor:pointer;font-size:14px;line-height:1}'
    ].join('');

    /** Inject our stylesheet once per document. */
    function ensureStyles () {
      if (typeof document === 'undefined') return;
      if (document.querySelector('style[data-dcl-css="' + STYLE_ID + '"]') !== null) return;
      const tag = document.createElement('style');
      tag.dataset.dclCss = STYLE_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    /* ------------------------------------------------------------------ *
     * Icons (inline SVG strings, 16px viewBox)
     * ------------------------------------------------------------------ */
    const S = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
    const ICON = {
      plus: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.6"><path d="M8 3.2v9.6M3.2 8h9.6"/></svg>',
      /* R47 — the plan row wears the glyph the user picked out (a rounded frame
         with an arrow and two bars). Source: primitives
         <APP_ROOT>
         IconContextInjectionOutline16, paths copied verbatim. */
      plan: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M11.9512 1.13281C12.401 1.20666 12.8093 1.34164 13.1738 1.60645C13.4282 1.79137 13.6521 2.01609 13.8369 2.27051C14.1574 2.71187 14.2892 3.21614 14.3506 3.78223C14.4105 4.33532 14.4102 5.02658 14.4102 5.87305V10.0273C14.4102 10.8738 14.4105 11.5651 14.3506 12.1182C14.2892 12.6843 14.1574 13.1885 13.8369 13.6299C13.652 13.8843 13.4282 14.109 13.1738 14.2939C12.7324 14.6146 12.2273 14.7462 11.6611 14.8076C11.1081 14.8675 10.4166 14.8672 9.57031 14.8672H6.43164C5.58533 14.8672 4.89387 14.8675 4.34082 14.8076C3.77474 14.7463 3.27046 14.6144 2.8291 14.2939C2.57453 14.109 2.35003 13.8844 2.16504 13.6299C1.84444 13.1885 1.71272 12.6844 1.65137 12.1182C1.59147 11.5651 1.5918 10.8738 1.5918 10.0273V5.87305C1.5918 5.02655 1.59146 4.33533 1.65137 3.78223C1.71272 3.21606 1.84443 2.71191 2.16504 2.27051C2.35003 2.01596 2.57453 1.79141 2.8291 1.60645C3.19332 1.34202 3.60062 1.20669 4.0498 1.13281V2.56445C3.87191 2.61154 3.74906 2.66836 3.65137 2.73926C3.51583 2.83777 3.3964 2.95726 3.29785 3.09277C3.1794 3.25581 3.09143 3.4856 3.04297 3.93262C2.9931 4.39287 2.99219 4.99529 2.99219 5.87305V10.0273C2.99219 10.905 2.99312 11.5075 3.04297 11.9678C3.09142 12.4147 3.17943 12.6446 3.29785 12.8076C3.3964 12.9431 3.51583 13.0626 3.65137 13.1611C3.81441 13.2795 4.04437 13.3676 4.49121 13.416C4.95142 13.4658 5.55411 13.4668 6.43164 13.4668H9.57031C10.4479 13.4668 11.0505 13.4659 11.5107 13.416C11.9576 13.3675 12.1876 13.2796 12.3506 13.1611C12.4861 13.0626 12.6056 12.9431 12.7041 12.8076C12.8224 12.6446 12.9106 12.4146 12.959 11.9678C13.0088 11.5075 13.0098 10.905 13.0098 10.0273V5.87305C13.0098 4.99532 13.0088 4.39286 12.959 3.93262C12.9105 3.48579 12.8225 3.2558 12.7041 3.09277C12.6056 2.95727 12.4861 2.83778 12.3506 2.73926C12.2527 2.66816 12.1296 2.61064 11.9512 2.56348V1.13281Z" fill="currentColor"/>' +
        '<path d="M9.32227 11.4141H4.95508V10.2148H9.32227V11.4141Z" fill="currentColor"/>' +
        '<path d="M11.0439 8.90039H4.95508V7.70117H11.0439V8.90039Z" fill="currentColor"/>' +
        '<path d="M8.59961 3.75781L9.70996 2.64746L10.5586 3.49609L8.49512 5.55957C8.22173 5.83266 7.77816 5.83285 7.50488 5.55957L5.44141 3.49512L6.28906 2.64746L7.40039 3.75781V1.09668H8.59961V3.75781Z" fill="currentColor"/>' +
        '</svg>',
      /* R39 — the goal row wears the Host's OWN goal glyph.
         Source: <APP_ROOT>
         IconGoalOutline16 (ic_ds_goal_outline_16: a broken ring with a landed
         flag). It is copied verbatim as path data because this bundle only
         requires react/react-dom from the shared registry — it cannot import the
         primitives package. The previous glyph was a bare arrow, which the user
         rejected outright ("目标的图标是一个箭头非常的丑陋").
         width/height stay explicit: an <svg viewBox> with no size renders as a
         300x150 replaced element. */
      goal: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M8 0C8.31451 0 8.62464 0.019379 8.92969 0.0546875C8.48228 0.403371 8.0952 0.825758 7.78809 1.30469C4.18586 1.41664 1.2998 4.37061 1.2998 8C1.2998 11.7003 4.29969 14.7002 8 14.7002C11.6297 14.7002 14.5829 11.8136 14.6943 8.21094C15.1734 7.90377 15.5956 7.51688 15.9443 7.06934C15.9797 7.37473 16 7.68512 16 8C16 12.4183 12.4183 16 8 16C3.58172 16 0 12.4183 0 8C0 3.58172 3.58172 0 8 0ZM7.0166 3.6084C7.00658 3.73765 7 3.86817 7 4C7 4.31845 7.03098 4.62973 7.08789 4.93164C5.76489 5.32438 4.7998 6.54958 4.7998 8C4.7998 9.76731 6.23269 11.2002 8 11.2002C9.45065 11.2002 10.6749 10.2345 11.0674 8.91113C11.3696 8.96818 11.6812 9 12 9C12.1315 9 12.2617 8.99239 12.3906 8.98242C11.9423 10.995 10.1477 12.5 8 12.5C5.51472 12.5 3.5 10.4853 3.5 8C3.5 5.85255 5.00435 4.05702 7.0166 3.6084Z" fill="currentColor"/>' +
        '<path d="M7.5 8.62109L9.12109 7" stroke="currentColor" stroke-width="1.3"/>' +
        '<path d="M9.08245 3.35798L11.8651 0.575334C11.895 0.545384 11.9463 0.56391 11.9502 0.606086L12.2362 3.69859C12.2384 3.72259 12.2574 3.74159 12.2814 3.74378L15.3697 4.02583C15.4119 4.02968 15.4305 4.08101 15.4005 4.11098L12.618 6.89351C12.6086 6.90289 12.5959 6.90816 12.5826 6.90816L9.11781 6.90815C9.09019 6.90816 9.06781 6.88577 9.06781 6.85816L9.06781 3.39333C9.06781 3.38007 9.07308 3.36735 9.08245 3.35798Z" stroke="currentColor" stroke-width="1.3"/>' +
        '</svg>',
      files: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4"><rect x="1.8" y="3" width="12.4" height="10" rx="1.4"/><path d="M2 11l3.4-3.2 2.6 2.4 2.2-2L14 11.4"/><circle cx="5.6" cy="6" r=".9" fill="currentColor" stroke="none"/></svg>',
      /* Folder, not the picture frame: this row now covers directories too. */
      folder: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4"><path d="M1.8 4.2c0-.7.6-1.2 1.2-1.2h3l1.5 1.8h5.5c.7 0 1.2.5 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H3c-.6 0-1.2-.5-1.2-1.2z"/><path d="M1.8 6.6h12.4"/></svg>',
      back: '<svg width="16" height="16" viewBox="0 0 16 16" ' + S + ' stroke-width="1.7"><path d="M10 3.5L5.5 8 10 12.5"/></svg>',
      /* R47 — the user handed over a screenshot for this one: a rounded frame
         holding a command prompt ( > plus an underscore ). Drawn here rather
         than borrowed, because the primitives set has no terminal glyph. */
      cmd: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="1.4" y="2.4" width="13.2" height="11.2" rx="2.6" stroke="currentColor" stroke-width="1.3"/>' +
        '<path d="M4.6 6.1L6.9 8.1L4.6 10.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M8.5 10.4h3.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
        '</svg>',
      skill: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4"><path d="M8.8 1.6L3 9h4l-.8 5.4L12 7H8z"/></svg>',
      mcp: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4"><path d="M8 2.6l5.4 3.1v6.2L8 15l-5.4-3.1V5.7z"/><path d="M2.6 5.7L8 8.8l5.4-3.1M8 8.8V15"/></svg>',
      plug: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4"><rect x="4.6" y="4.6" width="6.8" height="6.8" rx="1.4"/><path d="M6.4 1.8v2.8M9.6 1.8v2.8M6.4 11.4v2.8M9.6 11.4v2.8M1.8 6.4h2.8M1.8 9.6h2.8M11.4 6.4h2.8M11.4 9.6h2.8"/></svg>',
      grid: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4"><rect x="2.4" y="2.4" width="4.6" height="4.6" rx="1.2"/><rect x="9" y="2.4" width="4.6" height="4.6" rx="1.2"/><rect x="2.4" y="9" width="4.6" height="4.6" rx="1.2"/><rect x="9" y="9" width="4.6" height="4.6" rx="1.2"/></svg>',
      web: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M2 8h12M8 1.8c1.8 2 2.6 4 2.6 6.2S9.8 12.2 8 14.2C6.2 12.2 5.4 10.2 5.4 8S6.2 3.8 8 1.8z"/></svg>',
      more: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4"><circle cx="3.4" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.6" cy="8" r="1.1" fill="currentColor" stroke="none"/></svg>',
      chev: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.7"><path d="M6 3.5L10.5 8 6 12.5"/></svg>',
      chevDown: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.7"><path d="M3.5 6L8 10.5 12.5 6"/></svg>',
      /* #3 — the hover panel opens UPWARDS, so its affordance is an up chevron. */
      chevUp: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.7"><path d="M3.5 10L8 5.5 12.5 10"/></svg>',
      /* 「对话」 is its own row now, so it gets its own icon: a chat bubble, not
         the right-pointing chevron that read as "more options". */
      /* R47 — the 对话 row now wears the FULL Host glyph (primitives
         IconNewChatOutline16, plus included): a solid speech bubble reads far
         better than the thin outline the user called ugly. The SECOND-level rows
         keep the outline-only bubble (chatLine below), so the child icon is
         visibly different from its parent — which is exactly what was asked. */
      chat: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M8.00003 0.3237C3.76075 0.3237 0.32373 3.76072 0.32373 8C0.32373 9.17603 0.589121 10.2922 1.0632 11.2901L1.35291 11.8989L2.5705 11.3205L2.28079 10.7117C1.89079 9.89074 1.67301 8.97167 1.67301 8C1.67301 4.50546 4.50549 1.67298 8.00003 1.67298C11.4946 1.67298 14.3271 4.50546 14.3271 8C14.3271 11.4945 11.4946 14.327 8.00003 14.327C7.28473 14.327 6.76077 14.277 6.29621 14.1487C5.83857 14.0224 5.40441 13.8109 4.88514 13.4488C4.12569 12.919 3.03778 12.7316 2.141 13.2978L2.12682 13.307L2.11264 13.3171L1.34886 13.854L1.79659 15.188L2.86122 14.4384C3.19068 14.2305 3.68325 14.2542 4.11326 14.5539C4.72789 14.9826 5.30042 15.2724 5.93762 15.4484C6.56803 15.6224 7.22776 15.6763 8.00003 15.6763C12.2393 15.6763 15.6763 12.2393 15.6763 8C15.6763 3.76072 12.2393 0.3237 8.00003 0.3237ZM7.32033 4.82535V7.32536H4.82538V8.67464H7.32033V11.1747H8.6696V8.67464H11.1747V7.32536H8.6696V4.82535H7.32033Z" fill="currentColor"/>' +
        '</svg>',
      /* R48 — the user pointed at this exact glyph for the second-level 对话 rows
         (a ring bubble with two text bars inside), in the SAME colour as the
         first level — explicitly NOT the brand blue. Drawn with currentColor, so
         it inherits like every other row icon. */
      chatLine: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M8 1.4c3.65 0 6.6 2.72 6.6 6.08 0 3.36-2.95 6.08-6.6 6.08-.72 0-1.42-.1-2.06-.3-.5.36-1.2.66-2.03.78.42-.5.66-1.06.72-1.6C3.1 11.5 2.2 10.02 2.2 8.3 2.2 4.94 4.35 1.4 8 1.4Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>' +
        '<path d="M5.6 7.1h4.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
        '<path d="M5.6 9.4h2.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
        '</svg>',
      search: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.5"><circle cx="7.2" cy="7.2" r="4.6"/><path d="M10.6 10.6L14 14"/></svg>',
      /* R6a — a REAL eye, not the word 可见/屏蔽. Sizes are explicit: an
         unsized <svg viewBox> renders as a 300x150 replaced element here. */
      eye: '<svg width="14" height="14" viewBox="0 0 16 16" ' + S + ' stroke-width="1.4"><path d="M1.4 8s2.6-4.4 6.6-4.4S14.6 8 14.6 8s-2.6 4.4-6.6 4.4S1.4 8 1.4 8z"/><circle cx="8" cy="8" r="1.9"/></svg>',
      eyeOff: '<svg width="14" height="14" viewBox="0 0 16 16" ' + S + ' stroke-width="1.4"><path d="M2.3 8.4S4.6 4.4 8 4.4c1 0 1.9.3 2.7.8M13.7 7.6S11.4 11.6 8 11.6c-1 0-1.9-.3-2.7-.8"/><path d="M2.6 2.6l10.8 10.8"/></svg>'
    };

    /**
     * The icon for one browsing tab.
     *
     * Edge's HTTP /json/list does NOT carry favIconUrl — verified against a
     * live Edg/153 endpoint, whose entries are only
     * description/devtoolsFrontendUrl/id/title/type/url/webSocketDebuggerUrl
     * (favicons need the CDP Target.getTargets protocol method instead). So
     * falling back to the site's own /favicon.ico is the NORMAL path here, not
     * an edge case, and the lettered tile covers hosts that publish none.
     * @param tab - a tab record from the host route.
     * @returns inline HTML for the icon slot.
     */
    const HTML_ESCAPES = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    };

    /**
     * Escape a value for HTML attribute and text positions.
     *
     * SECURITY: tab records arrive over a non-credentialed local HTTP route, so
     * favIconUrl and host are attacker-influenced strings. Every value this
     * module feeds to dangerouslySetInnerHTML must pass through here first —
     * without it a favIconUrl of  x" onerror="...  closes the src attribute and
     * runs script in the GUI origin, which can reach the agent API.
     * @param value - any value.
     * @returns an HTML-safe string.
     */
    function escHtml (value) {
      return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
    }

    /**
     * Allow-list the schemes an icon may use.
     *
     * Escaping alone still lets an attacker aim the icon at an arbitrary remote
     * URL (a beacon), and script-capable data: URIs are not worth the risk for
     * a favicon, so only inert image sources survive.
     * @param value - the candidate favIconUrl.
     * @returns a usable URL, or '' when it must not be rendered.
     */
    function safeIconSource (value) {
      const text = String(value).trim();
      if (text === '') return '';
      /* R7a — protocol-relative is what most sites hand the browser
         (//www.bilibili.com/favicon.ico). Rejecting it is exactly why those rows
         fell through to the first-letter badge while the Edge ones rendered
         ("微软的显示正常，但是哔哩哔哩的显示的却不正常"). */
      if (/^\/\//.test(text)) return 'https:' + text;
      if (/^https?:\/\//i.test(text)) return text;
      /* An SVG favicon is inert inside <img>: images never run script, so this
         is not a script-capable scheme. Sites that ship one were also falling
         through. */
      if (/^data:image\/(png|jpe?g|gif|webp|bmp|x-icon|vnd\.microsoft\.icon|svg\+xml);/i.test(text)) return text;
      /* The tab-bridge extension may point at its own packaged asset. */
      if (/^chrome-extension:\/\/[a-z]{32}\//i.test(text)) return text;
      return '';
    }

    /** 字母牌上写什么字。
     *
     * R31 起**不再使用**：字母牌本身在暗色主题下就是一块白色小方块
     * （底色 '--dsw-alias-interactive-bg-hover' 是浅色），而且 IP / localhost
     * 只能算出「1」这种没意义的字。现在失败图标一律换成无底色的 'ICON.web'。
     * 这个函数保留只是为了别的地方（或历史调用）不炸。 */
    function iconLetter (tab, host) {
      const local = host === '' || /^\d/.test(host) || /^localhost/i.test(host);
      const source = local ? String(tab.title ?? '') : host;
      const cleaned = String(source).replace(/[^0-9A-Za-z\u4e00-\u9fa5]/g, '');
      return (cleaned.charAt(0) || '?').toUpperCase();
    }

    /* ------------------------------------------------------------------ *
     * 自适应图标（B 方案）—— 「白图标在浅色模式下看不见」的根治。
     *
     * 「白色模式下，像 GitHub 这样的原生白色的图标就混在一起
     * 看不到了，可不可以做自适应图标保证白色模式它变颜色可以看出来，比如黑色」。
     *
     * 为什么不能就地读像素：站点 favicon 是**跨源图片**，直接 <img src> 画进
     * canvas 会污染画布 ⇒ getImageData 抛 SecurityError。所以图先过一遍本插件
     * 的**同源**前缀 /composer-launcher/favicon（host 半边，进程内缓存），
     * 同源之后画布可读，16x16 一次 drawImage + getImageData 就是**亚毫秒**级，
     * 没有任何额外往返：浏览器本来就只发这一次图片请求（原来是直接打站点，
     * 现在是打当前机器代理，代理再打站点）。
     *
     * 判定是记忆化的：TONE_CACHE 按 src 存结论，行 HTML 重建时（每次开菜单都会
     * 重建）直接把 data-tone/data-flip 写进标签，于是重复打开**没有闪一下**的
     * 过程，第一帧就是对的颜色。
     * ------------------------------------------------------------------ */
    const TONE_CACHE = new Map();

    /** 把站点图片换成同源代理地址；非 http(s)（data: / chrome-extension:）原样用。 */
    function iconProxy (source) {
      if (!/^https?:\/\//i.test(source)) return source;
      return ROUTE + '/favicon?u=' + encodeURIComponent(source);
    }

    /** 现在是不是浅色主题。
     *
     * 判据抄 DSH 自己那一套（Electron 主进程的 applyWindowChromeTheme）：
     * body[data-ds-dark-theme] 优先，否则按 body 背景色亮度分档 —— 不依赖任何
     * token 的取值格式（oklch()/color-mix() 解析不了，但 getComputedStyle 的
     * backgroundColor 一定是 rgb()/rgba()）。 */
    function themeIsLight () {
      try {
        const body = document.body;
        if (body !== null && body !== undefined) {
          if (typeof body.hasAttribute === 'function' && body.hasAttribute('data-ds-dark-theme')) return false;
          if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            const channels = String(window.getComputedStyle(body).backgroundColor).match(/[\d.]+/g);
            /* 四个通道 = rgba：alpha 为 0 说明这一层是透明的，亮度没有意义。 */
            if (channels !== null && channels.length >= 3 &&
                !(channels.length >= 4 && Number(channels[3]) === 0)) {
              const lum = Number(channels[0]) * 0.2126 + Number(channels[1]) * 0.7152 + Number(channels[2]) * 0.0722;
              return lum >= 128;
            }
          }
        }
      } catch (error) { /* 读不到就退回系统偏好 */ }
      return !(typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches === true);
    }

    /** 这张图标在当前主题下要不要反色；不需要返回 ''。
     * light（浅色图标）+ 浅色主题 ⇒ 'dark'；dark + 暗色主题 ⇒ 'light'。 */
    function flipFor (tone) {
      if (tone !== 'light' && tone !== 'dark') return '';
      const lightTheme = themeIsLight();
      if (tone === 'light' && lightTheme) return 'dark';
      if (tone === 'dark' && !lightTheme) return 'light';
      return '';
    }

    /** 把判定结果写到 img 上（data-tone + data-flip 两个属性，CSS 负责画）。 */
    function applyIconTone (img, tone) {
      img.setAttribute('data-tone', tone);
      const flip = flipFor(tone);
      if (flip === '') img.removeAttribute('data-flip');
      else img.setAttribute('data-flip', flip);
    }

    /** 量一张已加载 favicon 的"明暗"。见上面那段说明。
     * @param img - 那个已经 data-ok 的 .dcl-favi 元素。 */
    function dclIconTone (img) {
      if (img === null || img === undefined || typeof img.getAttribute !== 'function') return;
      if (img.getAttribute('data-tone') !== null) return;
      const src = img.getAttribute('src') === null ? '' : String(img.getAttribute('src'));
      const memo = TONE_CACHE.get(src);
      if (memo !== undefined) { applyIconTone(img, memo); return; }
      let tone = 'unknown';
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
        if (ctx !== null && ctx !== undefined && typeof ctx.drawImage === 'function') {
          ctx.clearRect(0, 0, 16, 16);
          /* 缩到 16x16 采样：颜色不变，图形被压扁对"亮不亮"没有影响，
             所以没有内禀尺寸的 SVG 也能算。 */
          ctx.drawImage(img, 0, 0, 16, 16);
          const data = ctx.getImageData(0, 0, 16, 16).data;
          let weight = 0;
          let sum = 0;
          let opaque = 0;
          let light = 0;
          let dark = 0;
          for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha < 24) continue;
            opaque += 1;
            const ratio = alpha / 255;
            const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
            weight += ratio;
            sum += lum * ratio;
            if (lum > 0.78) light += 1;
            if (lum < 0.25) dark += 1;
          }
          const mean = weight > 0 ? sum / weight : 0;
          if (opaque === 0) tone = 'empty';
          else if (mean > 0.72 && light / opaque > 0.55) tone = 'light';
          else if (mean < 0.28 && dark / opaque > 0.55) tone = 'dark';
          else tone = 'mixed';
        }
      } catch (error) {
        /* 画布被污染 / jsdom 里没有 2d 上下文 ⇒ 交给双描边兜底。 */
        tone = 'unknown';
      }
      TONE_CACHE.set(src, tone);
      applyIconTone(img, tone);
    }

    if (typeof window !== 'undefined') window.__dclTone = dclIconTone;

    function tabIcon (tab) {
      const host = typeof tab.host === 'string' ? tab.host : '';
      const origin = (/^\d/.test(host) || /^localhost/i.test(host) ? 'http' : 'https') + '://' + host;
      const candidates = [];
      const declared = safeIconSource(typeof tab.favIconUrl === 'string' ? tab.favIconUrl : '');
      /* （自适应图标）：所有候选都换成**同源代理**地址 —— 显示的那张
         就是被采样的那张，只有一次网络请求；跨源的老写法画布读不了像素。 */
      if (declared !== '') candidates.push(iconProxy(declared));
      if (host !== '') {
        candidates.push(iconProxy(origin + '/favicon.ico'));
        candidates.push(iconProxy(origin + '/favicon.png'));
      }
      if (candidates.length === 0) return ICON.web;
      /* R15 — a CHAIN, not one shot. The declared favicon is frequently on a CDN
         that refuses foreign Referers (bilibili's real URL is
         https://i0.hdslb.com/bfs/static/jinkela/long/images/favicon.ico and it
         403s here), and the row then fell all the way to the first letter
         ("哔哩哔哩还是 w"). referrerpolicy=no-referrer dodges the common
         hotlink rule, and onerror walks to the next candidate before giving up.
         R31 — **图片默认必须可见**（和最早一样），失败才换成中性图标。
         R29 我把 img 默认改成 display:none 是错的：loading=lazy 的图片在
         display:none 的子树里**根本不会被请求** ⇒ onload 永远不触发 ⇒
         所有行都变成字母牌（：「你现在一修所有都是字母了」）。
         另外字母牌 .dcl-fb 用 --dsw-alias-interactive-bg-hover 当底色，
         暗色主题下那块就是**白色小方块**（反复给的那个）。
         ⇒ 回退：img 可见；失败时换成一个**无底色**的通用网页图标（currentColor），
           不写字、不铺底，明暗主题都不会变成白块。 */
      /* R32 — 兜底图标**默认可见**，压在它下面的位置永远有人。
         历史：R29 把 img 默认 display:none ⇒ loading=lazy 的图片在被隐藏的子树里
         根本不会被请求，onload 永不触发，所有行都变成字母牌；R31 改成"img 默认可见、
         onerror 才换兜底"，又留下新洞 —— **加载期间那一格是空的**，加载失败也没有兜底
         （CDP 实测：三行 img 全是 complete:false/naturalWidth:0，
          .dcl-fb 是 display:none ⇒ 看到的"空白"）。R32 两者都不要：
         img 不再 lazy、初始 opacity:0 但**照常发起请求**，onload 才露出来；
         兜底图标 absolute 垫在下面，任何情况下那一格都不会空。 */
      /* 已经量过的那张图：**第一帧就写对颜色**，不用等 onload 再翻（重复开菜单
         时不会有"先看不见、再变黑"的一闪）。 */
      const known = TONE_CACHE.get(candidates[0]);
      const preTone = known === undefined
        ? ''
        : ' data-tone="' + known + '"' + (flipFor(known) === '' ? '' : ' data-flip="' + flipFor(known) + '"');
      return '<img class="dcl-favi" src="' + escHtml(candidates[0]) + '"' + preTone + ' alt="" ' +
        'data-dcl-alt="' + escHtml(candidates.slice(1).join('|')) + '" ' +
        'onload="this.setAttribute(\'data-ok\',\'1\');' +
        'if(window.__dclTone){window.__dclTone(this)}" ' +
        'onerror="var n=this.getAttribute(\'data-dcl-alt\')||\'\';' +
        'if(n){var p=n.split(\'|\');this.setAttribute(\'data-dcl-alt\',p.slice(1).join(\'|\'));this.src=p[0];}' +
        'else{this.style.display=\'none\';}">' +
        '<span class="dcl-fb">' + ICON.web + '</span>';
    }

    /* ------------------------------------------------------------------ *
     * F4 — the tab row's data contract.
     *
     * DISPLAY truncation is CSS ellipsis and nothing else: the row's width is
     * the composer CARD's width (menuBox measures it), and that width moves
     * with the window and the side panel — so any character budget would be
     * wrong half the time (either a visible gap or a string that already
     * overflowed before it was cut). These caps are the DATA layer only: they
     * bound the strings we keep and copy (chip label, native title, draft
     * line), never what the row paints.
     * ------------------------------------------------------------------ */
    const TAB_NAME_MAX = 80;
    const TAB_HOST_MAX = 60;

    /** Bound a string, keeping the ellipsis INSIDE the budget. */
    function clampText (value, max) {
      const text = String(value === undefined || value === null ? '' : value);
      return text.length <= max ? text : text.slice(0, max - 1) + '…';
    }

    function tabName (tab) { return clampText(tab.title, TAB_NAME_MAX); }
    function tabHost (tab) { return clampText(tab.host, TAB_HOST_MAX); }
    function tabBrowser (tab) {
      return typeof tab.browser === 'string' ? clampText(tab.browser, 24) : '';
    }

    /** The row's last slot: '· Edge', or nothing when the record has no
     *  browser (an older extension push, or a hand-rolled route caller). */
    function tabTrailing (tab) {
      const name = tabBrowser(tab);
      return name === '' ? undefined : h('span', { className: 'dcl-br' }, '· ' + name);
    }

    /* ------------------------------------------------------------------ *
     * Copy helper — language follows the DSH interface language
     *
     * Resolution order for the copy, first hit wins:
     *   the active language's own table -> en -> the key itself. So t() can
     *   never return undefined and can never throw, whatever "active" says.
     * ------------------------------------------------------------------ */
    const COPY_LANGUAGES = ['zh', 'en'];
    const DICTS = {};
    function registerLanguage (id, table) {
      const key = typeof id === 'string' ? id.trim().toLowerCase() : '';
      if (key === '' || !table) { return false; }
      if (COPY_LANGUAGES.indexOf(key) === -1) { COPY_LANGUAGES.push(key); }
      DICTS[key] = table;
      return true;
    }
    registerLanguage('zh', ZH);
    registerLanguage('en', EN);
    function copyDict (lang) {
      const key = typeof lang === 'string' ? lang.trim().toLowerCase() : '';
      if (Object.prototype.hasOwnProperty.call(DICTS, key)) { return DICTS[key]; }
      return EN;
    }
    /* The page language DSH itself keeps in sync (dsh-client-locale does
       `document.documentElement.lang = active === 'zh' ? 'zh-CN' : active`),
       so the DOM is a true mirror of the interface language, not a guess. */
    function normalizeLang (raw) {
      if (typeof raw !== 'string') { return null; }
      const tag = raw.trim().toLowerCase();
      if (tag === '') { return null; }
      /* A language this plugin actually ships copy for keeps its own tag, so
         registering one (registerLanguage) is all it takes to switch to it. */
      if (Object.prototype.hasOwnProperty.call(DICTS, tag)) { return tag; }
      return tag === 'zh' || tag.indexOf('zh-') === 0 || tag.indexOf('zh_') === 0 ? 'zh' : 'en';
    }
    function langFromDom () {
      return typeof document === 'undefined' || !document.documentElement
        ? null
        : normalizeLang(document.documentElement.lang);
    }
    function localeServiceActive () {
      if (rootContext === undefined) { return null; }
      let service;
      try { service = rootContext.get('locale'); } catch (err) { return null; }
      if (!service) { return null; }
      /* Current contract: getLocale() -> { active, locales, revision }. Also
         tolerate a bare snapshot object, so a contract change degrades to
         "unreadable" instead of throwing. */
      let snapshot;
      try {
        snapshot = typeof service.getLocale === 'function' ? service.getLocale() : service;
      } catch (err) { return null; }
      return snapshot && typeof snapshot.active === 'string' ? normalizeLang(snapshot.active) : null;
    }
    /* The service is created by apply(), the first t() call happens during
       render, so reading it at call time is what keeps this correct without
       subscribing to anything. */
    function currentLang () {
      return localeServiceActive() || langFromDom()
        || normalizeLang(typeof navigator === 'undefined' ? '' : navigator.language) || 'en';
    }
    function t (key, vars) {
      const lang = currentLang();
      const own = copyDict(lang);
      /* own table -> en -> the key itself: a registered table may be partial
         (a future language is not obliged to translate every row), and the key
         fallback is what keeps a missing row from rendering as "undefined". */
      const base = typeof own[key] === 'string'
        ? own[key]
        : (typeof EN[key] === 'string' ? EN[key] : key);
      let text = base;
      if (vars) {
        for (const name of Object.keys(vars)) {
          text = text.split('{' + name + '}').join(String(vars[name]));
        }
      }
      return text;
    }
    /* Repaint every mounted launcher when the interface language changes.
       storeFor() is safe to call here: this only ever runs after the module
       body finished evaluating. */
    function retranslate () {
      try { storeFor('settings').emit(); } catch (err) { /* store not up yet */ }
      try {
        const sessions = globalThis[SESSIONS_KEY];
        if (sessions && typeof sessions.forEach === 'function') {
          sessions.forEach((entry) => { entry.emit(); });
        }
      } catch (err) { /* ignore */ }
    }
    /* How each shipped language is named in a language picker. A new language
       registered through registerLanguage() shows up by its own tag. */
    const COPY_LANGUAGE_LABELS = { zh: '中文', en: 'English' };
    /* Offer this plugin's languages to the locale service, so a language the
       service does not ship yet can still be selected — and so the language
       row can list it. Optional by design: every failure (older service, an
       id the service already owns, a throwing implementation) is swallowed,
       because losing this must never cost the plugin its mount. */
    function announceLanguages (service) {
      if (typeof service.addLanguage !== 'function') { return; }
      const known = {};
      try {
        const snapshot = typeof service.getLocale === 'function' ? service.getLocale() : service;
        const locales = snapshot && snapshot.locales;
        if (locales) {
          for (const id of Object.keys(locales)) { known[id.trim().toLowerCase()] = true; }
        }
      } catch (err) { /* unreadable snapshot: try every id, the service decides */ }
      for (const id of COPY_LANGUAGES) {
        /* Re-registering an id the service owns throws by contract, so skip
           the ones it already lists (zh and en, in the shipped service). */
        if (Object.prototype.hasOwnProperty.call(known, id)) { continue; }
        const label = Object.prototype.hasOwnProperty.call(COPY_LANGUAGE_LABELS, id) ? COPY_LANGUAGE_LABELS[id] : id;
        try {
          service.addLanguage({ id, label, fallback: 'en' });
        } catch (err) { /* already registered, or not a language the service takes */ }
      }
    }
    function languageWatcher (ctx) {
      const service = ctx === undefined || ctx === null ? null : ctx.get('locale');
      if (service && typeof service.subscribe === 'function') {
        /* Preferred source: fires even when <html lang> did not change (two
           locales that collapse to the same tag, or a future tag scheme). */
        service.subscribe(retranslate);
        announceLanguages(service);
        return undefined;
      }
      /* No locale service: the DOM tag is the only live signal there is. */
      if (typeof MutationObserver !== 'function' || typeof document === 'undefined') {
        return undefined;
      }
      const observer = new MutationObserver(retranslate);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      return () => { observer.disconnect(); };
    }

    /* ------------------------------------------------------------------ *
     * C1 / C2 / C3 / E1 / E2 — tooltip, status dots, semantic icons
     *
     * All of it rides ONE extra stylesheet appended on demand (ensureExtraStyles)
     * instead of the main sheet, and every helper here is PURE at module-eval
     * time: nothing touches the DOM until a component or apply() calls it. That
     * matters: an unresolvable dependency or a top-level DOM access is exactly
     * what made the previous generation fail to mount in the real client while
     * jsdom stayed green.
     * ------------------------------------------------------------------ */
    const EXTRA_STYLE_ID = 'dcl-extra-style';
    const EXTRA_CSS = [
      /* C1 — the framework's own tooltip numbers (primitives Tooltip.module.css):
         3px 7px padding, 8px radius, 13px/20px, 150ms var(--ds-ease-in-out). */
      '.dcl-tip{position:fixed;z-index:200;width:max-content;max-width:50vw;padding:3px 7px;',
      'border-radius:8px;background:var(--dsw-alias-tooltip-bg);',
      'color:var(--dsw-static-neutral-bluish-00);font-size:13px;line-height:20px;',
      'white-space:pre-line;overflow-wrap:break-word;pointer-events:none;',
      'box-shadow:0 4px 16px rgba(0,0,0,.18);animation:dclTipIn 150ms var(--ds-ease-in-out)}',
      '@keyframes dclTipIn{from{opacity:0}}',
      '@media (prefers-reduced-motion: reduce){.dcl-tip{animation:none}}',
      /* C2 / E1 / E2 — GREEN on, GREY off, RED broken. */
      '.dcl-sdot-wrap{display:inline-flex;align-items:center;justify-content:center;',
      'width:16px;height:16px;flex:none;border-radius:50%;corner-shape:round}',
      '.dcl-sdot-wrap:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:1px}',
      '.dcl-sdot{width:8px;height:8px;border-radius:50%;corner-shape:round;display:block;flex:none}',
      '.dcl-sdot-on{background:var(--dsw-alias-state-success-primary,#2ea043)}',
      '.dcl-sdot-off{background:var(--dsw-alias-label-caption,#9aa0a6);opacity:.55}',
      '.dcl-sdot-bad{background:var(--dsw-alias-state-error-primary,#e5484d)}',
      /* R7b — the per-package identity badge (see badgeIcon). */
      '.dcl-badge{width:16px;height:16px;border-radius:5px;corner-shape:round;display:grid;',
      'place-items:center;font-size:9px;font-weight:700;line-height:1;',
      'background:hsl(var(--dcl-h,220) 62% 50% / .22);color:hsl(var(--dcl-h,220) 70% 66%)}'
    ].join('');

    function ensureExtraStyles () {
      if (document.getElementById(EXTRA_STYLE_ID) !== null) return;
      const style = document.createElement('style');
      style.id = EXTRA_STYLE_ID;
      style.textContent = EXTRA_CSS;
      document.head.appendChild(style);
    }

    /* C3 — by PURPOSE, not one shared glyph: a review plugin draws the
       magnifier-and-check, a container plugin the box. Unmatched names keep
       ICON.plug, so nothing loses an icon it did not earn. */
    const EXTRA_ICON = {
      review: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4" width="16" height="16"><circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4L14 14"/><path d="M5.2 7.1l1.4 1.4 2.6-2.8"/></svg>',
      shield: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4" width="16" height="16"><path d="M8 1.8l4.8 1.7v4c0 3-2 5.2-4.8 6.7C5.2 12.7 3.2 10.5 3.2 7.5v-4z"/><path d="M6 7.8l1.5 1.5 3-3.2"/></svg>',
      graph: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4" width="16" height="16"><circle cx="3.6" cy="4" r="1.8"/><circle cx="12.4" cy="5.2" r="1.8"/><circle cx="7.6" cy="12.4" r="1.8"/><path d="M5.2 5l5.6.6M4.4 5.6l2.5 5.2M11.6 6.7l-3 4"/></svg>',
      box: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4" width="16" height="16"><rect x="2.2" y="4.6" width="11.6" height="7.2" rx="1.2"/><path d="M4.4 4.6V2.8M7 4.6V2.8M9.6 4.6V2.8M12.2 4.6V2.8"/></svg>',
      key: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4" width="16" height="16"><circle cx="5.6" cy="5.6" r="3.2"/><path d="M7.9 7.9L13.4 13.4M11 10.9l1.5-1.5M12.6 12.5l1.4-1.4"/></svg>',
      doc: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4" width="16" height="16"><path d="M3.4 1.8h5.6l3.6 3.6v8.8H3.4z"/><path d="M9 1.8v3.6h3.6"/><path d="M5.4 8.6h5.2M5.4 11h5.2"/></svg>',
      gear: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4" width="16" height="16"><circle cx="8" cy="8" r="2.4"/><path d="M8 1.6v2.2M8 12.2v2.2M1.6 8h2.2M12.2 8h2.2M3.5 3.5l1.6 1.6M10.9 10.9l1.6 1.6M12.5 3.5l-1.6 1.6M5.1 10.9l-1.6 1.6"/></svg>',
      brain: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4" width="16" height="16"><path d="M8 3.2C7 2 4.6 2.2 3.8 4c-.9.4-1.4 1.3-1.4 2.3 0 .7.3 1.3.7 1.7-.4.5-.7 1.1-.7 1.9 0 1.4 1.1 2.4 2.4 2.4.5 0 .9-.1 1.3-.4.4 1 1.1 1.6 2.1 1.9V3.2z"/><path d="M8 3.2c1-1.2 3.4-1 4.2.8.9.4 1.4 1.3 1.4 2.3 0 .7-.3 1.3-.7 1.7.4.5.7 1.1.7 1.9 0 1.4-1.1 2.4-2.4 2.4-.5 0-.9-.1-1.3-.4-.4 1-1.1 1.6-2.1 1.9V3.2z"/></svg>',
      db: '<svg viewBox="0 0 16 16" ' + S + ' stroke-width="1.4" width="16" height="16"><ellipse cx="8" cy="3.8" rx="5.2" ry="2"/><path d="M2.8 3.8v8.4c0 1.1 2.3 2 5.2 2s5.2-.9 5.2-2V3.8"/><path d="M2.8 8c0 1.1 2.3 2 5.2 2s5.2-.9 5.2-2"/></svg>'
    };

    /* Ordered: the narrow purposes win over the broad ones. */
    const ICON_RULES = [
      [/review|squad|inspector/, 'review'],
      [/semgrep|sast|security|audit|vuln/, 'shield'],
      [/codegraph|graph|callers|impact|symbol/, 'graph'],
      [/docker|container|compose|k8s/, 'box'],
      [/vault|secret|credential|key|token/, 'key'],
      [/univer|office|docx|pptx|xlsx|chat-import|handoff/, 'doc'],
      [/jenkins|\bci\b|build|pipeline|github/, 'gear'],
      [/engram|memory|recall|context|lens/, 'brain'],
      [/sql|database|\bdb\b|mysql|postgres/, 'db'],
      [/pilot|browser|edge|cdp|computer|wsl|terminal/, 'web']
    ];

    /** R7b — a stable, per-package identity badge.
     *
     * The host publishes no plugin logo, so an unmatched package gets its OWN
     * letter in its OWN colour instead of one shared plug glyph for every row
     * ("这些UI上面显示的最左边应该显示的都是自己实时的图标…但是现在都是统一
     的"). The hue is derived from the name, so the same plugin always looks the
     same and two plugins never look alike by accident. */
    function badgeIcon (name) {
      const text = String(name === undefined || name === null ? '' : name);
      const bare = text.split('/').pop().replace(/^dsh-/, '');
      const letter = (bare.replace(/[^A-Za-z0-9]/g, '').charAt(0) || '?').toUpperCase();
      let hash = 0;
      for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
      const hue = Math.abs(hash) % 360;
      return '<span class="dcl-badge" style="--dcl-h:' + hue + '">' + escHtml(letter) + '</span>';
    }

    function iconFor (name) {
      const text = String(name === undefined || name === null ? '' : name).toLowerCase();
      for (const rule of ICON_RULES) {
        if (rule[0].test(text)) {
          const glyph = EXTRA_ICON[rule[1]] === undefined ? ICON[rule[1]] : EXTRA_ICON[rule[1]];
          if (glyph !== undefined) return glyph;
        }
      }
      return badgeIcon(name);
    }

    /* C1 — one bubble, and no native title survives inside our subtrees. */
    const TIP_OFFSET = 4;
    const TIP_SCOPE = '.dcl-menu,.dcl-railbox,.dcl-resize,.dcl-webhov,.dcl-tip';
    let tipNode = null;
    let tipAnchor = null;

    function tipEnsure () {
      if (tipNode !== null && document.body.contains(tipNode)) return tipNode;
      tipNode = document.createElement('div');
      tipNode.className = 'dcl-tip';
      tipNode.setAttribute('data-dcl-tip-node', '1');
      tipNode.setAttribute('role', 'tooltip');
      tipNode.style.display = 'none';
      document.body.appendChild(tipNode);
      return tipNode;
    }

    function tipPlace (anchor) {
      const node = tipEnsure();
      const a = anchor.getBoundingClientRect();
      const n = node.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let side = 'top';
      let top = a.top - n.height - TIP_OFFSET;
      if (top < 4) { side = 'bottom'; top = a.bottom + TIP_OFFSET; }
      if (top + n.height > vh - 4) top = Math.max(4, vh - n.height - 4);
      let left = a.left + (a.width - n.width) / 2;
      if (left + n.width > vw - 4) left = vw - n.width - 4;
      if (left < 4) left = 4;
      node.style.top = Math.round(top) + 'px';
      node.style.left = Math.round(left) + 'px';
      node.setAttribute('data-side', side);
    }

    function showTip (anchor, text) {
      if (anchor === null || anchor === undefined) return;
      const body = text === undefined || text === null ? '' : String(text);
      if (body === '') return;
      ensureExtraStyles();
      const node = tipEnsure();
      if (node.textContent !== body) node.textContent = body;
      tipAnchor = anchor;
      node.style.display = '';
      node.style.animation = 'none';
      void node.getBoundingClientRect();
      node.style.animation = '';
      tipPlace(anchor);
    }

    function hideTip () {
      tipAnchor = null;
      if (tipNode !== null) tipNode.style.display = 'none';
    }

    function tipReposition () {
      if (tipAnchor === null) return;
      if (!document.body.contains(tipAnchor)) { hideTip(); return; }
      tipPlace(tipAnchor);
    }

    function tipHandlers (text) {
      const body = () => String(text === undefined || text === null ? '' : text);
      return {
        onMouseEnter: (event) => showTip(event.currentTarget, body()),
        onMouseLeave: hideTip,
        onFocus: (event) => showTip(event.currentTarget, body()),
        onBlur: hideTip,
        onKeyDown: (event) => { if (event.key === 'Escape') hideTip(); }
      };
    }

    /**
     * C1 — retire every native 'title' inside our subtrees and answer the hover
     * with the bubble instead. Scoped by TIP_SCOPE so host markup keeps its own.
     * The text survives as data-dcl-tip (and as aria-label when the element had
     * none), so nothing loses its description — only the browser's grey box.
     */
    function installTitleBridge () {
      const observers = [];
      const adopt = (node) => {
        if (!(node instanceof Element)) return;
        const scope = node.matches(TIP_SCOPE) ? node : node.closest(TIP_SCOPE);
        if (scope === null) return;
        const targets = [];
        if (node.hasAttribute('title')) targets.push(node);
        for (const el of scope.querySelectorAll('[title]')) targets.push(el);
        for (const el of targets) {
          const text = el.getAttribute('title');
          if (text === null || text === '') continue;
          el.removeAttribute('title');
          el.setAttribute('data-dcl-tip', text);
          if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-describedby')) {
            el.setAttribute('aria-label', text);
          }
        }
      };
      adopt(document.body);
      const Observer = typeof window.MutationObserver === 'function' ? window.MutationObserver : null;
      if (Observer !== null) {
        const observer = new Observer((records) => {
          for (const record of records) {
            if (record.type === 'attributes') adopt(record.target);
            for (const node of record.addedNodes) adopt(node);
          }
        });
        observer.observe(document.body, {
          childList: true, subtree: true, attributes: true, attributeFilter: ['title']
        });
        observers.push(observer);
      }
      const anchorOf = (target) => (target instanceof Element ? target.closest('[data-dcl-tip]') : null);
      const onOver = (event) => {
        const el = anchorOf(event.target);
        if (el === null) { hideTip(); return; }
        showTip(el, el.getAttribute('data-dcl-tip'));
      };
      const onOut = (event) => {
        const el = anchorOf(event.target);
        if (el === null) return;
        if (event.relatedTarget !== null && el.contains(event.relatedTarget)) return;
        hideTip();
      };
      const onFocusIn = (event) => {
        const el = anchorOf(event.target);
        if (el !== null) showTip(el, el.getAttribute('data-dcl-tip'));
      };
      document.addEventListener('mouseover', onOver, true);
      document.addEventListener('mouseout', onOut, true);
      document.addEventListener('focusin', onFocusIn, true);
      document.addEventListener('focusout', hideTip, true);
      window.addEventListener('scroll', tipReposition, true);
      window.addEventListener('resize', tipReposition);
      return () => {
        for (const observer of observers) observer.disconnect();
        document.removeEventListener('mouseover', onOver, true);
        document.removeEventListener('mouseout', onOut, true);
        document.removeEventListener('focusin', onFocusIn, true);
        document.removeEventListener('focusout', hideTip, true);
        window.removeEventListener('scroll', tipReposition, true);
        window.removeEventListener('resize', tipReposition);
        hideTip();
      };
    }

    /* C2 / E1 / E2 — status dots. The map holds copy KEYS, not copy: t() runs
       where the dot is built, so a language switch repaints a menu that is
       already mounted instead of leaving the old language in its tooltip. */
    const DOT_LABEL_KEY = { on: 'status.on', off: 'status.off', bad: 'status.bad' };

    function statusDot (state, reason) {
      ensureExtraStyles();
      const kind = state === 'on' ? 'on' : (state === 'bad' ? 'bad' : 'off');
      const text = reason === undefined || reason === null || reason === ''
        ? t(DOT_LABEL_KEY[kind])
        : String(reason);
      const props = tipHandlers(text);
      props.className = 'dcl-sdot-wrap';
      props['data-dcl-state'] = kind;
      props.tabIndex = 0;
      return h('span', props, h('span', { className: 'dcl-sdot dcl-sdot-' + kind, 'aria-hidden': 'true' }, null));
    }

    /* E1/E2 — ON is a green dot, OFF is NOTHING AT ALL (原话). */
    function modeDot (on) {
      return on === true ? statusDot('on', t('mode.on')) : undefined;
    }

    /** E2 — DSH's own plan mode, read off its native chip in the card
     *  (<button class="*_chip" aria-label="plan mode 已开启…">Plan</button>
     *  inside <div class="*_modes">, measured on the live GUI). */
    function planModeOn (card) {
      if (card === null || card === undefined) return false;
      const chip = card.querySelector('[class*="_modes"] [class*="_chip"]');
      if (chip === null) return false;
      const label = String(chip.getAttribute('aria-label') || '') + ' ' + String(chip.textContent || '');
      return /plan/i.test(label);
    }

    /**
     * R30 — the Host's plan projection face for one session.
     *
     * The DOM sniff above can only report "a chip is on screen right now": it
     * cannot see a selection queued for the next in-turn pre-step, and it goes
     * blind the moment the Host moves or renames the chip container. The
     * authoritative reader is the projection the Host's OWN chip consumes
     * (dsh-client-ui-plan/lib/client.js:34 useProjection("plan"); its cropped
     * view is exactly { active, pending } — dsh-plan-mode/lib/index.js:116-119).
     *
     * @param ctx - root context.
     * @param sessionId - the session whose composer we mirror.
     * @returns the face store, or null when the projection is unreachable.
     */
    function planFaceOf (ctx, sessionId) {
      try {
        if (sessionId === undefined || sessionId === null || sessionId === '') return null;
        const svc = ctx === undefined || ctx === null ? undefined : ctx.get('sessions');
        if (svc === undefined || svc === null || typeof svc.binding !== 'function') return null;
        const binding = svc.binding(sessionId);
        const session = binding === undefined || binding === null ? undefined : binding.session;
        const projections = session === undefined || session === null ? undefined : session.projections;
        if (projections === undefined || projections === null || typeof projections.faceOf !== 'function') return null;
        const face = projections.faceOf('plan');
        return face === undefined || face === null ? null : face;
      } catch {
        return null;
      }
    }

    /**
     * R30 — the cropped plan view, or null when it is not readable yet.
     * @param ctx - root context.
     * @param sessionId - the session address.
     * @returns { active, pending } or null.
     */
    function planStateOf (ctx, sessionId) {
      const face = planFaceOf(ctx, sessionId);
      if (face === null) return null;
      try {
        const snapshot = typeof face.getSnapshot === 'function' ? face.getSnapshot() : face;
        if (snapshot === undefined || snapshot === null || typeof snapshot.active !== 'boolean') return null;
        return { active: snapshot.active === true, pending: snapshot.pending === true };
      } catch {
        return null;
      }
    }

    /**
     * R30 — whether plan mode is the EFFECTIVE target, by the Host chip's own
     * rule (pending ? !active : active). Falls back to the DOM sniff when the
     * projection is unreachable.
     *
     * @param ctx - root context.
     * @param sessionId - the session address.
     * @param card - the composer card, for the DOM fallback (may be undefined).
     * @returns true/false, or null when neither reader can answer.
     */
    function planModeNow (ctx, sessionId, card) {
      const state = planStateOf(ctx, sessionId);
      if (state !== null) return state.pending ? state.active === false : state.active;
      if (card === undefined) return null;
      return planModeOn(card);
    }

    /* ------------------------------------------------------------------ *
     * Store — one launcher state per session, shared by the two slots.
     *
     * R53 — THE REGISTRY IS PROCESS-GLOBAL, NEVER MODULE-GLOBAL.
     *
     * The rail (conversation.input.dock) and the send interceptor
     * (conversation.input.left) are SEPARATE component trees that must agree on
     * ONE store object per session. A module-scoped Map only guarantees that
     * within ONE evaluation of this bundle: a client-plugin reload re-evaluates
     * the module (minting a NEW Map) and the outgoing plugin's disposer cleared
     * the OLD one. A rail instance that survived the swap therefore keeps
     * rendering the chips of the old store while the new interceptor reads an
     * empty new one. The interceptor then sees chips.length === 0, returns false
     * WITHOUT splicing and WITHOUT clearing, and the Host sends the plain draft:
     * the picked references never ride and the rail stays armed - exactly the
     * reported symptom: the references that were sent never rode the message,
     * while the rail still showed them as armed.
     *
     * Parking the registry on globalThis makes a re-evaluated bundle ADOPT the
     * live registry instead of replacing it, and the unload effect below no
     * longer clears it, so a reload can never orphan a mounted rail.
     * ------------------------------------------------------------------ */
    const SESSIONS_KEY = '__DSH_COMPOSER_LAUNCHER_SESSIONS__';
    const sessions = (() => {
      try {
        const existing = globalThis[SESSIONS_KEY];
        if (existing instanceof Map) return existing;
      } catch {
        /* an unreachable global only costs the cross-reload guarantee */
      }
      const minted = new Map();
      try {
        globalThis[SESSIONS_KEY] = minted;
      } catch {
        /* a frozen global only costs the cross-reload guarantee */
      }
      return minted;
    })();

    function storeFor (sessionId) {
      let entry = sessions.get(sessionId);
      if (entry !== undefined) return entry;
      const listeners = new Set();
      entry = {
        sessionId,
        chips: [],
        /* Goal mode is a LOCAL state field with Codex's exact semantics:
           null = off, '' = armed with no objective yet, a string = the
           objective. The armed test is a null check (goalMode !== null), NOT
           "is the draft empty" — that is what makes the click take effect
           before the user types anything. See GOAL_PLACEHOLDER / applyGoalMode. */
        goalMode: null,
        /* R43 — when the goal row SWITCHED away from plan mode, the plan
           projection lags behind the /plan off command. This stamp opens a
           short window in which the Host sync must not read that stale "plan is
           on" as authoritative and withdraw the goal we just armed. */
        modeSwitchAt: 0,
        view: 'root',
        /* Navigation history for the ← crumb. Every sub-view entrance pushes
           the view it came from, and the arrow pops it — before this the arrow
           was hard-wired to 'root', so a second level could never be left
           "one step at a time" and 回退 did nothing visible. */
        stack: [],
        query: '',
        open: false,
        tabs: [],
        tabsError: null,
        tabState: 'idle',
        tabSource: null,
        plugins: [],
        pluginState: 'idle',
        skills: [],
        skillState: 'idle',
        commands: [],
        commandState: 'idle',
        mcpServers: [],
        mcpState: 'idle',
        mcpError: null,
        mcpAt: 0,
        workspaces: [],
        wsPath: '',
        /* R59 — true only after a HUMAN pick in this menu; an automatic default
           must never masquerade as a user choice. */
        wsPicked: false,
        wsOpen: false,
        pendingRef: null,
        /* R19 — verbatim text waiting to be written into the composer (a
           session reference already carries its own @ grammar). */
        pendingText: null,
        /* R28/R29 — a Host reference INSERTION waiting to become a real chip.
           { source, ref, label, appearance, clipboardText }, exactly the shape
           dsh-client-ui-reference's own onPick returns. */
        pendingChip: null,
        chats: [],
        chatState: 'idle',
        chatError: null,
        wsExclude: [],
        wsServers: [],
        mcpBusy: '',
        /* #3 — the tab row's hover panel. The 180ms leave delay is JS-side so
           moving the pointer from the "…" row into the floated panel does not
           flicker it shut. */
        webHover: false,
        /* E2 — DSH's OWN plan mode, mirrored off its native chip in the card
           (planModeOn). Ours to READ: the row dispatches /plan and the Host
           flips its own projection. */
        planOn: false,
        /* Per-server reconnect feedback. mcpBusy already disabled the whole
           row, but it produced NO visible progress: the button just greyed out
           ("我点击重连的时候，没有任何显示，就是变灰色了"). These two maps drive
           the button's own copy, so the in-flight state is readable and the
           outcome stays on screen. */
        reconnecting: {},
        reconnectState: {},
        /* Per-server failure reason, kept separately because the roster refresh
           that follows a reconnect clears the view-level mcpError. */
        reconnectError: {},
        mcpTools: null,
        mcpToolsFor: '',
        execError: null,
        listeners,
        subscribe (fn) { listeners.add(fn); return () => listeners.delete(fn); },
        emit () { for (const fn of listeners) fn(); },
        set (patch) { Object.assign(entry, patch); entry.emit(); }
      };
      sessions.set(sessionId, entry);
      return entry;
    }

    /* ------------------------------------------------------------------ *
     * Session key.
     *
     * The composer's standard kit exposes inputActions/useInput but NOT a
     * sessionId (it was dropped from the kit), so the component props alone
     * cannot tell two composers apart. Two things fill the gap:
     *
     *   1. The slot registration supplies its own inject(sessionId) — the same
     *      contract dsh-client-ui-input-trigger uses — which lands here as
     *      props.launcherSessionId. That is the REAL session address and is
     *      what the skills remote needs.
     *   2. When it is absent (a session-maybe zone), the fallback key is
     *      anchored on 'inputActions', the object handed to every slot of one
     *      input zone. The "+" button (conversation.input.left) and the rail
     *      (conversation.input.dock) live in SEPARATE component trees, so a
     *      per-component fallback would give them different ids and the rail
     *      would never show a pick made by the button.
     * ------------------------------------------------------------------ */
    let fallbackSeq = 0;
    const zoneKeys = new WeakMap();

    function zoneKeyOf (share) {
      if (share === undefined || share === null) return 'dcl:mount:' + (++fallbackSeq);
      const known = zoneKeys.get(share);
      if (known !== undefined) return known;
      const minted = 'dcl:zone:' + (++fallbackSeq);
      zoneKeys.set(share, minted);
      return minted;
    }

    function useSessionKey (maybeSessionId, share) {
      const fallback = react.useRef(undefined);
      if (maybeSessionId !== undefined && maybeSessionId !== '') return maybeSessionId;
      if (fallback.current === undefined) fallback.current = zoneKeyOf(share);
      return fallback.current;
    }

    /**
     * Read the live composer draft through the slot's own store hook.
     *
     * The hook is optional — a deployment that omits it degrades to an empty
     * draft instead of crashing the composer. It must be called from a
     * component body at the top level (rules of hooks), never from a branch.
     * @param props - the slot component's props.
     * @returns the current draft text.
     */
    /**
     * The newest draft ANY of our component bodies has seen.
     *
     * R11 — the send interceptor may not call props.useInput itself (it is a
     * hook), so the render-time values are mirrored here and the gesture
     * handlers read this. It doubles as the only observable "the composer went
     * empty" signal, which the rail uses to refuse to outlive a message.
     */
    let LAST_DRAFT = '';

    function readDraft (props) {
      if (props === undefined || typeof props.useInput !== 'function') return '';
      try {
        const value = props.useInput((state) => state.draft);
        return typeof value === 'string' ? value : '';
      } catch {
        return '';
      }
    }

    /**
     * R52 — the Host input store behind one slot component's session.
     *
     * The chip path and the SEND path need the same object: the Host's own
     * InputState, whose draft lives in CLIPBOARD coordinates (a chip contributes
     * its whole mention text there). uiSession's provide face publishes it
     * (dsh-client-ui-session/lib/client.js:258-264).
     *
     * @param props - slot component props (needs launcherSessionId).
     * @returns an object with store + actx, or null; never throws.
     */
    function inputStoreOf (props) {
      try {
        const ctx = rootContext;
        if (ctx === undefined || ctx === null) return null;
        const uiSession = typeof ctx.get === 'function' ? ctx.get('uiSession') : undefined;
        if (uiSession === undefined || uiSession === null || typeof uiSession.resolve !== 'function') return null;
        const sessionId = props === undefined || props === null ? undefined : props.launcherSessionId;
        if (sessionId === undefined || sessionId === null || sessionId === '') return null;
        const binding = uiSession.resolve(sessionId);
        if (binding === undefined || binding === null) return null;
        const hooks = binding.hooks;
        const store = hooks === undefined || hooks === null ? undefined : hooks.input;
        if (store === undefined || store === null || typeof store.getSnapshot !== 'function') return null;
        return { store, actx: binding.ctx };
      } catch {
        return null;
      }
    }

    /**
     * R52 — THE DRAFT THAT ACTUALLY GETS SENT, read in the coordinates that are
     * actually sent.
     *
     * readLiveDraft() returns [contenteditable].textContent, and there a chip
     * node contributes only its VISIBLE LABEL: no mention grammar, no newlines.
     * Writing that string back through setDraft() — which rebuilds the editor
     * out of plain text nodes (dsh-client-ui-conversation :12758-12774) —
     * therefore DOWNGRADED a session reference into body text, which is the
     * defect a user reported: a session reference came back as plain body text.
     * submit() sends projection.clipboardText (:12878) and the list layout fills
     * each chip slot with chip.getTextContent() (:12462), so the clipboard
     * projection is the truth this round-trip must preserve.
     *
     * @param props - slot component props.
     * @returns clipboard-coordinate draft, or null when the store is out of reach.
     */
    function clipboardDraftOf (props) {
      const found = inputStoreOf(props);
      if (found === null) return null;
      try {
        const state = found.store.getSnapshot();
        if (state === undefined || state === null) return null;
        return typeof state.draft === 'string' ? state.draft : null;
      } catch {
        return null;
      }
    }

    /**
     * R52 — the send path's draft reader: the clipboard projection whenever the
     * Host's store is reachable, the DOM textContent only as the last resort (a
     * session-maybe zone hands us no session id at all).
     *
     * @param props - slot component props.
     * @returns the draft text, never null.
     */
    function sendDraftOf (props) {
      const clipboard = clipboardDraftOf(props);
      return clipboard === null ? readLiveDraft() : clipboard;
    }

    /**
     * R28 — insert a REAL reference chip through the Host's own channel.
     *
     * A reference chip is an atomic Lexical decorator node, so it can only be
     * born inside the editor: dsh-client-ui-conversation reaches
     * shell.insertReference() exclusively through the session-scoped
     * "slash/input-insert-reference" event (client.js:13449 -> :12976), and
     * insertReference() replaces a DETECT span with $createReferenceChipNode
     * under a revision CAS (span.draftRev === shell.rev, :12979). setDraft()
     * can never do this — it writes plain text, which is exactly why a 对话
     * reference rendered as the raw mention string "@[label](dsh-session:…)".
     *
     * The listener lives on the session-scope ctx and needs the live input
     * snapshot for its span, and both are handed out by the uiSession provide
     * face: materialize() publishes { key, ctx, hooks, props }, where ctx is
     * the same actx and hooks.input is the shell's state store
     * (dsh-client-ui-session/lib/client.js:258-264;
     *  dsh-client-ui-conversation/lib/client.js:16605-16620).
     *
     * NEITHER uiSession NOR remote.* may be added to inject: the Loader only
     * calls apply() once EVERY declared name resolves, so a declaration the
     * deployment cannot satisfy stops the whole plugin.
     *
     * @param props - slot component props (needs launcherSessionId + inputActions).
     * @param reference - the Host's own reference insertion, verbatim.
     * @returns whether the Host actually applied the chip.
     */
    function hostInsertReference (props, reference) {
      try {
        const found = inputStoreOf(props);
        if (found === null) return false;
        const actx = found.actx;
        const inputStore = found.store;
        if (actx === undefined || actx === null || typeof actx.bail !== 'function') return false;
        let state = inputStore.getSnapshot();
        if (state === undefined || state === null || typeof state.draftRev !== 'number') return false;
        /* R29 — the chip must not be glued to whatever is already typed, and
           the span below must never be born stale. setDraft is a DISCRETE
           editor commit, so its update listener has already re-projected and
           published when it returns: the re-read sees the NEW revision. */
        const draft = typeof state.draft === 'string' ? state.draft : '';
        const head = draft === '' ? '' : draft.replace(/\s+$/, '') + ' ';
        if (head !== draft) {
          const actions = props.inputActions;
          if (actions === undefined || actions === null || typeof actions.setDraft !== 'function') return false;
          actions.setDraft(head);
          state = inputStore.getSnapshot();
          if (state === undefined || state === null || typeof state.draftRev !== 'number') return false;
        }
        const at = detectLengthOf(state);
        return actx.bail(actx, 'slash/input-insert-reference', {
          reference,
          span: { start: at, end: at, draftRev: state.draftRev }
        }) === true;
      } catch (error) {
        try {
          const logger = rootContext === undefined ? undefined : rootContext.logger;
          if (logger !== undefined && logger !== null && typeof logger.warn === 'function') {
            logger.warn('dsh-composer-launcher: reference chip insert threw', error);
          }
        } catch {
          /* Logging is a nicety; the caller's fallback is the contract. */
        }
        return false;
      }
    }

    /**
     * R28 — the DETECT-coordinate length of one input snapshot.
     *
     * The projection reports the draft in CLIPBOARD coordinates, where a chip
     * contributes its whole clipboard text, while editor spans are addressed in
     * DETECT coordinates, where the same chip is ONE placeholder character
     * (dsh-client-ui-conversation/lib/client.js:12458-12459 detects
     * occurrence.offset/length in clipboard space; :12976 addresses spans in
     * detect space). Without this correction the append offset of a draft that
     * already holds a chip is off by the mention's length and the Host refuses
     * the insert — silently, because a refused bail returns undefined.
     *
     * @param state - one InputState snapshot.
     * @returns the detect length, never negative.
     */
    function detectLengthOf (state) {
      const draft = state !== undefined && state !== null && typeof state.draft === 'string' ? state.draft : '';
      const occurrences = state === undefined || state === null ? undefined : state.occurrences;
      let extra = 0;
      if (Array.isArray(occurrences)) {
        for (const item of occurrences) {
          const length = item === undefined || item === null ? 0 : item.length;
          if (typeof length === 'number' && Number.isFinite(length)) extra += length - 1;
        }
      }
      return Math.max(0, draft.length - extra);
    }

    /**
     * R29 — the Host's file-reference grammar for a picked folder.
     *
     * The trailing slash is what tells the model a reference is a DIRECTORY
     * (dsh-file-reference/lib/index.js:54, FILE_REFERENCE_PROMPT: "A trailing
     * slash marks a directory: list it when its contents matter. Anything else
     * is a file"), and the Host's own picker builds the mention the same way
     * (:39-45). The picked path keeps its own separators on purpose:
     * normalising them would change the bytes the agent has to resolve.
     *
     * @param path - the absolute path the Host picker returned.
     * @returns the mention, or null when the grammar cannot represent it.
     */
    function folderMentionOf (path) {
      if (typeof path !== 'string' || path === '') return null;
      const text = /[\\/]$/.test(path) ? path : path + '/';
      if (/[\u0000-\u001f\u007f-\u009f"]/u.test(text)) return null;
      return /\s/u.test(text) ? '@"' + text + '"' : '@' + text;
    }

    /**
     * The composer's REAL draft text — read from the editor the user can see.
     *
     * R14-2 — the Host's composer is a Lexical rich-text editor
     * (dsh-client-ui-conversation renders [data-input-scroll] around the
     * contentEditable the shell itself calls "the editor (text + chip truth)").
     * props.useInput((state) => state.draft) is a SEPARATE mirror that does not
     * follow that editor, and every judgement built on it was therefore wrong:
     * the payload was spliced together with a stale string, and the "clear the
     * leftover" check never fired — so the payload sat in the box and rode the
     * NEXT message ("第二次发消息，把第一次的发出去了").
     *
     * The DOM is what the user actually sees, so it is what this plugin now
     * reads, verifies its own write against, and cleans up after.
     * @returns the live draft text ('' when the composer is empty).
     */
    function readLiveDraft () {
      try {
        const card = document.querySelector('[data-composer-card]');
        if (card !== null) {
          const scope = card.querySelector('[data-input-scroll]');
          const editable = (scope === null ? card : scope).querySelector('[contenteditable="true"]');
          if (editable !== null) {
            /* B1 — THE EDITOR ALSO HOSTS THE PLACEHOLDER. A bare textContent is
               therefore never empty while the composer LOOKS empty, so every
               "is the box empty?" test answered wrong: the drag floor was never
               cleared and the input stayed tall with nothing in it. */
            let node = editable;
            if (editable.children !== undefined && editable.children.length > 0) {
              node = editable.cloneNode(true);
              const ghosts = node.querySelectorAll(
                '[data-placeholder],[data-composer-placeholder],[data-lexical-placeholder],' +
                '[class*="placeholder"],[class*="Placeholder"],[aria-hidden="true"],.dsh-placeholder'
              );
              for (const ghost of ghosts) ghost.remove();
            }
            let text = node.textContent;
            text = text === undefined || text === null ? '' : String(text);
            /* R24c — belt and braces for a placeholder this file cannot name:
               if what is left is exactly the Host's own placeholder copy, the
               composer is empty. */
            if (text.trim() !== '') {
              try {
                const card2 = document.querySelector('[data-composer-card]');
                const mark = card2 === null ? null : card2.querySelector('[data-composer-placeholder]');
                const markText = mark === null || mark.textContent === undefined ? '' : String(mark.textContent).trim();
                if (markText !== '' && text.trim() === markText) return '';
              } catch {
                /* the DOM check is best effort */
              }
            }
            return text;
          }
        }
      } catch {
        /* fall through to the store mirror */
      }
      return String(LAST_DRAFT === undefined || LAST_DRAFT === null ? '' : LAST_DRAFT);
    }

    /** Is our payload block still sitting in the composer?
     *  R52 — asked of the SEND draft (clipboard coordinates), because the
     *  marker is built in those and a multi-line marker can never be found in a
     *  DOM textContent that has no newlines. */
    function draftHoldsMarker (marker, props) {
      if (marker === undefined || marker === null || marker === '') return false;
      return sendDraftOf(props).indexOf(marker) >= 0;
    }

    /* ------------------------------------------------------------------ *
     * Goal mode (#10 / #2b / #22)
     *
     * The Host has a goal FACILITY (the goal command, the goal projection) but
     * no composer API, and a bare '/goal' is the "view the goal" command: it
     * runs a whole conversation turn, which is exactly why the previous build
     * "sent it and could not take it back".
     *
     * So goal mode is LOCAL. Arming writes '' and the armed test is a null
     * check (Codex: ji writes '', then the reader tests the field against null),
     * which is what makes the placeholder and the height change on the click
     * itself, before any typing. Nothing is ever sent through the commands
     * remote.
     * ------------------------------------------------------------------ */

    /** Codex 'composer.placeholder.goal' (zh-CN, verbatim) — the literal lives
     *  in the copy table now, as 'goal.placeholder'; the export of the same
     *  name hands it out again, in the language active when it is read. */
    /** Codex tokens: min-h-20 = 80px, duration-relaxed .3s, ease-enter-snappy. */
    const GOAL_MIN_HEIGHT = '80px';
    const GOAL_TRANSITION_MS = '.3s';
    const GOAL_EASE = 'cubic-bezier(.23,1,.32,1)';

    /** Whether goal mode is armed. A null check on purpose — see above. */
    function goalArmed (store) {
      return store.goalMode !== null && store.goalMode !== undefined;
    }

    /** Codex disables the height transition under motion-reduce. */
    function prefersReducedMotion () {
      try {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
      } catch {
        return false;
      }
    }

    /* Values we overwrote on the Host's own nodes, so disarming restores them
       instead of guessing what React would have rendered. */
    const goalMinHeightBefore = new WeakMap();
    const goalPlaceholderBefore = new WeakMap();

    /**
     * Put the goal-mode face on (or take it off) the Host composer card.
     *
     * The card is the Host's markup (data-composer-card → [data-input-scroll],
     * [data-placeholder], [data-composer-placeholder]); we only borrow it, and
     * every overwritten value is remembered so the disarmed state is byte-for-
     * byte what React last rendered.
     * @param card - the [data-composer-card] element, or null when not mounted.
     * @param armed - whether goal mode is active.
     */
    function applyGoalMode (card, armed) {
      if (card === null || card === undefined) return;
      const scroll = card.querySelector('[data-input-scroll]');
      const placeholder = card.querySelector('[data-composer-placeholder]');
      const editable = card.querySelector('[data-placeholder]');
      if (scroll !== null) {
        if (armed) {
          if (!goalMinHeightBefore.has(scroll)) goalMinHeightBefore.set(scroll, scroll.style.minHeight);
          if (prefersReducedMotion()) {
            if (scroll.style.transitionProperty !== '') scroll.style.transitionProperty = '';
          } else {
            if (scroll.style.transitionProperty !== 'min-height') scroll.style.transitionProperty = 'min-height';
            if (scroll.style.transitionDuration !== GOAL_TRANSITION_MS) scroll.style.transitionDuration = GOAL_TRANSITION_MS;
            if (scroll.style.transitionTimingFunction !== GOAL_EASE) scroll.style.transitionTimingFunction = GOAL_EASE;
          }
          /* R24 — min-height is written by applyComposerHeight ALONE, which
             composes the goal floor (80px) with the drag floor. Two writers for
             one property is what let goal mode and the drag cancel each other
             out. Only the transition belongs here. */
        } else if (goalMinHeightBefore.has(scroll)) {
          goalMinHeightBefore.delete(scroll);
          if (scroll.style.transitionProperty !== '') scroll.style.transitionProperty = '';
          if (scroll.style.transitionDuration !== '') scroll.style.transitionDuration = '';
          if (scroll.style.transitionTimingFunction !== '') scroll.style.transitionTimingFunction = '';
          goalMinHeightBefore.delete(scroll);
        }
      }
      if (placeholder !== null) {
        if (armed) {
          if (!goalPlaceholderBefore.has(placeholder)) goalPlaceholderBefore.set(placeholder, placeholder.textContent);
          const goalCopy = t('goal.placeholder');
          if (placeholder.textContent !== goalCopy) placeholder.textContent = goalCopy;
        } else if (goalPlaceholderBefore.has(placeholder)) {
          const before = goalPlaceholderBefore.get(placeholder);
          if (placeholder.textContent !== before) placeholder.textContent = before;
          goalPlaceholderBefore.delete(placeholder);
        }
      }
      if (editable !== null) {
        if (armed) {
          if (editable.dataset.dclGoalPrev === undefined) {
            const current = editable.getAttribute('data-placeholder');
            editable.dataset.dclGoalPrev = current === null ? '' : current;
          }
          const goalCopy = t('goal.placeholder');
          if (editable.getAttribute('data-placeholder') !== goalCopy) {
            editable.setAttribute('data-placeholder', goalCopy);
          }
        } else if (editable.dataset.dclGoalPrev !== undefined) {
          const target = editable.dataset.dclGoalPrev;
          if (editable.getAttribute('data-placeholder') !== target) editable.setAttribute('data-placeholder', target);
          delete editable.dataset.dclGoalPrev;
        }
      }
    }

    /* ------------------------------------------------------------------ *
     * #21 — drag the composer taller.
     *
     * The Host sizes the composer from a CSS custom property it defines on an
     * ANCESTOR seat element (--dsh-composer-text-max-height, default 336px),
     * which its inner scroll container consumes. Custom properties inherit
     * DOWNWARD, so the value has to be written on the ancestor that owns it —
     * never on our own node, and never by hard-coding a hashed class name.
     *
     * ------------------------------------------------------------------ */
    const COMPOSER_HEIGHT_KEY = 'dsh-composer-launcher/composer-height';
    const COMPOSER_HEIGHT_VAR = '--dsh-composer-text-max-height';
    const COMPOSER_HEIGHT_MIN = 160;
    const COMPOSER_HEIGHT_FALLBACK = 336;

    /** Nearest ANCESTOR (never the node itself) that DECLARES the height var.
     *
     * The trap: custom properties INHERIT, so every descendant of the declaring
     * seat reports the same computed value — "first ancestor with a non-empty
     * value" would always answer the immediate parent, and writing the var
     * there would feed only that subtree while the consumer (a sibling branch)
     * never saw it. The declarer is the highest element in the chain that still
     * reports the same value; the level above it reports nothing (or a
     * different value). That is what this walk finds.
     */
    function composerHeightOwner (node) {
      let cursor = node === null || node === undefined ? null : node.parentElement;
      let owner = null;
      let seen = null;
      for (let depth = 0; depth < 24 && cursor !== null; depth++) {
        let value = '';
        try {
          value = window.getComputedStyle(cursor).getPropertyValue(COMPOSER_HEIGHT_VAR);
        } catch {
          value = '';
        }
        /* An engine that skips computed custom properties still reports the
           inline declaration, so fall back to it. */
        if (String(value).trim() === '') {
          try {
            value = cursor.style.getPropertyValue(COMPOSER_HEIGHT_VAR);
          } catch {
            value = '';
          }
        }
        const text = String(value).trim();
        if (text === '') break;
        if (seen !== null && text !== seen) break;
        seen = text;
        owner = cursor;
        cursor = cursor.parentElement;
      }
      return owner;
    }

    /** Codex's bottom-sheet clamp: Math.max(160, Math.min(v, h * 0.5)).
     *
     * 'floor' 是**这次拖拽允许的最小高度**，不能一律用 160（R28 修的就是这个）。
     *
     * 收到的反馈「往上拖会突然变得很高，然后就固定在这个高度不动了」，
     * 复现数据（空输入框真实高度 36px，往上拖 80px）：
     *     down 36 → move 160 / 160 / 160 …（一路都是 160）
     * 因为 36+8=44 被 clamp 到 160 ⇒ 第一次移动就"跳"到 160；再往上拖到 160 之前
     * 一直 clamp 回 160 ⇒ 看着就是"卡住不动"。只有拖过 124px 之后才开始跟手。
     * 所以下限必须是「这轮开始时的真实高度」和 160 里更小的那个：
     *   空框（36）⇒ 从 36 开始一比一跟手；本来就很高（>160）⇒ 仍然不许缩到 160 以下。
     */
    function clampComposerHeight (value, floor) {
      const viewport = typeof window === 'undefined' || !window.innerHeight ? 720 : window.innerHeight;
      const lo = Number.isFinite(floor) && floor > 0 ? Math.min(floor, COMPOSER_HEIGHT_MIN) : COMPOSER_HEIGHT_MIN;
      return Math.round(Math.max(lo, Math.min(value, viewport * 0.5)));
    }

    /** The composer's REAL rendered text-area height.
     *
     * R27 — the drag used to start from currentComposerHeight(), which answers
     * the CSS VARIABLE (the capacity, 336 by default) rather than how tall the
     * box actually is. The very first pointermove therefore jumped straight to
     * the cap — "我一拖拽它就往上很高很高" — and never followed the pointer. */
    /** 找 composer 卡片：先往上找，找不到就用「页面里唯一那张卡」兜底。
     * 为什么需要兜底：拖拽手柄挂在 'conversation.input.overlay'（卡片顶部的
     * 零高度 overlay 锚），一旦宿主的插槽容器**不在** '[data-composer-card]' 里面，
     * 'closest()' 就是 null ⇒ 真实高度读不到 ⇒ 退回 CSS 变量（336 / 160）当基准，
     * 于是"一拖就跳很高"。宁可退到全页查询，也不要拿变量当基准。 */
    function composerCardOf (node) {
      try {
        if (node !== null && node !== undefined && typeof node.closest === 'function') {
          const up = node.closest('[data-composer-card]');
          if (up !== null) return up;
          const anchor = node.closest('.overlayAnchor');
          const host = anchor === null ? null : anchor.parentElement;
          const near = host === null || typeof host.querySelector !== 'function' ? null : host.querySelector('[data-composer-card]');
          if (near !== null && near !== undefined) return near;
        }
        return document.querySelector('[data-composer-card]');
      } catch {
        return null;
      }
    }

    function liveComposerHeight (node) {
      try {
        const card = composerCardOf(node);
        const scroll = card === null ? null : card.querySelector('[data-input-scroll]');
        if (scroll !== null) {
          const rect = scroll.getBoundingClientRect();
          if (rect.height > 0) return Math.round(rect.height);
        }
      } catch {
        /* fall back to the variable */
      }
      return currentComposerHeight(node);
    }

    function currentComposerHeight (node) {
      const owner = composerHeightOwner(node);
      if (owner === null) return COMPOSER_HEIGHT_FALLBACK;
      let raw = '';
      try {
        raw = window.getComputedStyle(owner).getPropertyValue(COMPOSER_HEIGHT_VAR);
      } catch {
        raw = '';
      }
      if (String(raw).trim() === '') raw = owner.style.getPropertyValue(COMPOSER_HEIGHT_VAR);
      const parsed = Number.parseInt(String(raw), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : COMPOSER_HEIGHT_FALLBACK;
    }

    /** Write the height onto the owning ancestor. Returns whether one existed.
     * @param forceFloor - true while a drag is in progress: the user must SEE
     *   the height follow the pointer even when the composer is empty.
     */
    function applyComposerHeight (node, value, forceFloor, goalOn, floor) {
      const anchor = node === null || node === undefined ? null : node;
      if (anchor === null) return false;
      /* Resolve the CARD from whatever node we were handed (the card itself, or
         any descendant such as our own slot marker) so the floor no longer
         depends on the seat being discoverable. */
      const card = composerCardOf(anchor);
      const owner = composerHeightOwner(anchor);
      const wanted = Number(value);
      const hasDrag = Number.isFinite(wanted) && wanted > 0;
      const px = hasDrag ? clampComposerHeight(wanted, floor) : 0;
      /* V8 — the ceiling alone is INVISIBLE: the Host consumes this variable as
         a MAX-height on its scroll area, so with a short draft raising the cap
         changes nothing on screen ("拖拽只是个摆设，怎么拖都没用"). Written on the
         declaring seat when there is one, on the card otherwise (custom
         properties inherit, so consumers below still see it). */
      if (hasDrag) {
        const ceilingHost = owner === null ? card : owner;
        if (ceilingHost !== null) ceilingHost.style.setProperty(COMPOSER_HEIGHT_VAR, px + 'px');
      }
      if (card === null) return owner !== null;
      /* R24 — THE FLOOR BELONGS TO THE TEXT AREA, NEVER TO THE CARD.
       *
       * Writing min-height on the card grew the card while its content stayed
       * packed at the TOP, so the toolbar row (+, 完全权限, model, send) floated
       * up into the middle with a blank block underneath — "完全权限加号等等一
       * 系列这一行的东西是跟着上去的，它应该是保持在最底下的". Growing the scroll
       * area pushes that row to the bottom, which is what a composer must do. */
      if (card.style.minHeight !== '') card.style.minHeight = '';
      const scroll = card.querySelector('[data-input-scroll]');
      if (scroll === null) return true;
      /* R14-2 — the emptiness test reads the EDITOR, not the store mirror.
         R24b — and goal mode's own floor composes with ours instead of fighting
         it, so an armed goal keeps its 80px while a drag keeps its value. */
      const text = readLiveDraft();
      /* R27 — the floor applies WHILE DRAGGING and for goal mode, and nowhere
         else. Keeping it whenever there was text made the box JUMP to the
         remembered height on the first keystroke ("输入框我一打字，它就突然就往
         上了"): a remembered height is a CAPACITY, not a floor. */
      const minPx = Math.max(
        goalOn === true ? 80 : 0,
        hasDrag && forceFloor === true ? px : 0
      );
      const next = minPx > 0 ? minPx + 'px' : '';
      if (scroll.style.minHeight !== next) scroll.style.minHeight = next;
      return true;
    }

    function readStoredComposerHeight () {
      try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(COMPOSER_HEIGHT_KEY);
        if (raw === null) return null;
        const value = Number.parseInt(raw, 10);
        return Number.isFinite(value) && value > 0 ? clampComposerHeight(value) : null;
      } catch {
        return null;
      }
    }

    function writeStoredComposerHeight (value) {
      try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(COMPOSER_HEIGHT_KEY, String(clampComposerHeight(value)));
      } catch {
        /* A blocked store costs only the remembered height. */
      }
    }

    /** The drag handle. Mounted in the composer card's top overlay anchor.
     *
     * It takes NO slot props: the height lives on the composer seat's CSS
     * variable and the remembered value has a fixed key, so the session key the
     * other two components resolve would be dead weight here (it used to be
     * computed and thrown away on the next line).
     *
     * The pointer listeners live in an EFFECT keyed on the drag flag, not
     * inside the pointerdown handler. That buys three things the inline version
     * could not have: 'pointercancel' ends the drag, an unmount mid-drag stops
     * it (and still persists what was reached) instead of leaving listeners on
     * 'window' forever, and there is exactly ONE teardown path — 'endDrag' — so
     * the "write the value, drop the handlers, clear the ref" trio cannot drift
     * out of sync between the success, cancel and unmount exits.
     */
    function ResizeHandle () {
      const barRef = react.useRef(null);
      const dragRef = react.useRef(null);
      const [dragging, setDragging] = react.useState(false);

      /* The handle is a REAL range widget (role=separator + a value triple), so
         aria-valuenow has to be a number that tracks the composer. It is written
         straight onto the attribute wherever the height changes — the same
         no-re-render discipline as the style writes — instead of holding the
         height in state and re-rendering on every pointer move. */
      const publishValue = (value) => {
        if (barRef.current !== null) barRef.current.setAttribute('aria-valuenow', String(value));
      };

      /* Apply the remembered height once mounted, so a refresh keeps it. */
      react.useEffect(() => {
        const stored = readStoredComposerHeight();
        if (stored !== null && applyComposerHeight(barRef.current, stored)) publishValue(stored);
      }, []);

      react.useEffect(() => {
        if (!dragging) return undefined;
        /** The single teardown path: persist, forget the drag, unlisten. */
        const endDrag = () => {
          const drag = dragRef.current;
          if (drag !== null && drag.value !== undefined) writeStoredComposerHeight(drag.value);
          dragRef.current = null;
          setDragging(false);
        };
        const onMove = (moveEvent) => {
          const drag = dragRef.current;
          if (drag === null) return;
          /* Dragging UP (smaller clientY) makes the composer TALLER — and it must
             track the pointer 1:1 from the height it had when the drag began.
             R28 — the floor is this drag's own starting height (see
             clampComposerHeight): a hard 160 floor made the first 124px of an
             upward drag collapse to a constant 160 ("突然变得很高…然后固定不动"). */
          const next = clampComposerHeight(drag.start + (drag.y - moveEvent.clientY), drag.floor);
          drag.value = next;
          applyComposerHeight(barRef.current, next, true, undefined, drag.floor);
          publishValue(next);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
        return () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', endDrag);
          window.removeEventListener('pointercancel', endDrag);
          /* Unmount (or a dsh re-render that drops us) while dragging: keep the
             height the user reached, then let the refs go. */
          const drag = dragRef.current;
          if (drag !== null && drag.value !== undefined) writeStoredComposerHeight(drag.value);
          dragRef.current = null;
        };
      }, [dragging]);

      const onPointerDown = (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        /* 记下**这一轮开始时的真实高度**，并把它当成这一轮的下限：
           空框（约 36px）就真从 36 开始跟手，不去够那个写死的 160。 */
        const start = liveComposerHeight(barRef.current);
        dragRef.current = { y: event.clientY, start, floor: Math.min(start, COMPOSER_HEIGHT_MIN), value: undefined };
        setDragging(true);
      };

      /* Keyboard equivalent, because the handle is focusable and a focusable
         control that only answers a mouse is worse than no aria at all. Same
         clamp/apply/persist path as the drag. */
      const onKeyDown = (event) => {
        const step = event.key === 'ArrowUp' ? 16 : (event.key === 'ArrowDown' ? -16 : 0);
        if (step === 0) return;
        event.preventDefault();
        const from = currentComposerHeight(barRef.current);
        const floor = Math.min(liveComposerHeight(barRef.current), COMPOSER_HEIGHT_MIN);
        const next = clampComposerHeight(from + step, floor);
        if (applyComposerHeight(barRef.current, next, false, undefined, floor)) {
          writeStoredComposerHeight(next);
          publishValue(next);
        }
      };

      /* role="separator" with a value is a REAL range widget, so it needs the
         full numeric triple. aria-valuenow used to be the string 'true' while
         dragging, which is not a legal value. */
      return h('div', {
        className: 'dcl-resize' + (dragging ? ' dragging' : ''),
        ref: barRef,
        role: 'separator',
        tabIndex: 0,
        'aria-label': t('resize.aria'),
        'aria-orientation': 'horizontal',
        'aria-valuemin': COMPOSER_HEIGHT_MIN,
        'aria-valuemax': Math.round((typeof window === 'undefined' || !window.innerHeight ? 720 : window.innerHeight) * 0.5),
        'aria-valuenow': currentComposerHeight(barRef.current),
        title: t('resize.title'),
        onPointerDown,
        /* R26 — the tooltip has always promised 双击复位 and there was no
           handler behind it ("双击复位是不存在的"). Reset drops the remembered
           height, the ceiling and the floor together. */
        onDoubleClick: () => {
          try {
            if (typeof localStorage !== 'undefined') localStorage.removeItem(COMPOSER_HEIGHT_KEY);
          } catch {
            /* A blocked store costs only the remembered height. */
          }
          const owner = composerHeightOwner(barRef.current);
          if (owner !== null) owner.style.removeProperty(COMPOSER_HEIGHT_VAR);
          applyComposerHeight(barRef.current, 0, false, false);
          publishValue(COMPOSER_HEIGHT_FALLBACK);
        },
        onKeyDown
      }, h('span', { className: 'dcl-resize-grip' }));
    }

    /**
     * Toggle goal mode. NOTHING is sent anywhere: a bare /goal is the "view the
     * goal" command and runs a conversation turn ("撤不回"). Re-clicking the
     * same row withdraws the mode and restores the composer.
     * @param store - the per-session store.
     */
    function toggleGoalMode (ctx, store) {
      if (goalArmed(store)) {
        store.set({ goalMode: null, open: false });
        return;
      }
      /* R40 — SWITCH, not refuse (this reverses R36).
       *
       * 计划 and 目标 are two states of ONE slot, and the user asked for a
       * SWITCH: clicking 目标 while plan mode is on must leave plan mode and arm
       * the goal, with the UI following — "从计划模式切换为目标模式 UI 也会跟着变…
       * 现在这个是没实现的".
       *
       * Plan mode is HOST state, so the only way to leave it is the Host's own
       * /plan off (dsh-client-ui-plan does exactly the same from its chip). The
       * one transcript line that command leaves is unavoidable: the remote
       * surface has no plan namespace at all (checked in
       * <APP_ROOT>).
       *
       * R43 — AND IT MUST LAND IN ONE CLICK. /plan off is asynchronous, so the
       * plan projection still says "on" for a moment; the Host-side sync below
       * read that stale value and withdrew the goal we had just armed, which is
       * exactly why the user had to click 目标 a second time ("我点击这个目标模式
       * 一点反应没有，我得再点一次才能出现设为目标"). The switch therefore opens a
       * short window in which the sync will not treat plan mode as authoritative. */
      store.modeSwitchAt = Date.now();
      if (store.planOn === true) invokeSlash(ctx, store, '/plan off');
      store.set({ goalMode: '', open: false });
    }

    /**
     * The active goal text, read from the session projection.
     *
     * Best-effort by contract: the projection API is optional, and a deployment
     * without it simply has no objective text to show (the mode still works).
     * @returns the goal text, or null.
     */
    /**
     * R31 — the session's CURRENT goal, read from the durable goal projection.
     *
     * faceOf() returns an ObservableSnapshot, NOT a value. The previous version
     * read face.text off the store object itself, which is always undefined, so
     * this function answered null even while a goal was live — and every armed
     * submit therefore went out as a bare "/goal <objective>", which the command
     * layer refuses with "A goal is already active. Use /goal edit <objective>
     * to change it or /goal clear before replacing it."
     * (dsh-command-goal/lib/index.js:126-128).
     *
     * @param ctx - root context.
     * @param sessionId - the session the composer belongs to.
     * @returns { phase, objective } of the current goal, or null when there is none.
     */
    function activeGoalOf (ctx, sessionId) {
      try {
        const svc = ctx === undefined || ctx === null ? undefined : ctx.get('sessions');
        if (svc === undefined || svc === null || typeof svc.binding !== 'function') return null;
        const binding = svc.binding(sessionId);
        const session = binding === undefined || binding === null ? null : binding.session;
        const projections = session === undefined || session === null ? null : session.projections;
        if (projections === undefined || projections === null || typeof projections.faceOf !== 'function') return null;
        const face = projections.faceOf('goal');
        if (face === undefined || face === null) return null;
        /* The face is an ObservableSnapshot. A plain value is tolerated so an
           older client shape cannot silently answer null a second time. */
        const snapshot = typeof face.getSnapshot === 'function' ? face.getSnapshot() : face;
        if (snapshot === undefined || snapshot === null) return null;
        const goal = snapshot.goal;
        if (goal === undefined || goal === null || typeof goal !== 'object') return null;
        if (typeof goal.phase !== 'string') return null;
        return {
          phase: goal.phase,
          objective: typeof goal.objective === 'string' ? goal.objective : ''
        };
      } catch {
        return null;
      }
    }

    /**
     * R31 — which goal verb the CURRENT state accepts.
     *
     * dsh-command-goal refuses "create" unless the current goal is absent or
     * already complete (lib/index.js:126-128), and refuses "edit" when there is
     * no current goal at all (missingGoal("edit"), :134-135), so the two
     * branches are exhaustive.
     *
     * @param existing - an activeGoalOf() result.
     * @returns the command prefix, trailing space included.
     */
    function goalCommandPrefix (existing) {
      const canCreate = existing === null || existing === undefined || existing.phase === 'complete';
      return canCreate ? '/goal ' : '/goal edit ';
    }

    /** The compare-and-set ref the goal remote expects (dsh-command-goal:78). */
    function goalRefOf (goal) {
      return { id: goal.id, revision: goal.revision };
    }

    /**
     * R37 — set the goal as DATA through remote.goals, never as a command.
     *
     * "/goal <objective>" is a COMMAND: it writes its own entry into the
     * transcript (so the user sees messages they never typed — "我消息都发出去了")
     * and it starts a turn of its own, which left the user's real message queued
     * behind it ("消息没有发出去！").
     *
     * The host exposes the same operation as data:
     *   remote.goals.create(sessionId, { objective })
     *   remote.goals.edit(sessionId, { id, revision }, { objective })
     *   remote.goals.get(sessionId) -> goal | undefined
     * (dsh-client-connection/lib/client.js:5955-5964; the ref is the plain
     * { id, revision } dsh-command-goal builds at :78). Create is only legal
     * while there is no goal or the old one is complete — the same rule the
     * command enforces — so anything else is edited in place.
     *
     * remote.goals is NOT declared in inject on purpose: the Loader only calls
     * apply() once EVERY declared name resolves, so an optional namespace must
     * be reached with ctx.get().
     *
     * @param ctx - root context.
     * @param sessionId - the session that owns the goal.
     * @param objective - the objective text.
     * @returns a failure reason, or null on success.
     */
    async function setGoalViaRemote (ctx, sessionId, objective) {
      try {
        const goals = ctx === undefined || ctx === null ? undefined : ctx.get('remote.goals');
        if (goals === undefined || goals === null || typeof goals.create !== 'function') {
          return t('goal.noRemote');
        }
        const failureOf = (result, fallback) => {
          if (result === null || typeof result !== 'object' || result.ok !== false) return null;
          const error = result.error;
          if (error === undefined || error === null) return fallback;
          if (typeof error.message === 'string' && error.message !== '') return error.message;
          return typeof error.code === 'string' && error.code !== '' ? error.code : fallback;
        };
        let current;
        if (typeof goals.get === 'function') {
          const result = await goals.get(sessionId);
          current = result !== null && typeof result === 'object' && 'ok' in result
            ? (result.ok === true ? result.value : undefined)
            : result;
        }
        if (current === undefined || current === null || current.phase === 'complete') {
          return failureOf(await goals.create(sessionId, { objective: objective }), t('goal.createFailed'));
        }
        const edited = await goals.edit(sessionId, goalRefOf(current), { objective: objective });
        const editFailure = failureOf(edited, t('goal.updateFailed'));
        if (editFailure !== null) return editFailure;
        /* R57 — A PAUSED GOAL STAYS PAUSED WHEN ITS OBJECTIVE IS EDITED, so the
         * NEW objective would never run while the OLD one still looked current
         * ("以前的旧目标也需要进行修复，应该是使用新目标"). Resume the goal the edit
         * just rewrote, with the revision the Host returned (the CAS is per
         * revision, so reusing the pre-edit ref would be refused). */
        const phase = typeof current.phase === 'string' ? current.phase : '';
        if ((phase === 'paused' || phase === 'blocked') && typeof goals.resume === 'function') {
          const updated = edited !== null && typeof edited === 'object' && edited.ok === true ? edited.value : undefined;
          const ref = updated !== undefined && updated !== null && typeof updated.revision === 'number'
            ? goalRefOf(updated)
            : goalRefOf(current);
          return failureOf(await goals.resume(sessionId, ref), t('goal.resumeFailed'));
        }
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }

    /* ------------------------------------------------------------------ *
     * Config — one module-level document, not one per session.
     *
     * The settings card and every composer read the SAME config object, and a
     * settings edit has to reach already-mounted composers; a per-store copy
     * would silently leave them on stale defaults.
     * ------------------------------------------------------------------ */
    let CONFIG = Object.assign({}, DEFAULTS, { pinned: DEFAULTS.pinned.slice() });

    /**
     * The bound Host settings scope for this namespace, when one is available.
     * SettingsScopeController exposes getSnapshot / subscribe / set / unset /
     * mutate, and writes ride ctx.remote.settings. When it cannot be bound the
     * launcher still works off the localStorage mirror below.
     */
    let settingsScope = null;

    /** Narrow an untrusted settings section field by field. */
    function decodeConfig (section) {
      const record = section === null || typeof section !== 'object' ? {} : section;
      const pick = (key) => (record[key] === undefined || record[key] === null ? DEFAULTS[key] : record[key]);
      const bool = (key) => pick(key) === true;
      const num = (key, min, max) => {
        const value = Number(pick(key));
        return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : DEFAULTS[key];
      };
      const mode = pick('pluginMode');
      return {
        showWeb: bool('showWeb'),
        showFiles: bool('showFiles'),
        showPlan: bool('showPlan'),
        showGoal: bool('showGoal'),
        showCmd: bool('showCmd'),
        showSkill: bool('showSkill'),
        showMcp: bool('showMcp'),
        webCount: num('webCount', 1, 10),
        pluginCount: num('pluginCount', 1, 10),
        port: num('port', 1, 65535),
        pluginMode: mode === 'pinned' || mode === 'frequent' || mode === 'mixed' ? mode : DEFAULTS.pluginMode,
        pinned: Array.isArray(record.pinned)
          ? record.pinned.filter((name) => typeof name === 'string')
          : DEFAULTS.pinned.slice()
      };
    }

    /** Repaint every mounted composer and the settings card. */
    function broadcast () {
      for (const entry of sessions.values()) entry.emit();
    }

    /** Persist the config and repaint. */
    function commitConfig () {
      saveConfig(CONFIG);
      if (settingsScope !== null) {
        try {
          /* A rejected write costs the persisted value, not the UI — the local
             mirror above already carries the change for this session. */
          Promise.resolve(settingsScope.set(Object.assign({}, CONFIG))).catch(() => {});
        } catch {
          /* fall through to the local mirror only */
        }
      }
      broadcast();
    }

    /* ------------------------------------------------------------------ *
     * Persistence — config lives in the settings document when the host
     * exposes one, and falls back to localStorage otherwise.
     * ------------------------------------------------------------------ */
    const LS_KEY = 'dsh-composer-launcher/config';

    function loadConfig () {
      if (typeof localStorage === 'undefined') return null;
      try {
        const raw = localStorage.getItem(LS_KEY);
        return raw === null ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    }

    function saveConfig (config) {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(config));
      } catch {
        /* A full or blocked store must not break the composer. */
      }
    }

    /* ------------------------------------------------------------------ *
     * Data loads
     * ------------------------------------------------------------------ */
    const FREQ_KEY = 'dsh-composer-launcher/frequency';

    /**
     * Forget the whole usage table.
     *
     * 「我已经把前面两个默认插件删掉了，点恢复默认它自己就消失了…
     * 我打开一下，它还存在。」——「恢复默认」以前只重置 CONFIG（pinned: []），
     * **没清用量表**；而默认规则是「混合」＝钉住的 + 按用量补满，于是刚删掉的那两个
     * 立刻又从用量表里被补回来。恢复默认的含义就是"回到干净默认"，
     * 所以这里连用量记忆一起清掉。
     */
    function clearFrequency () {
      if (typeof localStorage === 'undefined') return;
      try { localStorage.removeItem(FREQ_KEY); } catch { /* Ranking is a nicety. */ }
    }

    /** Record one use so the "frequent" pick rule has something to rank. */
    function bumpFrequency (name) {
      if (typeof localStorage === 'undefined') return;
      try {
        const raw = localStorage.getItem(FREQ_KEY);
        const table = raw === null ? {} : JSON.parse(raw);
        table[name] = (table[name] === undefined ? 0 : table[name]) + 1;
        localStorage.setItem(FREQ_KEY, JSON.stringify(table));
      } catch {
        /* Ranking is a nicety; never let it break a pick. */
      }
    }

    function readFrequency () {
      if (typeof localStorage === 'undefined') return {};
      try {
        const raw = localStorage.getItem(FREQ_KEY);
        return raw === null ? {} : JSON.parse(raw);
      } catch {
        return {};
      }
    }

    /**
     * Forget one plugin's usage record.
     *
     * 「那两个常用插件我都已经删掉了，重启之后又出现了」——
     * 删 chip 以前只动 「pinned」，可「混合 / 高频」两种规则是**按用量补满**的，
     * 于是高频榜上那两名下次又冒出来。既然按了 ×，就是"别再给我看它"，
     * 用量记录一并清掉，三种规则下都不会再自作主张地补回来。
     */
    function dropFrequency (name) {
      if (typeof localStorage === 'undefined') return;
      try {
        const raw = localStorage.getItem(FREQ_KEY);
        if (raw === null) return;
        const table = JSON.parse(raw);
        let hit = false;
        for (const key of Object.keys(table)) {
          if (samePluginName(key, name)) { delete table[key]; hit = true; }
        }
        if (hit) localStorage.setItem(FREQ_KEY, JSON.stringify(table));
      } catch {
        /* Ranking is a nicety; never let it break a removal. */
      }
    }

    /** Ask our host route for the debugging browser's tabs.
     *
     * Three outcomes have to stay distinguishable in the UI, because they call
     * for completely different user actions:
     *   extension -> nothing to do, these are the real tabs
     *   cdp       -> the extension is missing but the debug browser answered
     *   none      -> NEITHER path is alive; the user must act
     * The route reports which one answered in 'source', so this records it
     * instead of collapsing everything into "no tabs".
     */
    /**
     * One line telling the user how to get the extension loaded, worded in the
     * active interface language.
     *
     * The host already computed the same thing, but its wording is Chinese and
     * cannot be otherwise: the host has no access to the language the UI runs
     * in. So it hands over the facts -- the staged directory plus one entry per
     * installed browser, each with its extensions URL -- and the sentence is
     * assembled here, from the table below.
     * @returns a string, or null when there is nothing useful to say.
     */
    function extensionInstallLine (store, t) {
      const info = store.extensionInfo;
      if (info === null || info === undefined || typeof info !== 'object') return null;
      const browsers = Array.isArray(info.browsers) ? info.browsers : [];
      const dir = typeof info.extensionDir === 'string' && info.extensionDir !== '' ? info.extensionDir : null;
      if (browsers.length === 0) {
        return t('web.installManual', { dir: dir === null ? 'extension/' : dir });
      }
      const first = browsers[0];
      const rest = browsers.slice(1).map((entry) => entry.name).join(', ');
      const line = first.chromium === true
        ? t('web.installHow', {
          browser: first.name,
          url: first.extensionsUrl,
          dir: dir === null ? 'extension/' : dir
        })
        : t('web.installHowFf', {
          browser: first.name,
          url: first.extensionsUrl,
          file: dir === null ? 'manifest.json' : dir + '/manifest.json'
        });
      return rest === '' ? line : line + ' ' + t('web.installMore', { list: rest });
    }

    async function loadTabs (store, port, force) {
      store.set({ tabState: 'loading' });
      try {
        const query = ROUTE + '/tabs?port=' + encodeURIComponent(String(port)) +
          (force === true ? '&refresh=1' : '');
        const response = await fetch(query, { headers: { accept: 'application/json' } });
        const payload = await response.json();
        if (CONFIG.port !== port) return;
        const source = payload.source === 'extension' || payload.source === 'cdp' ? payload.source : null;
        store.set({
          tabs: Array.isArray(payload.tabs) ? payload.tabs : [],
          tabsError: payload.error === undefined ? null : payload.error,
          tabSource: source,
          /* The host cannot produce localized copy (it has no access to the
             interface language), so it hands over the facts instead: the staged
             directory plus one entry per installed browser, each with its
             extensions URL. The empty state below renders its own wording from
             this — that wording is the part that follows the language. */
          extensionInfo: payload.extensionInfo === undefined ? null : payload.extensionInfo,
          tabState: 'ready'
        });
      } catch (error) {
        store.set({
          tabs: [],
          tabsError: error instanceof Error ? error.message : String(error),
          tabSource: null,
          extensionInfo: null,
          tabState: 'error'
        });
      }
    }

    /** Ask the host to relaunch the local debugging browser on CONFIG.port. */
    async function openDebugBrowser (store) {
      try {
        await fetch(ROUTE + '/open-debug-browser', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ port: CONFIG.port })
        });
      } catch {
        /* The button is a convenience; a failed launch still leaves the retry. */
      }
      await loadTabs(store, CONFIG.port, true);
    }

    /* ------------------------------------------------------------------ *
     * Session scope + the Host's own command channel.
     *
     * Two separate contracts live here, and both were broken the same way:
     * guessing at a facility instead of using the one the Host actually
     * publishes.
     *
     *  1. sessionOf(actx) wants a SESSION-SCOPED context, not the root one.
     *     dsh-client-ui-input-trigger does:
     *         sessionOf(actx){ const id = this.sessions().scopeOf(actx);
     *                          if (id === undefined) throw new Error(
     *                            "slash.sessionOf requires a session scope") }
     *     Passing the root ctx therefore threw, our catch swallowed it, and the
     *     menu closed with no visible effect — the "点开直接闪退" report. The
     *     official queue dock reaches a session scope as
     *     ctx.sessions.scope(sessionId); that is exactly what this does.
     *
     *  2. Commands are executed over the commands remote:
     *         ctx.remote.commands.list(sessionId)
     *           -> [{ name, description, input?: { hint, attachments? } }]
     *         ctx.remote.commands.execute(sessionId, line, attachments)
     *           -> undefined                       (unknown command)
     *            | { commandId, result: { kind:'success', text? }
     *                                | { kind:'error',   text  } }
     *     dsh-client-ui-plan drives plan mode with exactly this call, so using
     *     it makes the Host's OWN Plan chip light up above the composer
     *     instead of us drawing a fake marker.
     * ------------------------------------------------------------------ */

    /** Whether an id is a real session address rather than our synthetic zone key. */
    function isRealSession (sessionId) {
      return typeof sessionId === 'string' && sessionId !== '' && sessionId.indexOf('dcl:') !== 0;
    }

    /** Reach the sessions service defensively; absent is a normal deployment state. */
    function sessionsService () {
      if (rootContext === undefined) return undefined;
      try {
        return rootContext.get('sessions') ?? undefined;
      } catch {
        return undefined;
      }
    }

    /** Resolve the session-scoped context for one real session id, or undefined. */
    function sessionScopeOf (sessionId) {
      if (!isRealSession(sessionId)) return undefined;
      const service = sessionsService();
      if (service === undefined || service === null || typeof service.scope !== 'function') return undefined;
      try {
        return service.scope(sessionId) ?? undefined;
      } catch {
        return undefined;
      }
    }

    /**
     * Open one of the composer's OWN candidate menus through inputTriggers.
     *
     * The hit object is copied field for field from the Host's own call site in
     * dsh-client-ui-conversation:
     *   toggleSource("command", { trigger:"/", query:"", quoted:false,
     *     position: draft.slice(0, selection.start).trim()==="" ? "leading":"inline",
     *     span: { ...selection, draftRev: snapshot.draftRev } })
     * so 'leading' + an empty span is a shape the source genuinely accepts.
     * @returns whether a controller was actually reached.
     */
    function openTriggerMenu (sessionId, source, trigger) {
      if (rootContext === undefined || !isRealSession(sessionId)) return false;
      let triggers;
      try {
        triggers = rootContext.get('inputTriggers') ?? undefined;
      } catch {
        return false;
      }
      if (triggers === undefined || triggers === null || typeof triggers.sessionOf !== 'function') return false;
      const scoped = sessionScopeOf(sessionId);
      if (scoped === undefined) return false;
      try {
        const controller = triggers.sessionOf(scoped);
        if (controller === undefined || typeof controller.toggleSource !== 'function') return false;
        controller.toggleSource(source, {
          trigger,
          query: '',
          quoted: false,
          position: 'leading',
          span: { start: 0, end: 0, draftRev: 0 }
        });
        return true;
      } catch {
        return false;
      }
    }

    /** The composer's own "+" menu: a real, already-hidden button in the DOM. */
    function clickNativeCommandButton () {
      const card = document.querySelector('[data-composer-card]');
      if (card === null) return false;
      const native = card.querySelector('button[aria-haspopup="listbox"]');
      if (native === null) return false;
      native.click();
      return true;
    }

    /** The composer's own hidden file input; this is the whole attach pipeline. */
    function clickNativeFileInput (allowMultiple) {
      const card = document.querySelector('[data-composer-card]');
      if (card === null) return false;
      const input = card.querySelector('input[type="file"]');
      if (input === null) return false;
      /* R41 — the user asked for multi-select files. The Host's input may or may
         not carry the multiple attribute; setting it is a plain DOM property,
         costs nothing when it is already set, and the Host's own change handler
         reads input.files — so every selected file arrives unchanged. */
      if (allowMultiple === true) input.multiple = true;
      input.click();
      return true;
    }

    /** Open the Host's own @ reference — the only intake DSH publishes that can
     *  take a whole FOLDER (and the only place conversations are referenced).
     *
     *  R9 — our menu closes FIRST and the Host menu opens on the next frame.
     *  The inverted order let our own teardown / outside-click handling take the
     *  freshly opened menu down with it, so the menu appeared and clicking a
     *  path did nothing. */
    function openReference (store) {
      store.set({ open: false, execError: null });
      const open = () => {
        if (openTriggerMenu(store.sessionId, 'reference', '@')) return;
        store.set({ execError: t('files.noScope'), open: true, view: 'root', query: '', stack: [] });
      };
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(open);
      } else {
        open();
      }
    }

    /** R19 — the Host's OWN conversation candidates, without the file section.
     *
     * @deepseek-ai/dsh-client-ui-reference registers ONE @ source whose menu
     * merges two lookups: remote.fileReferences (文件与文件夹) and
     * remote.sessionReferenceResolver (对话). The second one is all the user
     * wants on the 「对话」 row, so we call it directly instead of borrowing a
     * menu whose sections are not ours to filter.
     *
     * Reached with ctx.get() and never declared in inject: an inject name that
     * fails to resolve stops the WHOLE plugin from applying, so a namespace
     * owned by another plugin is never declared. */
    async function loadChats (ctx, store) {
      store.set({ chatState: 'loading', chats: [], chatError: null });
      try {
        const service = ctx === undefined || ctx === null ? null : ctx.get('remote.sessionReferenceResolver');
        if (service === null || service === undefined || typeof service.candidates !== 'function') {
          store.set({ chatState: 'error', chats: [], chatError: t('chat.unavailable') });
          return;
        }
        /* The descriptor's first parameter is the agent scope lookup and the
           second is the query — the reference source calls it the same way. */
        const raw = await service.candidates(store.sessionId, '');
        const list = raw !== null && typeof raw === 'object' && 'ok' in raw
          ? (raw.ok === true ? raw.value : null)
          : raw;
        if (!Array.isArray(list)) {
          store.set({ chatState: 'error', chats: [], chatError: t('chat.unavailable') });
          return;
        }
        store.set({
          chats: list.map((item) => ({
            label: String(item.label === undefined ? '' : item.label),
            mention: String(item.mention === undefined ? '' : item.mention),
            cwd: item.cwd === undefined || item.cwd === null ? '' : String(item.cwd),
            sameWorkspace: item.sameWorkspace === true
          })).filter((item) => item.label !== '' && item.mention !== ''),
          chatState: 'ready',
          chatError: null
        });
      } catch (error) {
        store.set({
          chatState: 'error',
          chats: [],
          chatError: error instanceof Error ? error.message : String(error)
        });
      }
    }

    /** The 「对话」 page: conversations only. */
    function viewChats (store) {
      const q = store.query.toLowerCase();
      const out = [crumbBar(store, t('group.add'), t('files.chat'))];
      if (store.chatState === 'loading' || store.chatState === 'idle') {
        out.push(h('div', { className: 'dcl-empty', key: 'l' }, t('chat.loading')));
        return out;
      }
      if (store.chatState === 'error') {
        out.push(h('div', { className: 'dcl-empty', key: 'x' }, [
          h('span', { key: 't' }, store.chatError === null ? t('chat.unavailable') : store.chatError),
          h('button', {
            key: 'r',
            type: 'button',
            className: 'dcl-btn2',
            style: { marginTop: '4px' },
            onClick: () => { void loadChats(rootContext, store); }
          }, t('chat.retry'))
        ]));
        return out;
      }
      const list = store.chats.filter((item) =>
        (item.label + ' ' + item.cwd).toLowerCase().indexOf(q) >= 0);
      if (list.length === 0) out.push(h('div', { className: 'dcl-empty', key: 'e' }, t('chat.empty')));
      /* 按工作区分组（原先是一条平铺长列表）。
       *
       * 为什么要改：宿主 `sessionReferenceResolver.candidates` 返回的是**全部工作区**
       * 的会话，按"同工作区优先"排序、并截断到 `candidateLimit`。当前机器实测：
       * `<工作区>` 一个工作区就有 112 个会话，而默认上限是 50 ⇒ 排序后**从头截断**，
       * 别的 6 个工作区一个都进不来，看上去就是"只显示当前工作区的对话"；
       * 换到会话少的工作区（如「四架构整合方案」5 个）则能看到一小段别的。
       * 宿主上限已提到 500（profile 补丁层，见 session-reference 的 candidateLimit），
       * 这里再把结果**按工作区分组**：当前工作区第一，其余按路径排序，无 cwd 垫底。
       * 分组靠 `item.sameWorkspace`（宿主按"候选 cwd === 本会话 cwd"算好的），不再自己猜。 */
      const groups = [];
      const byCwd = new Map();
      for (const item of list) {
        let group = byCwd.get(item.cwd);
        if (group === undefined) {
          group = { cwd: item.cwd, items: [], current: false };
          byCwd.set(item.cwd, group);
          groups.push(group);
        }
        if (item.sameWorkspace === true) group.current = true;
        group.items.push(item);
      }
      groups.sort((a, b) => {
        if (a.current !== b.current) return a.current ? -1 : 1;
        if (a.cwd === '' || b.cwd === '') return a.cwd === '' ? 1 : -1;
        return a.cwd.localeCompare(b.cwd);
      });
      let sectionSeq = 0;
      for (const group of groups) {
        const title = group.cwd === ''
          ? t('chat.noWorkspace')
          : (group.current ? t('chat.current') + ' · ' + group.cwd : group.cwd);
        out.push(section('chat-sec-' + (sectionSeq++), title, String(group.items.length)));
        for (const item of group.items) {
          out.push(row('chat-' + item.mention, {
            /* R47 — the第二级 rows deliberately use the OUTLINE bubble, so a child
               row never wears the same glyph as its parent 对话 row. */
            icon: ICON.chatLine,
            name: item.label,
            /* 工作区已经在分组标题里了，行内不再重复一遍路径。 */
            desc: '',
            onClick: () => {
              /* R28 — the mention string is NOT a typed grammar: it is the model
                 form of a session reference, and the Host only ever renders it as
                 a chip. Writing it with setDraft produced the raw
                 "@[label](dsh-session:…)" string the user saw, so it now goes
                 through the Host's own insert-reference channel, verbatim
                 (re-wrapping would double the @ and break the resolver). The
                 payload is the one dsh-client-ui-reference onPick builds. */
              store.set({
                pendingChip: {
                  source: 'reference',
                  ref: item.mention,
                  label: item.label,
                  appearance: 'session',
                  clipboardText: item.mention
                },
                open: false
              });
            }
          }));
        }
      }
      return out;
    }

    /** Read the session's slash-command directory. */
    async function loadCommands (ctx, store) {
      if (store.commandState === 'loading') return;
      if (!isRealSession(store.sessionId)) {
        store.set({ commands: [], commandState: 'no-session' });
        return;
      }
      store.set({ commandState: 'loading' });
      try {
        const result = await ctx.remote.commands.list(store.sessionId);
        if (!result || result.ok !== true) {
          store.set({ commands: [], commandState: 'error' });
          return;
        }
        const raw = result.value;
        const list = Array.isArray(raw)
          ? raw
          : (raw !== null && typeof raw === 'object' && Array.isArray(raw.commands) ? raw.commands : []);
        store.set({
          commands: list.map((command) => ({
            name: String(command.name),
            description: command.description === undefined ? '' : String(command.description),
            hint: command.input !== undefined && command.input !== null && typeof command.input.hint === 'string'
              ? command.input.hint
              : ''
          })),
          commandState: 'ready'
        });
      } catch {
        store.set({ commands: [], commandState: 'error' });
      }
    }

    /**
     * Execute one slash command through the Host.
     *
     * Failure is SURFACED, never swallowed: the previous build called a prop
     * that does not exist and produced no feedback at all, which is exactly
     * what "点计划一点 UI 提示都没有" was.
     * @returns null on success, or a human-readable reason.
     */
    async function runSlash (ctx, store, line) {
      if (!isRealSession(store.sessionId)) return t('cmd.noSession');
      try {
        const result = await ctx.remote.commands.execute(store.sessionId, line, []);
        if (result === undefined || result === null) return t('cmd.noResponse');
        if (result.ok !== true) {
          const error = result.error;
          return error === undefined || error === null
            ? t('cmd.execFailed')
            : String(error.message || error.code || t('cmd.execFailed'));
        }
        if (result.value === undefined) return t('cmd.unknown', { line: line });
        const outcome = result.value.result;
        if (outcome !== undefined && outcome !== null && outcome.kind === 'error') {
          return String(outcome.text === undefined ? t('cmd.execFailed') : outcome.text);
        }
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }

    /** Run a slash command from a menu row: close, execute, surface the reason. */
    function invokeSlash (ctx, store, line) {
      store.set({ open: false, execError: null });
      void runSlash(ctx, store, line).then((failure) => {
        if (failure !== null) store.set({ execError: failure, open: true, view: 'root', query: '', stack: [] });
      });
    }

    /** The REAL package a Loader entry belongs to.
     *
     * remote.pluginInventory hands back entry.options.name verbatim: a bare
     * module id, a scope-qualified id, or a package SUBPATH
     * ('dsh-pilot/lib/index.js'). dsh.profile.bundles lists package names
     * only, so the entry has to be reduced to its package before it can be
     * checked against the whitelist — and that reduced name is also what the
     * menu must show, because a Loader path is not a name a user recognises.
     */
    function packageNameOf (moduleName) {
      const raw = String(moduleName).split('\\').join('/');
      const parts = raw.split('/');
      if (raw.charAt(0) === '@' && parts.length >= 2) return parts[0] + '/' + parts[1];
      return parts[0];
    }

    /** The profile's own mount list, published by the Host.
     *
     * dsh.profile.bundles is the authoritative roster of packages this profile
     * actually mounts. The raw Loader inventory is NOT it: internal/preset
     * layers (@deepseek-ai/cordis-plugin-hmr and friends) show up there, and
     * one package loaded under several entries appears several times — which
     * is exactly what made 全部插件 look jumbled.
     *
     * An unreachable route returns null (§ degrade to the unfiltered roster)
     * rather than an empty menu: a broken helper must not look like "you have
     * no plugins".
     */
    async function loadBundleWhitelist () {
      try {
        const response = await fetch(ROUTE + '/bundles', { headers: { accept: 'application/json' } });
        const payload = await response.json();
        if (payload === null || typeof payload !== 'object' || payload.ok !== true) return null;
        if (!Array.isArray(payload.bundles)) return null;
        return payload.bundles.filter((name) => typeof name === 'string' && name !== '');
      } catch {
        return null;
      }
    }

    /* ------------------------------------------------------------------ *
     * 与「插件组合器」(dsh-capability-composer) 联动
     *
     * 组合器是**唯一真相**：本插件的「常用插件 / 全部插件 / 技能」列表要跟它一致 ——
     * 在工作区选了哪几套组合，这里就只显示那些插件/技能。
     * 它给出的 '/effective' 是只读的，读不到就退回"列全部"（绝不假装收窄过）。
     * ------------------------------------------------------------------ */
    let EFFECTIVE = { at: 0, key: '', value: null };

    /**
     * 当前会话的工作区路径，读自宿主的 sessions 快照；读不到返回 ''。
     *
     * **必须由客户端把 cwd 一起带上**。宿主 composer 的宿主半边只
     * `inject = ['skills']`，`ctx.sessions` 是 undefined ⇒ 它拿到 sessionId 后
     * **不一定补得出 cwd**，而工作区级的 pin 全靠 cwd 命中。这里读的是组合器 UI
     * 自己用的同一份快照（`ctx.get('sessions').list.getSnapshot()`），所以两边一致。
     * 全程容错：任何一步读不到就返回 ''，由宿主自己再试一次。
     * @param sessionId - 启动器所在会话。
     * @returns 绝对路径，或 ''。
     */
    function currentCwdOf (sessionId) {
      try {
        if (rootContext === undefined || rootContext === null) return '';
        if (typeof sessionId !== 'string' || sessionId === '') return '';
        const svc = typeof rootContext.get === 'function' ? rootContext.get('sessions') : undefined;
        const list = svc === undefined || svc === null ? undefined : svc.list;
        if (list === undefined || list === null || typeof list.getSnapshot !== 'function') return '';
        const snap = list.getSnapshot();
        const byId = snap === null || snap === undefined ? undefined : snap.byId;
        const rec = byId === undefined || byId === null ? undefined : byId[sessionId];
        const cwd = rec === undefined || rec === null ? undefined : rec.cwd;
        return typeof cwd === 'string' ? cwd : '';
      } catch {
        return '';
      }
    }

    /**
     * 读组合器的「当前生效组合」。
     *
     * **必须带上自己所在的会话**。组合器的 `/effective` 原先只看
     * `lastEnv`（最近一次跑过 pre-step 的会话）—— 在新会话里、或刚换过工作区时，
     * 那个值是**上一个会话**的 ⇒ 解析出的是旧作用域的组合。实测症状：某工作区
     * 明明选了两套组合，启动器只显示其中一套（另一套挂在被解析到的那个作用域下）。
     * 现在把 `sessionId` 带上，宿主按**本会话**解析；缓存也按会话分键，
     * 切会话不会复用别人的答案。
     * @param sessionId - 启动器所在会话；空串则退回旧行为（宿主用 lastEnv）。
     * @param force - true 时忽略 4 秒缓存。
     */
    async function loadEffective (sessionId, force) {
      const now = Date.now();
      const key = typeof sessionId === 'string' ? sessionId : '';
      if (force !== true && key === EFFECTIVE.key && now - EFFECTIVE.at < 4000) return EFFECTIVE.value;
      try {
        const cwd = currentCwdOf(key);
        const url = '/dsh-capability-composer/effective'
          + (key === '' ? '' : '?sessionId=' + encodeURIComponent(key)
            + (cwd === '' ? '' : '&cwd=' + encodeURIComponent(cwd)));
        const response = await fetch(url, { headers: { accept: 'application/json' } });
        const payload = await response.json();
        EFFECTIVE = { at: now, key, value: (payload !== null && typeof payload === 'object' && payload.ok === true) ? payload : null };
      } catch {
        EFFECTIVE = { at: now, key, value: null };
      }
      return EFFECTIVE.value;
    }

    /** 组合名拼成人看的一行。 */
    function effectiveNames (eff) {
      const names = eff !== null && Array.isArray(eff.names) ? eff.names : [];
      return names.length === 0 ? '' : names.join(' + ');
    }

    /** 去掉重复项、保持原顺序。
     *
     * 「不同组合内容有重复的，重复的给到上下文就爆炸，重复的自动抵消」。
     * 组合器那边多选取并集时已经按 id/名字去过重（全是 Set），启用到这一层再兜一道，
     * 保证「常用插件 / 技能 / 全部插件」三个列表里**同一个名字只出现一次**。 */
    function dedupeByName (list) {
      const seen = new Set();
      const out = [];
      for (const item of Array.isArray(list) ? list : []) {
        const key = item !== null && typeof item === 'object' ? String(item.name) : String(item);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
      return out;
    }

    /** 「全部插件」那一行的计数文案。
     *
     * 被组合收窄时把**总数**也写出来。以前两个调用点都无条件写
     * 「共 {n} 个已装插件」，而 n 是**收窄后**的条数 ⇒ 读起来像"机器上只装了这么多"
     * （看到「共 14 个已装插件」以为总数就是 14）。没收窄时（n === total）
     * 文案保持原样。
     * @param scoped - 收窄后的条数。
     * @param total - 已装总数（store.plugins 的长度）。
     */
    function pluginCountText (scoped, total) {
      const n = Number(scoped) || 0;
      const all = Number(total) || 0;
      if (n === all) return t('plugins.descN', { n });
      return t('plugins.descScoped', { n, total: all });
    }

    /** 插件列表按组合收窄；返回 { list, note }。 */
    function scopePlugins (plugins, eff) {
      const all = Array.isArray(plugins) ? plugins : [];
      if (eff === null) return { list: all, note: t('scope.unknown') };
      const info = eff.plugin;
      if (info === undefined || info === null || info.filtering !== true) {
        return { list: all, note: t('scope.all', { n: all.length }) };
      }
      if (info.none === true) return { list: [], note: t('scope.none') };
      const pkgs = Array.isArray(info.pkgs) ? info.pkgs : [];
      const ids = Array.isArray(info.ids) ? info.ids : [];
      /* 判据从「包名精确相等」放宽到**三重身份**。
       *
       * 原先只比 `p.name`，可两边的命名口径本来就不一样：组合器目录给的是 `pkg`
       * （例如 `dsh-code-coverage/plugin`），而清单里的包名是 `dsh-code-coverage`
       * ⇒ 精确相等必然落空，在范围内的插件被判成范围外。
       * 目录里还有权威的 `id`（`dsh-code-coverage`），`catalogId`/`catalogPkg`
       * 由 loadPlugins 从同一份目录合并进来。现在 name / catalogPkg / catalogId
       * **任一命中**即算在范围内。 */
      const inScope = (p) => pkgs.indexOf(p.name) >= 0
        || (typeof p.catalogPkg === 'string' && p.catalogPkg !== '' && pkgs.indexOf(p.catalogPkg) >= 0)
        || (typeof p.catalogId === 'string' && p.catalogId !== '' && ids.indexOf(p.catalogId) >= 0);
      const list = all.filter(inScope);
      return {
        list,
        /* 两个数都给出去：只报收窄后的数会被当成"机器上只装了这么多"（原话：
           「不止14个吧」）。 */
        note: t('scope.plugins', { names: effectiveNames(eff), n: list.length, total: all.length })
      };
    }

    /** 技能列表按组合收窄；返回 { list, note }。 */
    function scopeSkills (skills, eff) {
      const all = Array.isArray(skills) ? skills : [];
      if (eff === null) return { list: all, note: t('scope.unknown') };
      const info = eff.skill;
      if (info === undefined || info === null || info.filtering !== true) {
        return { list: all, note: t('scope.all', { n: all.length }) };
      }
      if (info.none === true) return { list: [], note: t('scope.none') };
      const names = Array.isArray(info.names) ? info.names : [];
      const list = all.filter((s) => names.indexOf(s.name) >= 0);
      return { list, note: t('scope.skills', { names: effectiveNames(eff), n: list.length }) };
    }

    /** 右上角那颗「去设置组合」按钮。
     *
     * **不要加 'title'**：菜单自己有一套悬浮提示，原生 title 会跟它双弹
     * （自检 C1 专门盯着这条）。按钮上的字已经说清了要干什么。 */
    function composerJumpButton (kind, store) {
      return h('button', {
        key: 'jump-' + kind,
        type: 'button',
        className: 'dcl-btn2 dcl-jump',
        onClick: (event) => {
          if (event !== undefined && typeof event.preventDefault === 'function') event.preventDefault();
          if (event !== undefined && typeof event.stopPropagation === 'function') event.stopPropagation();
          if (composerReady(store) !== true) return;
          jumpToComposerSettings(kind);
        }
      }, kind === 'skill' ? t('jump.skill.short') : t('jump.plugins.short'));
    }

    /* 'ok' = reachable, 'missing' = plugin absent or endpoint broken. Cached —
       the button can be pressed repeatedly, and a miss does not turn into a
       probe on every click. Only a clean NOT-OK with no TransportError marker
       is cached: a network/sandbox refusal says nothing about the plugin. */
    const COMPOSER_PRESENCE = { cache: null, cachePkgs: null };
    async function composerInstalled () {
      try {
        const res = await fetch('/dsh-capability-composer/state', { headers: { accept: 'application/json' } });
        if (res.ok) {
          try {
            const body = await res.json();
            return body !== null && body !== undefined;
          } catch (err) {
            return false;
          }
        }
        if (res.headers !== undefined && res.headers !== null
          && typeof res.headers.get === 'function' && res.headers.get('TransportError') !== null) {
          return true;
        }
        return false;
      } catch (err) {
        return true;
      }
    }
    /**
     * 点「设置组合」之前先确认组合器在不在。
     *
     * 组合器是另一个插件（dsh-capability-composer），不在线时跳设置页只会落到一个
     * 空页签上，读起来像本插件的 bug —— 所以这里给出指名道姓的提示，并且不跳。
     * 探测结果命中缓存，任何一个 store 变了都让缓存失效。
     */
    function composerReady (store) {
      if (COMPOSER_PRESENCE.cachePkgs !== store.plugins) {
        COMPOSER_PRESENCE.cachePkgs = store.plugins;
        COMPOSER_PRESENCE.cache = null;
      }
      if (COMPOSER_PRESENCE.cache === 'ok') { return true; }
      if (COMPOSER_PRESENCE.cache === 'missing') { return false; }
      COMPOSER_PRESENCE.cache = 'pending';
      composerInstalled().then((installed) => {
        COMPOSER_PRESENCE.cachePkgs = store.plugins;
        COMPOSER_PRESENCE.cache = installed ? 'ok' : 'missing';
        if (!installed) { flashComposerMissing(store); }
      }, () => {
        COMPOSER_PRESENCE.cachePkgs = null;
        COMPOSER_PRESENCE.cache = null;
      });
      return null;
    }
    function flashComposerMissing (store) {
      store.set({ composerMissing: true });
      setTimeout(() => {
        try { store.set({ composerMissing: false }); } catch (err) { /* unmounted */ }
      }, 15000);
    }

    /**
     * 跳到组合器的设置页。
     *
     * 纯 DOM 点击（宿主没有"打开某个设置页"的公开 API）：设置 → 插件 → 插件组合
     * （技能走 设置 → 技能 → 组合技能）。每一步都容错 —— 找不到就当没发生，绝不抛。
     */
    function jumpToComposerSettings (kind) {
      /* Every step carries a list of candidate labels: the host renders these
         nav entries in the interface language (zh 设置/插件/插件组合, en
         Settings/Plugins/Plugin composition; the skills route ends at en
         Composed skills), so matching one exact Chinese string made this jump a
         silent no-op on an English interface. The Chinese candidates stay
         literal on purpose: they are the host's own labels to MATCH against,
         not copy this plugin renders. */
      const steps = kind === 'skill'
        ? [['设置', 'Settings'], ['技能', 'Skills'], ['组合技能', 'Composed skills']]
        : [['设置', 'Settings'], ['插件', 'Plugins'], ['插件组合', 'Plugin composition']];
      const clickLabel = (label) => {
        let nodes = [];
        try {
          nodes = Array.prototype.slice.call(document.querySelectorAll('button,[role="tab"],[role="menuitem"]'));
        } catch {
          return false;
        }
        for (const node of nodes) {
          const aria = (node.getAttribute('aria-label') || '').trim();
          const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
          if (aria === label || text === label) {
            node.click();
            return true;
          }
        }
        return false;
      };
      let index = 0;
      const tick = () => {
        if (index >= steps.length) return;
        for (const candidate of steps[index]) { if (clickLabel(candidate)) break; }
        index += 1;
        setTimeout(tick, 700);
      };
      try {
        tick();
      } catch {
        /* 跳不过去就只是没跳过去 */
      }
    }

    /** 插件清单缓存：清单是远程读的，冷启动第一下可能还没回来 —— 界面不许空着。 */
    const PLUGIN_CACHE_KEY = 'dsh-composer-launcher/plugin-cache';
    function loadPluginCache () {
      try {
        const raw = localStorage.getItem(PLUGIN_CACHE_KEY);
        if (raw === null) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed !== null && parsed !== undefined ? parsed.plugins : null)
          && parsed.plugins.length > 0 ? parsed.plugins : null;
      } catch {
        return null;
      }
    }
    function savePluginCache (plugins) {
      try {
        localStorage.setItem(PLUGIN_CACHE_KEY, JSON.stringify({ at: Date.now(), plugins }));
      } catch {
        /* 存不下就每次现读，不影响功能 */
      }
    }
    /**
     * 从**组合器**拿插件目录（中文名 / 描述 / 工具数 / 字节数）。
     *
     * 为什么跨插件读：插件 = 一组工具，这两件事本来就是一份真相；各自猜的结果
     * 就是被反馈到的「筛选插件里根本认不出哪个是哪个」。
     * 读不到就退回包名 —— **绝不**因为对方不在线让选择器空掉。
     */
    async function loadComposerCatalog () {
      try {
        const res = await fetch('/dsh-capability-composer/catalog', { headers: { accept: 'application/json' } });
        if (!res.ok) return null;
        const body = await res.json();
        const rows = Array.isArray(body !== null && body !== undefined ? body.plugins : null) ? body.plugins : [];
        if (rows.length === 0) return null;
        const map = new Map();
        for (const row of rows) {
          for (const key of [row.pkg, row.id]) {
            if (typeof key === 'string' && key !== '') map.set(key, row);
          }
        }
        return map;
      } catch {
        return null;
      }
    }
    /** 把一个插件行和组合器目录对上（包名 → 末段 → 条目 id → 去掉 dsh- 的短名）。 */
    function catalogOf (map, plugin) {
      if (map === null) return null;
      const name = String(plugin.name);
      const bare = name.indexOf('/') >= 0 ? name.split('/').pop() : name;
      const keys = [name, bare, bare.replace(/^dsh-/, ''), plugin.entryId === null || plugin.entryId === undefined ? '' : String(plugin.entryId)];
      for (const key of keys) {
        if (key === '') continue;
        const hit = map.get(key);
        if (hit !== undefined) return hit;
      }
      return null;
    }
    /** 字节 → 大概 token（实测 163 KB ≈ 41.7k token ⇒ 约 3.9 字节/token）。 */
    function approxTokens (bytes) {
      return Math.round((Number(bytes) || 0) / 3.9);
    }

    /** Read the plugin roster from the built-in inventory remote, narrowed to
     * the profile's real mount list and de-duplicated by package name. */
    async function loadPlugins (ctx, store) {
      if (store.pluginState === 'loading') return;
      /* ① 先把缓存摆上去：界面立刻有东西（看到的"空列表"就是这么来的）。 */
      const empty = !Array.isArray(store.plugins) || store.plugins.length === 0;
      if (empty) {
        const cached = loadPluginCache();
        if (cached !== null) {
          store.set({ plugins: cached, pluginsScoped: cached, pluginState: 'ready', pluginNote: t('plugins.fromCache') });
        }
      }
      store.set({ pluginState: 'loading' });
      try {
        const result = await ctx.remote.pluginInventory.list();
        if (!result.ok) throw new Error(result.error.code);
        const entries = Array.isArray(result.value.entries) ? result.value.entries : [];
        /* 这里**不再**用 profile bundles 白名单过滤。
         *
         * 「添加插件的时候就会显示一堆插件，我可以添加全部的插件」。
         * 白名单原本是为了躲开"同一包多条 entry 的全插件乱序"（见 packageNameOf 的注释），
         * 而那个问题已经在归并到包名 + 去重时解决了；再叠一层白名单，只要 bundles 读不全
         * 就会把清单**清空**（表现出来就是"点添加插件什么都没显示"）。 */
        const seen = {};
        const plugins = [];
        for (const entry of entries) {
          const raw = entry === null || entry === undefined || entry.moduleName === undefined
            ? ''
            : String(entry.moduleName);
          if (raw === '') continue;
          const name = packageNameOf(raw);
          if (name === '') continue;
          if (seen[name] === true) continue;
          seen[name] = true;
          plugins.push({
            name,
            enabled: entry.enabled === true,
            entryId: entry.entryId === null || entry.entryId === undefined ? null : String(entry.entryId)
          });
        }
        /**
         * 用 profile 的挂载清单（bundles）过滤掉内部层/预置层 —— 但**三种写法都认**。
         *
         * 这就是「点添加插件什么都没显示」的真根因：
         *    'dsh.profile.bundles' 里写的是**条目 id / 短名**（'docker'、'dsh-agent-teams'、
         *    'dshmarket'），而 inventory 给的是**包名**（'@hyzyn/dsh-docker'）。原来越过
         *    白名单比较 'whitelist.indexOf(name)' 一律不中 ⇒ **全被过滤光** ⇒ 清单空白
         *    （设置页的「+ 添加插件」和「全部插件」都是空的）。
         *    现在：包名 / 包名最后一段 / 条目 id，任一个命中就保留。
         */
        const whitelist = await loadBundleWhitelist();
        const allow = (plugin) => {
          if (whitelist === null) return true; // 读不到清单 ⇒ 不过滤（宁可多列，也不给空清单）
          const bare = plugin.name.indexOf('/') >= 0 ? plugin.name.split('/').pop() : plugin.name;
          const withoutDsh = bare.replace(/^dsh-/, '');
          return whitelist.indexOf(plugin.name) >= 0
            || whitelist.indexOf(bare) >= 0
            || whitelist.indexOf(withoutDsh) >= 0
            || (plugin.entryId !== null && whitelist.indexOf(plugin.entryId) >= 0);
        };
        const visible = plugins.filter(allow);
        /* 清单是**全部可添加的**（设置页的「+ 添加插件」要能挑到）；面板里显示的是**按组合收窄后**的那份。 */
        const eff = await loadEffective(store.sessionId);
        /* ② 和组合器的目录合一份：中文名 + 描述 + 工具数 + 大概 token。
              读不到就只剩包名 —— 功能不降级，只是显示得笨一点。 */
        const catalog = await loadComposerCatalog();
        const enriched = visible.map((plugin) => {
          const hit = catalogOf(catalog, plugin);
          return hit === null ? plugin : Object.assign({}, plugin, {
            title: hit.name,
            summary: hit.description,
            toolCount: hit.tools,
            bytes: hit.bytes,
            uiOnly: hit.uiOnly === true,
            mcp: hit.mcp === true,
            /* 把目录里的**另外两种身份**一起记下来，供 scopePlugins
               匹配：两边命名口径不同（目录 pkg 可能是 `dsh-code-coverage/plugin`，
               清单里却叫 `dsh-code-coverage`），只比包名会漏判在范围内的插件。 */
            catalogId: hit.id === undefined || hit.id === null ? null : String(hit.id),
            catalogPkg: hit.pkg === undefined || hit.pkg === null ? null : String(hit.pkg)
          });
        });
        /* 收窄只算**一次** —— 列表与说明文案必须来自同一次计算，否则两个数会互相打架
           （原先 list 用 enriched、note 用 visible，口径不同）。 */
        const scoped = scopePlugins(enriched, eff);
        store.set({
          plugins: dedupeByName(enriched),
          pluginsScoped: dedupeByName(scoped.list),
          pluginNote: scoped.note,
          effective: eff,
          pluginState: 'ready'
        });
        savePluginCache(dedupeByName(enriched));
      } catch {
        /* 读失败**不能**把界面清空：缓存里那份继续显示，并明确标出"这是缓存"。 */
        const cached = loadPluginCache();
        if (cached !== null) {
          store.set({ plugins: cached, pluginsScoped: cached, pluginState: 'ready', pluginNote: t('plugins.fromCache') });
        } else {
          store.set({ plugins: [], pluginState: 'error' });
        }
      }
    }

    /** Read the session's skills through the built-in skills remote.
     *
     * The wire shape is fixed by dsh-client-ui-skill:
     *   const result = await skills.list({ sessionId }, signal)
     *   if (!result.ok) throw ...
     *   return result.value.skills        // <- the array lives here
     *
     * "sessionId" must be a REAL session address: the host answers an empty
     * list for anything it cannot map to an agent. This host does not hand the
     * composer slots a sessionId (it was dropped from the standard kit), so the
     * synthetic per-zone key cannot resolve one — hence the explicit
     * "unavailable" state instead of a silently empty menu. */
    async function loadSkills (ctx, store) {
      if (store.skillState === 'loading') return;
      const sessionId = store.sessionId;
      const looksReal = typeof sessionId === 'string' && sessionId !== '' && sessionId.indexOf('dcl:') !== 0;
      if (!looksReal) {
        store.set({ skills: [], skillState: 'no-session' });
        return;
      }
      store.set({ skillState: 'loading' });
      try {
        const result = await ctx.remote.skills.list({ sessionId });
        if (!result || result.ok !== true) {
          store.set({ skills: [], skillState: 'error' });
          return;
        }
        const list = result.value !== undefined && Array.isArray(result.value.skills)
          ? result.value.skills
          : [];
        const skills = dedupeByName(list.map((skill) => ({
          name: String(skill.name),
          description: skill.description === undefined ? '' : String(skill.description)
        })));
        /* 跟插件同理：面板里只显示**当前组合放行**的技能。 */
        const eff = await loadEffective(store.sessionId);
        const scoped = scopeSkills(skills, eff);
        store.set({
          skills,
          skillsScoped: dedupeByName(scoped.list),
          skillNote: scoped.note,
          effective: eff,
          skillState: 'ready'
        });
      } catch {
        store.set({ skills: [], skillState: 'error' });
      }
    }

    /* ------------------------------------------------------------------ *
     * Chip payload — what actually reaches the model.
     * ------------------------------------------------------------------ */
    function chipPayload (chip) {
      if (chip.kind === 'plugin') return '【使用插件】' + chip.label;
      /* A page reference without its ADDRESS is useless to the reader: a bare
         title leaves them with nothing to open. The URL travels with the
         chip now. */
      if (chip.kind === 'web') {
        const url = chip.url === undefined || chip.url === null ? '' : String(chip.url);
        return url === '' ? '【参考网页】' + chip.label : '【参考网页】' + chip.label + ' — ' + url;
      }
      if (chip.kind === 'skill') return '【技能】' + chip.label;
      if (chip.kind === 'mcp') return '【MCP】' + chip.label;
      return '【' + chip.label + '】';
    }

    function draftWith (chips, draft) {
      const parts = chips.map(chipPayload);
      if (draft !== undefined && draft.trim() !== '') parts.push(draft);
      return parts.join('\n');
    }

    /* ------------------------------------------------------------------ *
     * Picking
     * ------------------------------------------------------------------ */
    const MODE_LABELS = { plan: 'plan', goal: 'goal' };

    /**
     * Add one pick to the rail. Plan and goal are mutually exclusive — both
     * drive the same agent step loop in DSH, so only one may be armed at a time.
     *
     * The signature is deliberately (store, entry) and nothing else. It used to
     * carry 'inputActions' and a parameter NAMED draftRef that every caller
     * filled with the draft STRING; the deselect branch then handed that string
     * to setDraft(), so un-picking a chip overwrote the composer. Keeping a
     * ref-shaped name around invites exactly that mistake, and a chip is state
     * on the store — never a draft. The payload is spliced in by the send
     * interceptor at submit time and nowhere else.
     * @returns a user-facing notice, or null.
     */
    function pick (store, entry) {
      const label = entry.label;
      const existing = store.chips.findIndex((c) => c.label === label);
      if (existing >= 0) {
        /* DESELECT: remove the chip and stop there — the composer is not ours
           to rewrite. */
        store.chips.splice(existing, 1);
        return null;
      }
      let notice = null;
      const counterpart = MODE_LABELS[entry.kind] === 'plan' ? 'goal' : 'plan';
      if (MODE_LABELS[entry.kind] !== undefined) {
        const otherLabel = counterpart === 'plan' ? t('chip.plan') : t('chip.goal');
        const otherAt = store.chips.findIndex((c) => c.label === otherLabel);
        if (otherAt >= 0) {
          store.chips.splice(otherAt, 1);
          notice = counterpart === 'plan' ? t('conflict.goal') : t('conflict.plan');
        }
      }
      /* A chip must keep its ADDRESS. Every web pick site passes the tab's url,
         and this line used to drop everything but label/kind/icon, so
         chipPayload() never saw a url and EVERY 【参考网页】 payload arrived as
         a bare title with no way to find the page. The R23 assertion only
         checked the pick SITE, which is why a source regex stayed green while
         the value was discarded one call later. */
      const chip = { label, kind: entry.kind, icon: entry.icon };
      if (typeof entry.url === 'string' && entry.url !== '') chip.url = entry.url;
      store.chips.push(chip);
      if (entry.kind === 'plugin') bumpFrequency(label.replace('用 ', '').replace(' 插件', ''));
      /* Deliberately NOT writing the payload into the draft here: the send
         interceptor splices it in at submit time, which is what keeps the
         composer clean while the chip is on the rail. The same rule governs
         the deselect branch above. */
      return notice;
    }

    /* ------------------------------------------------------------------ *
     * Plugin pick rules
     * ------------------------------------------------------------------ */
    /**
     * 同一个插件在系统里有好几种写法，常驻名单里存哪个都可能：
     *   · 包名            '@m1khal3v/dsh-tool-codegraph'   ← 选择器里加进去的是这种
     *   · 包名末段        'dsh-tool-codegraph'
     *   · 去掉 dsh- 的    'tool-codegraph'
     *   · 老默认值里的短名 'codegraph'
     * 原来一律用 '===' 比，于是"设置页钉着、加号界面却标未安装"（
     * 收到的反馈「常驻插件添加不了」里就有这一半）：加进去的写法跟显示时比对的写法不一致。
     * 现在统一走这个函数，四种写法互相都认。
     */
    function samePluginName (left, right) {
      const a = String(left ?? '')
      const b = String(right ?? '')
      if (a === '' || b === '') return false
      if (a === b) return true
      const bare = (name) => (name.indexOf('/') >= 0 ? name.split('/').pop() : name)
      const barA = bare(a); const barB = bare(b)
      if (barA === barB) return true
      const strip = (name) => name.replace(/^dsh-/, '')
      if (strip(barA) === strip(barB)) return true
      if (strip(barA) === barB || barA === strip(barB)) return true
      /* 最后一段短名（'codegraph' ↔ 'dsh-tool-codegraph'）——只做兜底，
         要求两边都不是空，避免空串互相命中。 */
      const tail = (name) => name.split('-').pop()
      return tail(barA) === tail(barB)
    }

    function rankedPlugins (config, plugins) {
      const freq = readFrequency();
      const list = Array.isArray(plugins) ? plugins : [];
      /**
       * 常驻（pinned）**不再要求 enabled**，也不能被条数上限截掉。
       *
       * 「常驻插件这个设置跟加号界面不一致」。两个原因：
       * ① 原来 'pinned' 只从 'enabled' 里挑 —— 明确钉住的插件一旦没启用（或
       *      inventory 报 enabled=false），加号界面就**一个都不显示**，而设置页里那条
       *      常驻还挂着；
       *   ② 条数上限（pluginCount）会把常驻项截掉。
       * 现在：常驻项一律显示（连"没启用"的也显示，并在 desc 里标明），上限至少放到常驻条数。
       */
      const pinned = config.pinned
        .map((name) => list.find((p) => samePluginName(p.name, name)))
        .filter((p) => p !== undefined)
        .map((p) => Object.assign({}, p, { pinned: true }));
      const rest = list
        .filter((p) => p.enabled && !config.pinned.some((name) => samePluginName(p.name, name)))
        .sort((a, b) => (freq[b.name] === undefined ? 0 : freq[b.name])
                      - (freq[a.name] === undefined ? 0 : freq[a.name]))
        .map((p) => Object.assign({}, p, { pinned: false }));
      const cap = Math.max(config.pluginCount, pinned.length);
      if (config.pluginMode === 'pinned') return pinned.slice(0, cap);
      if (config.pluginMode === 'frequent') return rest.slice(0, config.pluginCount);
      const out = pinned.slice();
      for (const p of rest) {
        if (out.length >= cap) break;
        out.push(p);
      }
      return out.slice(0, cap);
    }

    /* ------------------------------------------------------------------ *
     * Row builder
     * ------------------------------------------------------------------ */
    function row (key, options) {
      /* R44 — a row that shows BOTH halves at once, half-width each. The user
         asked for exactly this instead of a second-level chooser: "既然你做不到
         点击直接选择文件或者文件夹，你就做到两个UI显示，直接把它对半分". */
      if (Array.isArray(options.split)) {
        return h('div', { key, className: 'dcl-item dcl-split' }, options.split.map((half, index) =>
          h('button', {
            key: 'h' + index,
            type: 'button',
            className: 'dcl-half',
            onClick: half.onClick,
            onMouseDown: (event) => event.preventDefault()
          }, [
            h('span', { className: 'dcl-ic', key: 'i', dangerouslySetInnerHTML: { __html: half.icon === undefined ? '' : half.icon } }),
            h('span', { className: 'dcl-half-t', key: 'n' },
              h('span', { className: 'dcl-nm' }, half.label),
              half.desc === undefined ? null : h('span', { className: 'dcl-ds' }, half.desc))
          ])));
      }
      const children = [
        h('span', { className: 'dcl-ic' + (options.brand === true ? '' : ''), key: 'i',
          style: options.brand === true ? { color: 'var(--dsw-alias-brand-primary)' } : undefined,
          dangerouslySetInnerHTML: { __html: options.icon === undefined ? '' : options.icon } }),
        h('span', { className: 'dcl-nm', key: 'n' }, options.name)
      ];
      if (options.desc !== undefined) children.push(h('span', { className: 'dcl-ds', key: 'd' }, options.desc));
      else children.push(h('span', { className: 'dcl-ds', key: 'd' }));
      if (options.trailing !== undefined) children.push(h('span', { className: 'dcl-tr', key: 't' }, options.trailing));
      const props = {
        key,
        type: 'button',
        className: 'dcl-item',
        onClick: options.onClick,
        onMouseDown: (event) => event.preventDefault()
      };
      /* R10 — a row may carry its own hover handlers. The 「悬停查看全部 N 个
         标签页」 row is the ONLY thing that opens the tab panel now, so it needs
         to own the enter/leave pair. */
      if (options.props !== undefined && options.props !== null) Object.assign(props, options.props);
      return h('button', props, children);
    }

    function section (key, title, end) {
      return h('div', { className: 'dcl-sec', key },
        title,
        end === undefined ? null : h('span', { className: 'dcl-sec-end' }, end));
    }

    /* ------------------------------------------------------------------ *
     * Menu views
     * ------------------------------------------------------------------ */
    /* ------------------------------------------------------------------ *
     * #3 — the tab row's hover panel.
     *
     * The row is deliberately SHORT (webCount tabs + one 「…」). Hovering the
     * group floats the full list out from above; leaving waits HOVER_LEAVE_MS
     * before closing, so travelling from the row into the panel does not
     * flicker it shut.
     * ------------------------------------------------------------------ */
    const WEB_HOVER_LEAVE_MS = 180;

    /* Geometry for the floated tab panel — same discipline as menuBox: pure
       arithmetic on the anchor rect, so "it always fits on screen" is testable
       without a layout engine. It prefers to sit ABOVE the row group; when the
       anchor is too close to the top edge for MIN_H it flips BELOW; in the
       degenerate case it pins itself inside the viewport.
       A real-Chromium probe forced this: portalling fixed the clipping by
       .dcl-scroll/.dcl-menu, but an UNCAPPED panel then ran off the TOP of the
       window (121px lost, only 2 of 5 rows visible) whenever the anchor sat
       high on the screen. */
    const HOVER_MIN_H = 96;
    const HOVER_MAX_H = 320;
    const HOVER_GAP = 4;
    const HOVER_EDGE = 8;

    /**
     * @param anchor - the row group's rect (top/bottom are read; the caller
     *                 copies left/width straight through).
     * @param viewportHeight - window.innerHeight.
     * @returns {{ placement: string, height: number, top: (number|null),
     *             bottom: (number|null) }} 'height' is the max-height cap: the
     *             panel grows away from its anchored edge, so capping it is
     *             what keeps it on screen.
     */
    function hoverPanelBox (anchor, viewportHeight) {
      const above = anchor.top - HOVER_GAP - HOVER_EDGE;
      if (above >= HOVER_MIN_H) {
        return {
          placement: 'above',
          height: Math.min(HOVER_MAX_H, above),
          top: null,
          bottom: viewportHeight - (anchor.top - HOVER_GAP)
        };
      }
      const below = viewportHeight - anchor.bottom - HOVER_GAP - HOVER_EDGE;
      const height = Math.min(HOVER_MAX_H, Math.max(HOVER_MIN_H, below));
      return {
        placement: 'below',
        height,
        top: Math.max(HOVER_EDGE, Math.min(anchor.bottom + HOVER_GAP, viewportHeight - HOVER_EDGE - height)),
        bottom: null
      };
    }

    /** The tab group: a SHORT row list plus a panel that floats out ABOVE it.
     *
     * The panel is portalled to <body> and positioned fixed, because where it
     * used to live TWO ancestors clip it: .dcl-scroll (overflow-y:auto) and
     * .dcl-menu (overflow:hidden). The old note ("it can never escape the menu
     * box") was true as a BOUND and wrong as a design — a floated list is
     * exactly the thing that must be able to leave a short menu. Geometry comes
     * from the anchor's own rect, recomputed while it is open.
     *
     * Because a portal is not a DOM descendant of the anchor, the pointer
     * crossing the seam from row to panel counts as leaving the group: the
     * panel therefore re-arms the hover itself, and the 180ms leave delay covers
     * the gap.
     */
    function WebTabGroup (props) {
      const store = props.store;
      const tabs = Array.isArray(props.tabs) ? props.tabs : [];
      const webCount = props.webCount;
      const anchorRef = react.useRef(null);
      /* The leave timer lives in a per-INSTANCE ref, not a module-level slot:
         a module variable is shared by every mounted tab group, so a second
         group clearing "the" timer would cancel the first one's pending close,
         and an unmount used to leave it armed against a store that outlives the
         component. */
      const hoverTimer = react.useRef(null);
      const armHover = (next) => {
        if (hoverTimer.current !== null) {
          clearTimeout(hoverTimer.current);
          hoverTimer.current = null;
        }
        if (next === true) {
          if (store.webHover !== true) store.set({ webHover: true });
          return;
        }
        hoverTimer.current = setTimeout(() => {
          hoverTimer.current = null;
          store.set({ webHover: false });
        }, WEB_HOVER_LEAVE_MS);
      };
      const [rect, setRect] = react.useState(null);
      const open = store.webHover === true;
      const shown = tabs.slice(0, webCount);
      const overflow = tabs.length > webCount;

      /* react.useLayoutEffect, like MenuPortal measures with: the panel is
         positioned from the anchor's rect, and a plain effect would let the
         first frame paint with the placeholder geometry (left/width 0, no
         placement). With a layout effect the measurement lands before paint,
         and the portal below is additionally gated on rect !== null so an
         unpositioned panel can never be mounted at all. */
      react.useLayoutEffect(() => {
        if (!open) return undefined;
        const anchor = anchorRef.current;
        if (anchor === null || anchor === undefined) return undefined;
        const update = () => {
          const r = anchor.getBoundingClientRect();
          setRect((prev) => (prev !== null && prev.left === r.left && prev.width === r.width &&
            prev.top === r.top && prev.bottom === r.bottom
            ? prev
            : { left: r.left, width: r.width, top: r.top, bottom: r.bottom }));
        };
        update();
        window.addEventListener('resize', update);
        /* Capture: the menu's own scroll does not bubble. */
        window.addEventListener('scroll', update, true);
        return () => {
          window.removeEventListener('resize', update);
          window.removeEventListener('scroll', update, true);
          /* Disarm IMMEDIATELY, not through armHover(false): that one arms the
             180ms leave delay, which would leave the panel expanded for a
             moment after the menu is gone (and for a reopen inside that
             window). The store outlives this component, so the reset has to be
             synchronous here. */
          if (hoverTimer.current !== null) {
            clearTimeout(hoverTimer.current);
            hoverTimer.current = null;
          }
          if (store.webHover === true) store.set({ webHover: false });
        };
      }, [open]);

      /* Unmounting must not leave the pending close timer pointing at a dead
         component. The store outlives this tree, so the timer is the only thing
         that can still fire. */
      react.useEffect(() => () => {
        if (hoverTimer.current !== null) {
          clearTimeout(hoverTimer.current);
          hoverTimer.current = null;
        }
      }, []);

      /* F4 — one row per tab: [favicon] 名称… 地址… · 浏览器名. The name and the
         address carry the DATA caps (tabName/tabHost) and let CSS ellipsis do
         the visual truncation; the browser name rides the trailing slot. */
      const rows = shown.map((tab) => row('web-' + tab.id, {
        icon: tabIcon(tab),
        name: tabName(tab),
        desc: tabHost(tab),
        trailing: tabTrailing(tab),
        onClick: () => { pick(store, { label: tabName(tab), kind: 'web', icon: tabIcon(tab), url: typeof tab.url === 'string' ? tab.url : '' }); store.set({ open: false }); }
      }));
      if (overflow) {
        /* R10 — the affordance NAMES itself, so the leading three dots are gone
           ("左边有三个点点点去掉，因为原来的UI显示就是点点点"), and this row is
           the only opener of the panel ("应该是悬浮到悬停查看全部五个标签页…
           才会出现上面的二级菜单"). */
        rows.push(row('web-more', {
          /* 「向上的箭头换成 3 个点」→「右边的删了左边的换横向
             3 点」。所以：左边 = ICON.more（横向三点，和别的"更多"一致），
             右边那个 dcl-tr 里的向上箭头**整个删掉**（不再传 trailing）。
             历史：R10 曾经把左边三点去掉（"左边有三个点点点去掉"），R17 才补的
             向上箭头；现在按最新要求回到三点，但**只留一个**。 */
          icon: ICON.more,
          name: t('web.hoverHint', { n: tabs.length }),
          desc: '',
          onClick: () => { armHover(true); },
          props: {
            'data-dcl-webmore': '1',
            onMouseEnter: () => armHover(true),
            onMouseLeave: () => armHover(false)
          }
        }));
      }
      const viewport = typeof window === 'undefined' || !window.innerHeight ? 720 : window.innerHeight;
      const box = rect === null ? null : hoverPanelBox(rect, viewport);
      /* Gated on rect !== null as well as open/overflow: a panel with no
         measurement yet would render at left/width 0 with no placement. */
      const panel = open && overflow && box !== null
        ? reactDom.createPortal(
          h('div', {
            className: 'dcl-webhov',
            'data-dcl-webhov': '1',
            'data-dcl-placement': box.placement,
            style: {
              position: 'fixed',
              left: rect.left + 'px',
              width: rect.width + 'px',
              /* Exactly one edge is anchored; the max-height cap is what keeps
                 the panel inside the viewport (see hoverPanelBox). */
              top: box.top === null ? undefined : box.top + 'px',
              bottom: box.bottom === null ? undefined : box.bottom + 'px',
              maxHeight: box.height + 'px'
            },
            onMouseEnter: () => armHover(true),
            onMouseLeave: () => armHover(false)
          }, tabs.map((tab) => row('webhov-' + tab.id, {
            icon: tabIcon(tab),
            name: tabName(tab),
            desc: tabHost(tab),
            trailing: tabTrailing(tab),
            onClick: () => { pick(store, { label: tabName(tab), kind: 'web', icon: tabIcon(tab), url: typeof tab.url === 'string' ? tab.url : '' }); store.set({ open: false }); }
          }))),
          document.body
        )
        : null;

      return h('div', {
        className: 'dcl-webbox',
        'data-dcl-webbox': '1',
        ref: anchorRef
        /* R10 — NO handlers here. This box wraps every tab row, so hovering any
           single tab used to pop the full panel ("悬浮在任意一个标签页的时候都会
           出现上面的菜单"). The open/close pair now lives on the web-more row
           (below) and on the panel itself. */
      }, rows, panel);
    }

    function viewRoot (ctx, store) {
      const cfg = CONFIG;
      const out = [];

      /* A command that failed has to say so. The previous build called a prop
         that never existed (props.command), so plan/goal silently did
         nothing — this banner is that class of failure made visible. */
      if (store.execError !== null) {
        out.push(h('div', { className: 'dcl-banner', key: 'exec' },
          h('span', { key: 't' }, store.execError),
          h('span', {
            className: 'dcl-banner-x',
            key: 'x',
            title: t('common.close'),
            onClick: () => store.set({ execError: null })
          }, '×')));
      }

      /* 「设置组合」was pressed with the composer plugin absent. It self-clears
         (flashComposerMissing) and is dismissible; it is NOT execError, which a
         successful later command would wipe while this one still matters. */
      if (store.composerMissing === true) {
        out.push(h('div', { className: 'dcl-banner', key: 'composerMissing' },
          h('span', { key: 't' }, t('jump.composer.missing')),
          h('span', {
            className: 'dcl-banner-x',
            key: 'x',
            title: t('common.close'),
            onClick: () => store.set({ composerMissing: false })
          }, '×')));
      }

      /* --- 1. 添加 --- */
      const addRows = [];

      /* Tabs. The three connection outcomes call for different user actions, so
         the state line is driven by tabSource (which route answered) and not
         by "is the list empty" — a dead probe and an empty browser used to look
         exactly the same, which is why "连不上" was impossible to diagnose. */
      if (cfg.showWeb) {
        if (store.tabState === 'loading') {
          addRows.push(h('div', { className: 'dcl-state', key: 'ws-l' }, t('web.loading')));
        } else if (store.tabState === 'ready' || store.tabState === 'error') {
          if (store.tabSource === 'extension') {
            addRows.push(h('div', { className: 'dcl-state', key: 'ws-ext' },
              t('web.state.extension', { n: store.tabs.length })));
          } else if (store.tabSource === 'cdp') {
            addRows.push(h('div', { className: 'dcl-state dcl-state-warn', key: 'ws-cdp' },
              t('web.state.cdp', { n: store.tabs.length, port: cfg.port })));
          } else {
            addRows.push(h('div', { className: 'dcl-state dcl-state-err', key: 'ws-none' },
              t('web.state.none', { port: cfg.port })));
          }
        }
        /* B2 — the browser entry IS this tab list, for EVERY source. There is
           no 「打开调试浏览器」 row any more: a CDP debug port is a fallback
           READER of tabs, never "your browser", and offering it as the entry
           is exactly what made this group answer 「打开调试浏览器」 when the
           user asked for their tabs. Launching that second browser profile is
           a maintenance action, so it lives in 设置 → 启动器. */
        addRows.push(h(WebTabGroup, {          key: 'webbox',
          store,
          tabs: store.tabs,
          webCount: cfg.webCount
        }));
        if (store.tabState === 'ready' && store.tabs.length === 0) {
          /* V14 — the empty state has to be ACTIONABLE. The old copy ("两条路
             都没通：扩展没装，调试端口也没开") was accurate and useless: there
             was nowhere to go from it. Both recoveries live right here now. */
          const installLine = extensionInstallLine(store, t);
          addRows.push(h('div', { className: 'dcl-note dcl-note-web', key: 'ws-empty' }, [
            h('span', { key: 't' }, t('web.emptyHint')),
            installLine === null ? null : h('span', { key: 'i', className: 'dcl-hint' }, installLine),
            h('span', { key: 'a', className: 'dcl-pinrow', style: { marginTop: '6px' } }, [
              h('button', {
                key: 'retry',
                type: 'button',
                className: 'dcl-btn2',
                onClick: () => { void loadTabs(store, CONFIG.port, true); }
              }, t('web.retry')),
              h('button', {
                key: 'dbg',
                type: 'button',
                className: 'dcl-btn2',
                onClick: () => { void openDebugBrowser(store); }
              }, t('web.debugGo'))
            ])
          ]));
        }
      }

      /* R9 — ONE row, and its BODY opens the OS file dialog directly: no menu of
         choices in between ("文件与文件夹点开，直接就跳出来，系统的选择框…而不是
         点开有各种各样让我选").
         The folder half cannot ride the same OS dialog: Windows rejects
         openFile + openDirectory together (Electron only allows both on macOS),
         which is a platform fact, not a wiring bug. It therefore sits in the
         same row as a small 「文件夹」 affordance that opens the Host's own @
         reference — the only folder-capable intake DSH publishes.
         「对话」 is its OWN row now: it used to be mixed into the file row's
         menu ("里面有对话…不应该跟文件有文件夹腻在一起"). */
      if (cfg.showFiles) {
        addRows.push(row('files', {
          split: [
            {
              icon: ICON.files,
              label: t('files.pick'),
              desc: t('files.pickFileHint'),
              onClick: () => {
                const ok = clickNativeFileInput(true);
                store.set({ open: false });
                if (!ok) store.set({ execError: t('files.missing'), open: true, view: 'root', query: '', stack: [] });
              }
            },
            {
              icon: ICON.folder,
              label: t('files.dirBtn'),
              desc: t('files.pickFolderHint'),
              onClick: () => { void chooseFolder(store); }
            }
          ]
        }));
        addRows.push(row('chat', {
          icon: ICON.chat,
          name: t('files.chat'),
          desc: t('files.chatHint'),
          /* R19 — OUR OWN conversation-only list. The Host's @ menu merges two
             sections (文件与文件夹 + 对话) and the user only ever wanted the
             second one here ("把文件夹删掉，只保留对话"); the sections are the
             Host's own, so borrowing its menu can never satisfy that. We ask the
             same remote for its session candidates and render them ourselves —
             no files, no folders, and no drill-down into paths. */
          onClick: () => { void loadChats(ctx, store); goView(store, 'chats'); }
        }));
      }

      if (cfg.showPlan) {
        addRows.push(row('plan', {
          icon: ICON.plan,
          name: t('plan.title'),
          /* R34 — the row STATES its current state instead of only promising an
             action, so "which mode owns my next message" is readable without
             remembering what was clicked. */
          desc: store.planOn === true ? t('plan.on') : t('plan.desc'),
          /* E2 — ON is a green dot, OFF is nothing (状态是宿主的，只读). */
          trailing: modeDot(store.planOn === true),
          onClick: () => {
            /* R34 — opening plan mode withdraws an armed goal mode in the SAME
               click: the two can never be armed together.
               V3 — a TOGGLE, not "open plan mode again". The official chip
               clears plan mode with "/plan off"
               (dsh-client-ui-plan/lib/client.js: ctx.remote.commands.execute(
               sessionId, "/plan off", [])). The old build re-ran the bare
               "/plan" on every click, so a second click never turned it off
               ("再点击计划模式应该是关闭，但是实际上指令是这样的") and the green
               dot stayed lit forever because the Host projection stayed on. */
            const turningOn = store.planOn !== true;
            if (turningOn && goalArmed(store)) store.set({ goalMode: null });
            invokeSlash(ctx, store, turningOn ? '/plan' : '/plan off');
          }
        }));
      }
      if (cfg.showGoal) {
        /* #10 — the 目标 row is a TOGGLE, and it sends nothing. A bare /goal is
           the "view the goal" command: it runs a conversation turn, so the
           previous build could not be taken back. The mode itself is local
           (see toggleGoalMode / applyGoalMode), and re-clicking here is the
           withdraw entry point — the indicator chip cannot live in
           conversation.input.plan (that slot is a SINGLE-occupant slot — see
           the apply() comment; a second registration throws, and shadowing it
           would hide the official Plan chip). */
        const armed = goalArmed(store);
        /* R57 — THE ROW ANNOUNCES WHAT THE NEXT MESSAGE WILL DO, NOT THE OLD GOAL.
         *
         * Reported: "当我打开目标之后，旧的进程目标竟然还会显示这个难以置信". While
         * armed this row used to render the HOST goal's objective
         * ("进行中：<old objective>"), i.e. the goal created by an EARLIER test send.
         * That is truthful about the Host but useless about the gesture, and it is
         * exactly what made a stale objective look like the current one. The row
         * owns the ARMING state, so it says that; the Host's own goal UI (and the
         * 计划-era goal row) is where a running goal belongs. */
        addRows.push(row('goal', {
          icon: ICON.goal,
          name: t('goal.title'),
          desc: armed ? t('goal.descArmed') : t('goal.desc'),
          trailing: modeDot(armed),
          onClick: () => { toggleGoalMode(ctx, store); }
        }));
      }
      if (addRows.length > 0) out.push(section('sec-add', t('group.add')), addRows);

      /* --- 2. 能力 --- */
      const capRows = [];
      if (cfg.showCmd) {
        capRows.push(row('cmd', {
          icon: ICON.cmd,
          name: t('cmd.title'),
          desc: t('cmd.desc'),
          trailing: h('span', { className: 'dcl-tr' }, [
            h('span', { className: 'dcl-kbd', key: 'k' }, 'Ctrl+/'),
            h('span', { className: 'dcl-dr', key: 'd', dangerouslySetInnerHTML: { __html: ICON.chev } })
          ]),
          onClick: () => { void loadCommands(ctx, store); goView(store, 'commands'); }
        }));
      }
      if (cfg.showSkill) {
        capRows.push(row('skill', {
          icon: ICON.skill,
          name: t('skill.title'),
          desc: t('skill.desc'),
          trailing: h('span', { className: 'dcl-dr', dangerouslySetInnerHTML: { __html: ICON.chev } }),
          onClick: () => { loadSkills(ctx, store); goView(store, 'skills'); }
        }));
      }
      if (cfg.showMcp) {
        capRows.push(row('mcp', {
          icon: ICON.mcp,
          name: t('mcp.title'),
          /* Report the CACHED count while a revalidate runs, so this never
             flashes 0 and then jumps to the real number. */
          desc: store.mcpState === 'idle'
            ? t('mcp.descLoading')
            : t('mcp.desc', { n: store.mcpServers.length }),
          trailing: h('span', { className: 'dcl-dr', dangerouslySetInnerHTML: { __html: ICON.chev } }),
          onClick: () => { void loadMcp(ctx, store, { force: false }); goView(store, 'mcp'); }
        }));
      }
      if (capRows.length > 0) out.push(section('sec-cap', t('group.capability')), capRows);

      /* --- 3. 常用插件 --- */
      /* 只放**当前组合放行**的插件（组合器是唯一真相；读不到就退回全部）。
       * 常驻里**不在当前组合**的那些仍然显示（标出来），否则设置页钉着、这里看不见 = 不一致。 */
      const scopedBase = Array.isArray(store.pluginsScoped) ? store.pluginsScoped : store.plugins;
      const outsidePinned = cfg.pinned
        .filter((name) => !scopedBase.some((p) => samePluginName(p.name, name)))
        .map((name) => ({ name, enabled: false, entryId: t('scope.outside'), outside: true }));
      const scopedPlugins = scopedBase.concat(outsidePinned);
      const quick = rankedPlugins(cfg, scopedPlugins);
      const plugRows = quick.map((p) => row('plug-' + p.name, {
        icon: iconFor(p.name),
        name: p.name,
        desc: p.entryId === null ? '' : p.entryId,
        trailing: h('span', { className: 'dcl-dot ' + (p.pinned ? 'dcl-dot-pin' : 'dcl-dot-hot') }),
        onClick: () => {
          pick(store, { label: t('chip.plugin', { name: p.name }), kind: 'plugin', icon: iconFor(p.name) });
          store.set({ open: false });
        }
      }));
      plugRows.push(row('plug-all', {
        icon: ICON.grid,
        name: t('plugins.title'),
        desc: store.pluginState === 'ready' ? pluginCountText(scopedPlugins.length, Array.isArray(store.plugins) ? store.plugins.length : scopedPlugins.length) : t('plugins.desc'),
        trailing: h('span', { className: 'dcl-dr', dangerouslySetInnerHTML: { __html: ICON.chev } }),
        onClick: () => { loadPlugins(ctx, store); goView(store, 'plugins'); }
      }));
      out.push(section('sec-plug', t('group.plugins'), composerJumpButton('plugin', store)), plugRows);
      if (typeof store.pluginNote === 'string' && store.pluginNote !== '') {
        out.push(h('div', { className: 'dcl-note dcl-scope', key: 'scope-plug' }, store.pluginNote));
      }
      return out;
    }

    /* #6 — there is no 文件与文件夹 second level any more: both ingestion paths
       are level-1 rows in viewRoot (pick files / @ reference). */

    /** 指令: the Host's real slash-command directory, executed on click. */
    function viewCommands (ctx, store) {
      const q = store.query.toLowerCase();
      const out = [crumbBar(store, t('group.capability'), t('cmd.sub'))];
      if (store.commandState === 'loading' || store.commandState === 'idle') {
        out.push(h('div', { className: 'dcl-empty', key: 'l' }, t('cmd.loading')));
        return out;
      }
      if (store.commandState === 'no-session') {
        out.push(h('div', { className: 'dcl-empty', key: 'n' }, t('skill.noSession')));
        return out;
      }
      if (store.commandState === 'error') {
        out.push(h('div', { className: 'dcl-empty', key: 'x' }, t('cmd.error')));
        return out;
      }
      const list = store.commands.filter((command) =>
        (command.name + ' ' + command.description).toLowerCase().indexOf(q) >= 0);
      if (list.length === 0) out.push(h('div', { className: 'dcl-empty', key: 'e' }, t('cmd.empty')));
      for (const command of list) {
        out.push(row('cmd-' + command.name, {
          icon: ICON.cmd,
          name: '/' + command.name,
          desc: command.description,
          onClick: () => { invokeSlash(ctx, store, '/' + command.name); }
        }));
      }
      /* V17 — say HOW MANY the Host published. The list is exactly what
         ctx.remote.commands.list(sessionId) returns (nothing here is truncated),
         so when it looks short the reason is the Host's per-session set, not
         this plugin. Showing the count makes that visible instead of arguable
         ("本插件的指令没有包括所有指令，只是一些指令"). */
      out.push(h('div', { className: 'dcl-hint', key: 'cnt' }, t('cmd.count', { n: store.commands.length })));
      /* Escape hatch to the Host's own panel, for anything this list omits. */
      out.push(row('cmd-native', {
        icon: ICON.cmd,
        name: t('cmd.native'),
        desc: 'Ctrl+/',
        onClick: () => {
          const ok = clickNativeCommandButton();
          store.set({ open: false });
          if (!ok) store.set({ execError: t('cmd.noButton'), open: true, view: 'root', query: '', stack: [] });
        }
      }));
      return out;
    }

    /* ------------------------------------------------------------------ *
     * Navigation — a real back stack, not a hard-wired jump to root.
     * ------------------------------------------------------------------ */
    /** Enter a sub-view, remembering where we came from. */
    function goView (store, view) {
      store.stack.push(store.view);
      store.set({ view, query: '' });
    }

    /** Leave a sub-view: return to the view that opened it (root if none). */
    function goBack (store) {
      const previous = store.stack.pop();
      store.set({ view: previous === undefined ? 'root' : previous, query: '' });
    }

    /**
     * The level-2 header every subpage opens with.
     *
     * It carries a real back button, the parent's name, a VISIBLE '›'
     * separator and the current page. The previous version drew the separator
     * with an inline SVG that had no width/height, so the arrow rendered as an
     * unsized replaced element (300x150 default) and was effectively invisible —
     * which is why 能力 and MCP looked like two peers instead of two levels.
     * A text glyph cannot regress that way.
     */
    function crumbBar (store, parentLabel, currentLabel, right) {
      return h('div', { className: 'dcl-lv2' },
        h('button', {
          type: 'button',
          className: 'dcl-back',
          key: 'back',
          title: t('back'),
          'aria-label': t('back'),
          onClick: () => goBack(store),
          dangerouslySetInnerHTML: { __html: ICON.back }
        }),
        h('span', { className: 'dcl-lv2-b', key: 'p' }, parentLabel),
        h('span', { className: 'dcl-lv2-b', key: 's' }, '›'),
        h('span', { className: 'dcl-lv2-t', key: 'c' }, currentLabel),
        right === undefined ? null : h('span', { className: 'dcl-lv2-r', key: 'r' }, right));
    }

    function searchBar (store, placeholder) {
      /* #15 — the fixed-height .dcl-searchbox absorbs the hover scale, so the
         field can grow to 1.05x without pushing or clipping its neighbours. */
      return h('div', { className: 'dcl-searchbox' },
        h('div', { className: 'dcl-search' },
        h('span', { dangerouslySetInnerHTML: { __html: ICON.search }, style: { display: 'inline-flex', color: 'var(--dsw-alias-label-caption)' } }),
        h('input', {
          value: store.query,
          placeholder,
          onChange: (event) => store.set({ query: event.currentTarget.value })
        })));
    }

    function viewWeb (store) {
      const q = store.query.toLowerCase();
      const list = store.tabs.filter((x) => (x.title + ' ' + x.host).toLowerCase().indexOf(q) >= 0);
      const out = [crumbBar(store, t('group.add'), t('web.title'))];
      if (list.length === 0) out.push(h('div', { className: 'dcl-empty', key: 'e' }, t('web.empty')));
      for (const tab of list) {
        /* F4 — same row contract as the root menu's tab group. */
        out.push(row('w-' + tab.id, {
          icon: tabIcon(tab),
          name: tabName(tab),
          desc: tabHost(tab),
          trailing: tabTrailing(tab),
          onClick: () => {
            pick(store, { label: tabName(tab), kind: 'web', icon: tabIcon(tab), url: typeof tab.url === 'string' ? tab.url : '' });
            store.set({ open: false });
          }
        }));
      }
      out.push(h('div', { className: 'dcl-hint', key: 'h' }, t('web.hint', { port: CONFIG.port })));
      return out;
    }

    function viewSkills (store) {
      const q = store.query.toLowerCase();
      /* 右上角那颗「设置组合」：点了直接跳 设置 → 技能 → 组合技能。 */
      const out = [crumbBar(store, t('group.capability'), t('skill.title'), composerJumpButton('skill', store))];
      if (store.skillState === 'loading' || store.skillState === 'idle') {
        out.push(h('div', { className: 'dcl-empty', key: 'l' }, t('skill.loading')));
        return out;
      }
      if (store.skillState === 'no-session') {
        out.push(h('div', { className: 'dcl-empty', key: 'n' }, t('skill.noSession')));
        return out;
      }
      if (store.skillState === 'error') {
        out.push(h('div', { className: 'dcl-empty', key: 'x' }, t('skill.error')));
        return out;
      }
      const scopedSkills = Array.isArray(store.skillsScoped) ? store.skillsScoped : store.skills;
      const list = scopedSkills.filter((s) => (s.name + ' ' + s.description).toLowerCase().indexOf(q) >= 0);
      if (list.length === 0) out.push(h('div', { className: 'dcl-empty', key: 'e' }, t('skill.empty')));
      for (const skill of list) {
        out.push(row('s-' + skill.name, {
          icon: iconFor(skill.name),
          name: skill.name,
          desc: skill.description,
          /* C2 — 「已启用」 as a dot: green = available. */
          trailing: statusDot('on', t(DOT_LABEL_KEY.on)),
          onClick: () => {
            pick(store, { label: '/' + skill.name, kind: 'skill', icon: ICON.skill });
            store.set({ open: false });
          }
        }));
      }
      if (typeof store.skillNote === 'string' && store.skillNote !== '') {
        out.push(h('div', { className: 'dcl-note dcl-scope', key: 'scope-skill' }, store.skillNote));
      }
      return out;
    }

    /* ------------------------------------------------------------------ *
     * MCP — real integration with dsh-mcp-manager-ui.
     *
     * Its client API is the remote namespace 'mcpManager', reached through
     * ctx.get('remote.mcpManager'). (That plugin never writes the literal
     * 'ctx.remote.mcpManager.', so grepping for one wrongly suggests it has no
     * API at all — the subagent that traced it nearly reported "none".)
     * Every call resolves to { ok:true, value } or { ok:false, error }.
     *
     * SCOPE, deliberately narrow — what was asked for and nothing more:
     *   · global enable / disable
     *   · per-workspace visibility of a GLOBAL server (exclude / unexclude)
     * No add, no remove, no edit, no per-tool control.
     * ------------------------------------------------------------------ */
    function mcpService (ctx) {
      try {
        return ctx.get('remote.mcpManager') ?? null;
      } catch {
        return null;
      }
    }

    /** One remote call, normalised. Never throws. */
    async function mcpCall (ctx, method, args) {
      const service = mcpService(ctx);
      if (service === null || typeof service[method] !== 'function') {
        return { ok: false, error: t('mcp.noService') };
      }
      try {
        const raw = args === undefined ? await service[method]() : await service[method](args);
        if (raw !== null && typeof raw === 'object' && 'ok' in raw) {
          return raw.ok === true
            ? { ok: true, value: raw.value }
            : { ok: false, error: (raw.error && (raw.error.message || raw.error.code)) || t('mcp.callFailed') };
        }
        return { ok: true, value: raw };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    /** R20 — the Host's own NATIVE folder chooser.
     *
     * @deepseek-ai/dsh-api-workspace-controller publishes the remote namespace
     * "directoryPicker" with pick(): string | null — a real OS folder dialog
     * whose result can be ANY drive, which is exactly "自定义全局文件夹". It is
     * reached with ctx.get() and deliberately NOT declared in inject: the real
     * loader refuses to apply a plugin whose inject names do not all resolve, so
     * a namespace that may be absent must never be declared.
     * @returns the chosen absolute path, or null when the Host has no picker.
     */
    async function pickFolderWithHost () {
      try {
        const ctx = rootContext;
        if (ctx === undefined || ctx === null) return { available: false, path: null };
        const service = ctx.get('remote.directoryPicker');
        if (service === null || service === undefined || typeof service.pick !== 'function') {
          return { available: false, path: null };
        }
        const raw = await service.pick();
        const value = raw !== null && typeof raw === 'object' && 'ok' in raw
          ? (raw.ok === true ? raw.value : null)
          : raw;
        return { available: true, path: typeof value === 'string' && value !== '' ? value : null };
      } catch {
        /* Present but threw: that is NOT the same as absent, and the caller
           reports it differently. */
        return { available: true, path: null };
      }
    }

    /** The folder half of 「文件与文件夹」.
     *
     * Windows cannot put openFile beside openDirectory in ONE OS dialog (only
     * macOS can), so the folder side is its own native dialog: the Host picker
     * when it exists, otherwise the @ reference menu — and when the picker is
     * MISSING that is now said out loud, because the silent fallback is exactly
     * why "选不了文件夹" stayed mysterious for three rounds. */
    async function chooseFolder (store) {
      const probe = await pickFolderWithHost();
      if (probe.available !== true) {
        store.set({ execError: t('files.noHostPicker'), open: false, wsOpen: false });
        openReference(store);
        return;
      }
      if (probe.path === null) {
        /* The user cancelled in the OS dialog. Stay quiet about it. */
        store.set({ open: false, wsOpen: false });
        return;
      }
      /* Hand the path to LauncherButton, which is the only place holding a
         legal setDraft handle; this view has no input actions. The mention is
         built here (R29) so the row carries a complete reference insertion,
         trailing directory slash included, instead of a bare path string. */
      const mention = folderMentionOf(probe.path);
      if (mention === null) {
        store.set({ execError: t('files.noMention'), open: false, wsOpen: false });
        return;
      }
      const slash = Math.max(probe.path.lastIndexOf('\\'), probe.path.lastIndexOf('/'));
      store.set({
        pendingChip: {
          source: 'reference',
          ref: mention,
          label: probe.path.slice(slash + 1),
          appearance: 'folder',
          clipboardText: mention
        },
        open: false,
        wsOpen: false
      });
    }

    /** Normalize one server row from mcpManager.list(). */
    function mapServer (row) {
      return {
        name: String(row.serverName),
        enabled: row.enabled === true,
        managed: row.managed === true,
        conflict: row.conflict === true,
        transport: row.transport === undefined ? '' : String(row.transport),
        /* summarize() publishes 'phase', NOT 'status'. Reading a field the host
           never sends is why the subtitle was permanently blank. */
        phase: row.phase === undefined ? '' : String(row.phase),
        toolCount: typeof row.toolCount === 'number' ? row.toolCount : 0,
        lastError: row.lastError === undefined || row.lastError === null ? null : String(row.lastError)
      };
    }

    /** Remembered workspace choice, so the picker is never "未选择". */
    const WS_KEY = 'dsh-composer-launcher/workspace';

    function readSavedWorkspace () {
      if (typeof localStorage === 'undefined') return '';
      try {
        const raw = localStorage.getItem(WS_KEY);
        return raw === null ? '' : raw;
      } catch {
        return '';
      }
    }

    function saveWorkspace (wsPath) {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(WS_KEY, wsPath);
      } catch {
        /* A blocked store must not break the picker. */
      }
    }

    /** Pull a directory path out of whatever shape a workspace service returns. */
    function digPath (value) {
      if (typeof value === 'string') return value;
      if (value === null || typeof value !== 'object') return '';
      for (const key of ['path', 'wsPath', 'workspacePath', 'cwd']) {
        if (typeof value[key] === 'string' && value[key] !== '') return value[key];
      }
      for (const key of ['current', 'workspace', 'active', 'currentWorkspace', 'recent']) {
        const nested = digPath(value[key]);
        if (nested !== '') return nested;
      }
      return '';
    }

    /**
     * The workspace the CURRENT SESSION belongs to, when that is discoverable.
     *
     * Deliberately defensive: several services can carry this (uiWorkspace,
     * workspaces, the session scope itself) and which one is present depends on
     * the composition. An empty answer is acceptable — the picker falls back to
     * the last explicit choice and then to the first workspace in the list — but
     * guessing wrongly is not, so every probe is guarded.
     * @returns a workspace path, or '' when nothing resolved.
     */
    function currentWorkspacePath (sessionId) {
      /* R59 — THE SESSION'S OWN cwd IS THE ONLY AUTHORITATIVE ANSWER.
       *
       * R46/R58 ranked the workspace SERVICES (uiWorkspace / workspace /
       * workspaces) and their getters, but the reported symptom survived both:
       * "当前工作区默认的不是当前工作区". Those services describe which workspace
       * the APP last focused, not which one THIS SESSION runs in. The session
       * list does carry it (dsh-api-session-controller/lib/client.js:3406 stamps
       * entry.cwd), and the reference plugin reads the same store as
       * sessions.list.getSnapshot().byId[...]. So that is probed first, and the
       * service guesses only remain as a fallback. */
      try {
        const svc = rootContext === undefined || rootContext === null ? undefined : rootContext.get('sessions');
        const list = svc === undefined || svc === null ? undefined : svc.list;
        if (list !== undefined && list !== null && typeof list.getSnapshot === 'function') {
          const snapshot = list.getSnapshot();
          const entries = snapshot === undefined || snapshot === null ? undefined : snapshot.byId;
          const id = sessionId === undefined || sessionId === null ? '' : String(sessionId);
          const own = id !== '' && entries !== undefined && entries !== null ? entries[id] : undefined;
          const found = digPath(own);
          if (found !== '') return found;
          const fallback = digPath(snapshot === undefined || snapshot === null ? undefined : snapshot.current);
          if (fallback !== '') return fallback;
        }
      } catch {
        /* the service guesses below are still available */
      }
      const scoped = sessionScopeOf(sessionId);
      const scopes = scoped === undefined ? [rootContext] : [scoped, rootContext];
      for (const scope of scopes) {
        if (scope === undefined) continue;
        for (const name of ['uiWorkspace', 'workspace', 'workspaces']) {
          let service;
          try {
            service = scope.get(name) ?? undefined;
          } catch {
            service = undefined;
          }
          if (service === undefined || service === null) continue;
          /* R58 — THE SESSION'S WORKSPACE IS NOT THE LAST ONE TOUCHED.
             "recentWorkspace" was probed FIRST, so this returned the most
             recently used workspace of the whole app rather than the one this
             session runs in - exactly the reported "当前工作区默认的不是当前工作
             区，是其他工作区". It is the weakest signal of the five, so it is
             probed last and the current-selection getters win. */
          for (const getter of ['current', 'currentPath', 'getSnapshot', 'path', 'recentWorkspace']) {
            if (typeof service[getter] !== 'function') continue;
            try {
              const found = digPath(service[getter]());
              if (found !== '') return found;
            } catch {
              /* try the next shape */
            }
          }
        }
      }
      return '';
    }

    /**
     * Read the global server list, then the workspace list.
     *
     * Two behaviours here are the latency fix, not decoration:
     *   · only the FIRST load shows a skeleton. A revalidate keeps the last good
     *     list on screen, so the subtitle never flickers back to "0 个服务器"
     *     and then jumps to "1" (which is what read as huge latency);
     *   · 'listWorkspaces()' answers { workspaces, revision } — an OBJECT. The
     *     previous build tested Array.isArray on it, so 'workspaces' stayed
     *     empty forever and the footnote said 当前工作区未选择 no matter what.
     */
    async function loadMcp (ctx, store, options) {
      const opts = options === undefined ? {} : options;
      if (store.mcpState === 'loading' && opts.force !== true) return;
      if (store.mcpAt === 0) store.set({ mcpState: 'loading' });

      const listed = await mcpCall(ctx, 'list');
      if (!listed.ok) {
        if (store.mcpAt === 0) store.set({ mcpServers: [], mcpError: listed.error, mcpState: 'error' });
        return;
      }
      const servers = listed.value !== undefined && Array.isArray(listed.value.servers)
        ? listed.value.servers
        : [];
      store.set({
        mcpServers: servers.map(mapServer),
        mcpError: null,
        mcpState: 'ready',
        mcpAt: Date.now()
      });
      /* R6b — if anything is still coming up, keep watching it. */
      scheduleMcpPoll(ctx, store);

      const spaces = await mcpCall(ctx, 'listWorkspaces');
      if (!spaces.ok) {
        /* V4 — this used to be a silent 'return'. When the remote is
           unreachable the picker just stays empty and the user sees
           「未选择工作区」 with no reason and no other workspace anywhere
           ("只会显示当前工作区选择的时候都看不到，其他工作区"). Surface the
           reason and keep the last good roster instead of blanking it. */
        store.set({ mcpError: spaces.error });
        return;
      }
      const bucket = spaces.value;
      const rows = bucket !== undefined && bucket !== null && Array.isArray(bucket.workspaces)
        ? bucket.workspaces
        : [];
      const workspaces = rows.map((space) => ({
        path: String(space.path ?? space.wsPath ?? ''),
        name: String(space.name ?? space.path ?? ''),
        serverCount: typeof space.serverCount === 'number' ? space.serverCount : 0
      })).filter((space) => space.path !== '');
      const known = store.wsPicked === true && workspaces.some((space) => space.path === store.wsPath);
      const saved = readSavedWorkspace();
      /* R46 — the CURRENT workspace wins. The order used to be
         "already-chosen -> saved-in-localStorage -> current -> first", so a
         workspace remembered from an earlier session overrode the one this
         session actually runs in ("当前工作区应该是选择当前的工作区，但是你默认的
         是其他工作区"). An explicit choice made in this menu still wins; after
         that the session's own workspace; only then the remembered one. */
      const current = currentWorkspacePath(store.sessionId);
      const target = known
        ? store.wsPath
        : (current !== '' && current !== undefined && workspaces.some((space) => space.path === current)
            ? current
            : (workspaces.some((space) => space.path === saved)
                ? saved
                : (workspaces.length > 0 ? workspaces[0].path : '')));
      store.set({ workspaces });
      if (target !== store.wsPath || store.wsExclude.length === 0) {
        if (target !== '') await chooseWorkspace(ctx, store, target, true);
      }
    }

    /** Select a workspace, persist the choice, and read its view.
     *  R59 — ONLY AN EXPLICIT PICK IS PERSISTED, and only an explicit pick
     *  counts as "already chosen". The automatic pick (quiet) used to be saved
     *  too, so a wrong auto-default from an earlier open became the remembered
     *  workspace AND known === true made every later open keep it - which is
     *  why the picker still defaulted to another workspace after R58. */
    async function chooseWorkspace (ctx, store, wsPath, quiet) {
      if (quiet !== true) {
        saveWorkspace(wsPath);
        store.wsPicked = true;
      }
      store.set({ wsPath, wsServers: [] });
      if (quiet !== true) store.set({ mcpBusy: 'ws' });
      const view = await mcpCall(ctx, 'getWorkspaceView', { wsPath });
      if (!view.ok) {
        store.set({ wsExclude: [], mcpError: quiet === true ? store.mcpError : view.error });
      } else {
        const value = view.value === undefined || view.value === null ? {} : view.value;
        const exclude = Array.isArray(value.exclude) ? value.exclude : [];
        const servers = Array.isArray(value.servers) ? value.servers : [];
        store.set({
          wsExclude: exclude.map(String),
          wsServers: servers.map((row) => ({
            name: String(row.name ?? row.serverName ?? ''),
            toolCount: typeof row.toolCount === 'number' ? row.toolCount : 0,
            status: row.status === undefined ? '' : String(row.status)
          }))
        });
      }
      if (quiet !== true) store.set({ mcpBusy: '' });
    }

    /**
     * Toggle one global server on or off.
     *
     * OPTIMISTIC on purpose: the flip lands in local state before the round trip
     * so the switch answers in 0 ms, then a revalidate reconciles. Waiting for
     * disable+list serially is what made this feel slow.
     */
    async function toggleMcp (ctx, store, name) {
      const row = store.mcpServers.find((s) => s.name === name);
      if (row === undefined || store.mcpBusy !== '') return;
      const next = !row.enabled;
      const snapshot = row.enabled;
      row.enabled = next;
      store.set({ mcpBusy: name, mcpError: null });
      const result = await mcpCall(ctx, next ? 'enable' : 'disable', name);
      if (!result.ok) {
        row.enabled = snapshot;
        store.set({ mcpBusy: '', mcpError: name + '：' + result.error });
        return;
      }
      store.set({ mcpBusy: '' });
      void refreshOneMcp(ctx, store, name);
    }

    /**
     * Hide / unhide one global server inside the chosen workspace.
     * Same optimistic contract: the eye flips instantly, the write follows.
     */
    async function toggleWorkspaceExclude (ctx, store, name) {
      if (store.wsPath === '' || store.mcpBusy !== '') return;
      const hidden = store.wsExclude.includes(name);
      const previous = store.wsExclude.slice();
      store.wsExclude = hidden
        ? store.wsExclude.filter((item) => item !== name)
        : store.wsExclude.concat([name]);
      store.set({ mcpBusy: name, mcpError: null });
      const result = await mcpCall(ctx, 'setWorkspaceExclude', {
        wsPath: store.wsPath,
        serverName: name,
        hidden: !hidden
      });
      if (!result.ok) {
        store.wsExclude = previous;
        store.set({ mcpBusy: '', mcpError: name + '：' + result.error });
        return;
      }
      /* E1 — READ THE HOST BACK. The MCP management panel has no subscription of
         its own (its client never calls $on), so it cannot be pushed to; what we
         CAN prove is whether OUR write actually landed. If the workspace view the
         Host returns does not agree with what we just asked for, the write was
         silently dropped and that is a real bug in the payload shape — saying so
         is far better than showing an optimistic eye that lies. */
      const view = await mcpCall(ctx, 'getWorkspaceView', { wsPath: store.wsPath });
      if (view.ok && view.value !== undefined && view.value !== null) {
        const exclude = Array.isArray(view.value.exclude) ? view.value.exclude.map(String) : null;
        if (exclude !== null) {
          const wants = !hidden;
          const landed = exclude.includes(name) === wants;
          store.set({
            wsExclude: exclude,
            mcpBusy: '',
            mcpError: landed ? null : t('mcp.eyeNotPersisted', { name })
          });
          return;
        }
      }
      store.set({ mcpBusy: '' });
    }

    /** Read the tool roster one server actually exposes. */
    async function loadMcpTools (ctx, store, name) {
      if (store.mcpToolsFor === name) {
        store.set({ mcpTools: null, mcpToolsFor: '' });
        return;
      }
      store.set({ mcpToolsFor: name, mcpTools: null });
      const args = store.wsPath === '' ? { name } : { name, wsPath: store.wsPath };
      const result = await mcpCall(ctx, 'tools', args);
      if (!result.ok) {
        store.set({ mcpTools: [], mcpToolsFor: name, mcpError: name + '：' + result.error });
        return;
      }
      const value = result.value === undefined || result.value === null ? {} : result.value;
      const tools = Array.isArray(value.tools) ? value.tools : [];
      store.set({
        mcpTools: tools.map((tool) => ({
          name: String(tool.name ?? ''),
          description: tool.description === undefined ? '' : String(tool.description)
        })),
        mcpToolsFor: name
      });
    }

    /** Reconnect one server, with visible progress and a visible outcome.
     *
     * The remote is the only authority on the result, so the button is driven
     * by the store until the promise settles: 'busy' while it is in flight,
     * then 'ok' or 'error' — never just a disabled control. */
    async function reconnectMcp (ctx, store, name) {
      if (store.mcpBusy !== '') return;
      const inFlight = Object.assign({}, store.reconnecting);
      inFlight[name] = true;
      const phase = Object.assign({}, store.reconnectState);
      phase[name] = 'busy';
      const cleared = Object.assign({}, store.reconnectError);
      cleared[name] = null;
      store.set({
        mcpBusy: name,
        mcpError: null,
        reconnecting: inFlight,
        reconnectState: phase,
        reconnectError: cleared
      });
      const result = await mcpCall(ctx, 'reconnect', name);
      const settled = Object.assign({}, store.reconnecting);
      settled[name] = false;
      const after = Object.assign({}, store.reconnectState);
      after[name] = result.ok ? 'ok' : 'error';
      const reason = Object.assign({}, store.reconnectError);
      reason[name] = result.ok ? null : String(result.error);
      store.set({
        mcpBusy: '',
        reconnectError: reason,
        reconnecting: settled,
        reconnectState: after
      });
      /* B4 latency — refresh ONLY this row, never the whole roster. */
      void refreshOneMcp(ctx, store, name);
    }

    /** Re-read ONLY the server that changed (B4 latency).
     *
     * reconnectMcp() must not call loadMcp({force:true}): that re-runs
     * list + listWorkspaces and then chooseWorkspace -> getWorkspaceView, and it
     * replaces the whole roster — three round trips and a full re-render for one
     * row. This reads the single list and merges the one row, leaving every
     * other row's DOM untouched. */
    async function refreshOneMcp (ctx, store, name) {
      const listed = await mcpCall(ctx, 'list');
      if (!listed.ok) return;
      const servers = listed.value !== undefined && Array.isArray(listed.value.servers)
        ? listed.value.servers
        : [];
      const fresh = servers.map(mapServer).find((row) => row.name === name);
      if (fresh === undefined) return;
      store.set({
        mcpServers: store.mcpServers.map((row) => (row.name === name ? fresh : row)),
        mcpAt: Date.now()
      });
    }

    /** V7 — the host publishes a phase while a server is still coming up. The
     *  row used to print that raw token (or nothing at all), so the seconds
     *  spent starting / connecting / registering tools looked like a frozen
     *  list, with nothing to say it was still starting up. Anything the host
     *  reports that is not a settled state becomes a plain-language progress
     *  label. */
    /* Keys, not copy: phaseLabel() runs t() where the row is built, so the
       progress label follows a language switch like every other row. */
    const PHASE_LABEL_KEY = {
      connecting: 'mcp.phase.connecting',
      connecting_failed: 'mcp.phase.connectingFailed',
      starting: 'mcp.phase.starting',
      starting_failed: 'mcp.phase.startingFailed',
      registering: 'mcp.phase.registering',
      syncing: 'mcp.phase.syncing',
      reconnecting: 'mcp.phase.reconnecting',
      restarting: 'mcp.phase.restarting',
      stopping: 'mcp.phase.stopping',
      initializing: 'mcp.phase.initializing',
      pending: 'mcp.phase.pending',
      disabled: 'mcp.phase.disabled',
      stopped: 'mcp.phase.stopped',
      error: 'mcp.phase.error',
      failed: 'mcp.phase.failed',
      disconnected: 'mcp.phase.disconnected'
    };

    /* R6b — SETTLED phases say nothing. The row already carries a switch and a
       tool count, so printing the raw host token for a healthy server was pure
       noise ("... · connected"); the in-flight ones are the ones worth words. */
    const PHASE_SETTLED = {
      '': true,
      active: true,
      running: true,
      connected: true,
      ready: true,
      ok: true,
      enabled: true
    };

    function phaseLabel (phase) {
      if (PHASE_SETTLED[phase] === true) return '';
      return PHASE_LABEL_KEY[phase] === undefined ? phase : t(PHASE_LABEL_KEY[phase]);
    }

    /* R6b — ONE poll timer, module level so two menu mounts cannot stack up. */
    let mcpPollTimer = 0;
    let mcpPollStore = null;

    /** R6b — while any server is mid-flight, keep reading the roster so
     *  「连接中…」 is actually SEEN rather than skipped between two manual
     *  refreshes. It stops by itself the moment every phase is settled. */
    function scheduleMcpPoll (ctx, store) {
      if (mcpPollTimer !== 0) {
        window.clearTimeout(mcpPollTimer);
        mcpPollTimer = 0;
      }
      /* R42 — the eye must not be a fixture. While the MCP page is OPEN (and a
         workspace is chosen) the Host's own workspace view is re-read on this
         same tick, so a change made in the Host's MCP panel shows up here, and
         the state we wrote can never drift out of sight.
         dsh-mcp-manager-ui's client registers NO $on subscription at all, so the
         Host cannot push to us; polling is the only honest direction available,
         and it stops the moment the page is left. */
      const watchingEye = store.view === 'mcp' && store.wsPath !== '';
      const pending = watchingEye || store.mcpServers.some((row) => phaseLabel(row.phase) !== '');
      if (!pending) return;
      mcpPollStore = store;
      mcpPollTimer = window.setTimeout(() => {
        mcpPollTimer = 0;
        if (mcpPollStore !== store) return;
        void revalidateMcpRoster(ctx, store);
      }, 1500);
    }

    /** The light re-read: roster first, then the workspace view when the MCP
     *  page is open (R42 — that is what makes the per-workspace eye real). */
    async function revalidateMcpRoster (ctx, store) {
      const listed = await mcpCall(ctx, 'list');
      if (listed.ok) {
        const servers = listed.value !== undefined && Array.isArray(listed.value.servers)
          ? listed.value.servers
          : [];
        store.set({ mcpServers: servers.map(mapServer), mcpAt: Date.now() });
      }
      if (store.view === 'mcp' && store.wsPath !== '') {
        const view = await mcpCall(ctx, 'getWorkspaceView', { wsPath: store.wsPath });
        if (view.ok && view.value !== undefined && view.value !== null) {
          const exclude = Array.isArray(view.value.exclude) ? view.value.exclude.map(String) : null;
          /* Only write on a real change: a fresh array every tick would re-render
             the whole page twice a second for nothing. */
          if (exclude !== null && !sameList(store.wsExclude, exclude)) store.set({ wsExclude: exclude });
        }
      }
      scheduleMcpPoll(ctx, store);
    }

    /** Whether two string lists carry the same members in the same order. */
    function sameList (left, right) {
      if (!Array.isArray(left) || !Array.isArray(right)) return false;
      if (left.length !== right.length) return false;
      for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
      return true;
    }

    function serverSubtitle (row) {
      const parts = [];
      if (row.transport !== '') parts.push(row.transport);
      parts.push(t('mcp.tools', { n: row.toolCount }));
      const phase = phaseLabel(row.phase);
      if (phase !== '') parts.push(phase);
      if (row.conflict) parts.push(t('mcp.conflictReadOnly'));
      return parts.join(' · ');
    }

    /**
     * The workspace control — a real <select>, not a line of text.
     *
     * The per-workspace eye is meaningless until a workspace is chosen, and the
     * previous build rendered that choice as static copy ("当前工作区未选择")
     * with no way to change it. This writes the SAME workspace config file the
     * MCP panel writes, so the two views cannot disagree.
     */
    function workspacePicker (ctx, store) {
      const options = store.workspaces;
      const current = options.find((space) => space.path === store.wsPath);
      const label = current === undefined ? t('mcp.workspaceNone') : current.name;
      const out = [h('button', {
        key: 'sel',
        type: 'button',
        className: 'dcl-select' + (store.wsOpen === true ? ' open' : ''),
        disabled: store.mcpBusy === 'ws' || options.length === 0,
        'aria-haspopup': 'listbox',
        'aria-expanded': store.wsOpen === true ? 'true' : 'false',
        title: store.wsPath === '' ? t('mcp.workspaceNone') : store.wsPath,
        onClick: () => { store.set({ wsOpen: store.wsOpen !== true }); }
      }, [
        h('span', { className: 'dcl-select-t', key: 't' }, label),
        h('span', { className: 'dcl-dr', key: 'c', dangerouslySetInnerHTML: { __html: ICON.chevDown } })
      ])];
      /* R6c — a themed listbox instead of a native <select>. A bare OS control
         cannot inherit this app's tokens and read as "太简陋，没跟同一套主题". */
      if (store.wsOpen === true) {
        out.push(h('div', { className: 'dcl-pick', key: 'list', role: 'listbox' }, options.map((space) =>
          h('button', {
            key: space.path,
            type: 'button',
            role: 'option',
            className: 'dcl-pick-i' + (space.path === store.wsPath ? ' on' : ''),
            'aria-selected': space.path === store.wsPath ? 'true' : 'false',
            onClick: (event) => {
              event.stopPropagation();
              store.set({ wsOpen: false });
              void chooseWorkspace(ctx, store, space.path, false);
            }
          }, [
            h('span', { className: 'dcl-pick-n', key: 'n' }, space.name),
            h('span', { className: 'dcl-pick-p', key: 'p' }, space.path)
          ]))));
      }
      return out;
    }

    function viewMcp (ctx, store) {
      const out = [crumbBar(store, t('group.capability'), t('mcp.title'),
        store.mcpState === 'ready' ? t('mcp.desc', { n: store.mcpServers.length }) : t('mcp.descLoading'))];

      if (store.mcpState === 'loading' || store.mcpState === 'idle') {
        out.push(h('div', { className: 'dcl-empty', key: 'l' }, t('mcp.loading')));
        return out;
      }
      if (store.mcpState === 'error') {
        out.push(h('div', { className: 'dcl-empty', key: 'x' }, store.mcpError === null ? t('mcp.error') : store.mcpError));
        return out;
      }

      /* Workspace first: everything below it is scoped to this choice. */
      out.push(h('div', { className: 'dcl-field', key: 'ws' },
        h('span', { className: 'dcl-field-l', key: 'l' }, t('mcp.workspace')),
        h('span', { className: 'dcl-field-p', key: 'pk' }, workspacePicker(ctx, store)),
        h('button', {
          key: 'sync',
          type: 'button',
          className: 'dcl-btn2',
          disabled: store.mcpBusy !== '',
          title: t('mcp.syncHint'),
          /* V5 — this used to call refreshOneMcp(ctx, store, name) while the
             only 'name' in scope belongs to the row loop BELOW; the free
             variable threw a ReferenceError on every click, so 刷新 was dead.
             A whole-list revalidate is what a "refresh everything" button
             should do anyway. */
          onClick: () => { void loadMcp(ctx, store, { force: true }); }
        }, t('mcp.sync'))));
      /* R60 — THE WORKSPACE URI LINE IS GONE.
       *
       * The picker above it already names the workspace, so the extra path row
       * only added noise ("我箭头指的删了吧"). The line, its 34px axis rule and
       * the whole dcl-note-row style are deleted together - dead CSS is still
       * dead code. */

      if (store.mcpServers.length === 0) {
        out.push(h('div', { className: 'dcl-empty', key: 'e' }, [
          h('span', { key: 'i', className: 'dcl-eic', dangerouslySetInnerHTML: { __html: ICON.mcp } }),
          h('span', { key: 't' }, t('mcp.empty')),
          h('span', { key: 'h', style: { fontSize: '11px' } }, t('mcp.emptyHint'))
        ]));
        return out;
      }

      out.push(h('div', { className: 'dcl-sec', key: 'gl' }, t('mcp.global'), t('mcp.legend')));
      for (const row of store.mcpServers) {
        const hiddenHere = store.wsExclude.includes(row.name);
        const busy = store.mcpBusy === row.name;
        const expanded = store.mcpToolsFor === row.name;
        /* Three distinct reconnect faces, so the click is never silent:
           in-flight (red 重连中 + animated dots), done (green tick), failed
           (red 重连失败). Keyed per server, so one row's state cannot leak
           into another's button. */
        const reconnecting = store.reconnecting[row.name] === true;
        const reState = store.reconnectState[row.name];
        const reClass = reconnecting
          ? ' dcl-re-busy'
          : (reState === 'ok' ? ' dcl-re-ok' : (reState === 'error' ? ' dcl-re-err' : ''));
        const reLabel = reconnecting
          ? t('mcp.reconnecting')
          : (reState === 'ok' ? t('mcp.reconnected') : (reState === 'error' ? t('mcp.reconnectFail') : t('mcp.reconnect')));
        const reTitle = reconnecting
          ? t('mcp.reconnectTitleBusy')
          : (reState === 'error' ? t('mcp.reconnectFailTitle') : t('mcp.reconnectTitle'));
        /* The failure REASON has to survive the roster refresh that follows a
           reconnect: loadMcp() clears the view-level mcpError on success, so
           the per-server reason lives in its own map and is shown on the row. */
        const reReason = store.reconnectError[row.name];
        const shownError = reReason === undefined || reReason === null ? row.lastError : String(reReason);
        /* #18 — clicking the ROW BODY arms 【MCP】<name>, exactly like a plugin
           row. It stays a div (not a <button>): the children are already
           buttons, and nesting them would be invalid markup. Every child
           control stops propagation, so only the body reaches this handler.
           The payload is spliced in by the send interceptor at submit time and
           is never written into the draft. */
        out.push(h('div', {
          className: 'dcl-item',
          key: 'm-' + row.name,
          style: { cursor: 'pointer' },
          title: t('mcp.pickTitle'),
          onClick: () => {
            pick(store, { label: row.name, kind: 'mcp', icon: ICON.mcp });
            /* Same as a plugin row: close, so the chip is visible on the rail
               instead of hidden behind the dropdown. */
            store.set({ open: false });
          }
        }, [
          h('span', { className: 'dcl-ic', key: 'i', dangerouslySetInnerHTML: { __html: ICON.mcp } }),
          h('span', { className: 'dcl-nm', key: 'n' }, row.name),
          h('span', {
            className: 'dcl-ds',
            key: 'd' + (shownError === null ? '' : '-err'),
            style: shownError === null ? undefined : { color: '#f25a5a' }
          }, shownError === null ? serverSubtitle(row) : shownError),
          h('span', { className: 'dcl-tr', key: 't' }, [
            h('button', {
              key: 'tools',
              type: 'button',
              className: 'dcl-btn3' + (expanded ? ' on' : ''),
              title: t('mcp.toolsTitle'),
              onClick: (event) => { event.stopPropagation(); void loadMcpTools(ctx, store, row.name); }
            }, t('mcp.toolsBtn')),
            h('button', {
              key: 're',
              type: 'button',
              className: 'dcl-btn3' + reClass,
              disabled: busy || reconnecting,
              'aria-busy': reconnecting ? 'true' : 'false',
              title: reTitle,
              onClick: (event) => { event.stopPropagation(); void reconnectMcp(ctx, store, row.name); }
            }, reLabel),
            /* V6 — the eye is ALWAYS rendered now. It used to be dropped
               entirely while no workspace was selected (the old ternary
               returned null when wsPath was empty), so a user who had never
               picked a workspace saw the legend
               「开关 = 全局启停 · 眼睛 = 在本工作区是否可见」 with no eye
               anywhere on screen. It stays a real control and explains itself
               through disabled + title until a workspace exists. */
            h('button', {
              key: 'eye',
              type: 'button',
              className: 'dcl-eye' + (hiddenHere ? ' off' : ''),
              disabled: busy || store.wsPath === '',
              'aria-pressed': hiddenHere ? 'false' : 'true',
              title: store.wsPath === ''
                ? t('mcp.eyeNoWorkspace')
                : (hiddenHere ? t('mcp.excluded') : t('mcp.visible')),
              onClick: (event) => { event.stopPropagation(); void toggleWorkspaceExclude(ctx, store, row.name); },
              dangerouslySetInnerHTML: { __html: hiddenHere ? ICON.eyeOff : ICON.eye }
            }),
            h('button', {
              key: 'sw',
              type: 'button',
              className: 'dcl-sw',
              'data-on': row.enabled ? '1' : '0',
              disabled: busy,
              title: row.enabled ? t('mcp.disable') : t('mcp.enable'),
              onClick: (event) => { event.stopPropagation(); void toggleMcp(ctx, store, row.name); }
            })
          ])
        ]));
        if (expanded) {
          const tools = store.mcpTools;
          if (tools === null) {
            out.push(h('div', { className: 'dcl-tools', key: 'mt-' + row.name }, t('mcp.loading')));
          } else if (tools.length === 0) {
            out.push(h('div', { className: 'dcl-tools', key: 'mt-' + row.name }, t('mcp.noTools')));
          } else {
            out.push(h('div', { className: 'dcl-tools', key: 'mt-' + row.name },
              tools.map((tool) => h('div', { className: 'dcl-tool', key: 'tl-' + tool.name },
                h('span', { className: 'dcl-tool-n' }, tool.name),
                tool.description === '' ? null : h('span', { className: 'dcl-tool-d' }, tool.description)))));
          }
        }
      }
      if (store.mcpError !== null) out.push(h('div', { className: 'dcl-hint dcl-err', key: 'err' }, store.mcpError));
      return out;
    }

    function viewPlugins (ctx, store) {
      const q = store.query.toLowerCase();
      /* 只列**当前组合放行**的插件（右上角可以跳去改组合）。 */
      const scopedPlugins = Array.isArray(store.pluginsScoped) ? store.pluginsScoped : store.plugins;
      const out = [crumbBar(store, t('group.plugins'), t('plugins.title'), [
        h('span', { key: 'n' }, store.pluginState === 'ready' ? pluginCountText(scopedPlugins.length, Array.isArray(store.plugins) ? store.plugins.length : scopedPlugins.length) : ''),
        composerJumpButton('plugin', store)
      ])];
      if (store.pluginState === 'ready' && typeof store.pluginNote === 'string' && store.pluginNote !== '') {
        out.push(h('div', { className: 'dcl-note dcl-scope', key: 'scope' }, store.pluginNote));
      }
      if (store.pluginState === 'loading' || store.pluginState === 'idle') {
        out.push(h('div', { className: 'dcl-empty', key: 'l' }, t('plugins.loading')));
        return out;
      }
      /* An ERROR is not an empty list. Reporting both as "没有可用的插件" is
         what made the missing pluginInventory inject look like a content
         problem instead of a wiring one. */
      if (store.pluginState === 'error') {
        out.push(h('div', { className: 'dcl-empty', key: 'x' }, [
          h('span', { key: 't' }, t('plugins.error')),
          h('button', {
            key: 'r',
            type: 'button',
            className: 'dcl-btn2',
            style: { marginTop: '4px' },
            onClick: () => { void loadPlugins(ctx, store); }
          }, t('plugins.retry'))
        ]));
        return out;
      }
      const list = scopedPlugins.filter((p) => p.name.toLowerCase().indexOf(q) >= 0);
      if (list.length === 0) out.push(h('div', { className: 'dcl-empty', key: 'e' }, t('plugins.empty')));
      list.sort((a, b) => (a.enabled === b.enabled ? 0 : (a.enabled ? -1 : 1)) || a.name.localeCompare(b.name));
      for (const plugin of list) {
        out.push(row('p-' + plugin.name, {
          icon: iconFor(plugin.name),
          name: plugin.name,
          /* C2 — the 已启用/未启用 wording is GONE: the dot carries it. */
          desc: '',
          trailing: statusDot(plugin.enabled ? 'on' : 'off', plugin.enabled ? t(DOT_LABEL_KEY.on) : t(DOT_LABEL_KEY.off)),
          onClick: () => {
            pick(store, { label: t('chip.plugin', { name: plugin.name }), kind: 'plugin', icon: iconFor(plugin.name) });
            store.set({ open: false });
          }
        }));
      }
      return out;
    }

    /* ------------------------------------------------------------------ *
     * Components
     * ------------------------------------------------------------------ */

    /* ------------------------------------------------------------------ *
     * Send interceptor — the picked payload stays OUT of the draft until the
     * moment the message is submitted.
     *
     * Modeled on dsh-sidenote's annotate/send.ts, which solved exactly this:
     * the chip is presentation, and the protocol block is spliced in at submit
     * time ("协议块在提交瞬间拼入，草稿不再被污染"). The composer exposes no
     * submit hook, so the GESTURE is intercepted in the capture phase and the
     * submit is performed here instead.
     *
     * Defensive by construction: it does nothing at all unless there are chips,
     * never swallows a gesture it did not serve, and restores the flag on a
     * later tick so a keydown submit also absorbs the trailing click.
     * ------------------------------------------------------------------ */
    function installSendInterceptor (props, store) {
      const shell = props.keyboard;
      const actions = props.inputActions;
      const hasActions = actions !== undefined && actions !== null && typeof actions.setDraft === 'function';
      /* F1 — WHY THE SHELL IS OPTIONAL.
       *
       * props.keyboard is NOT part of what the real host hands an occupant of
       * conversation.input.left / .dock (measured on the live GUI: those slots
       * get inputActions + the input hook and nothing else). The old opening
       * line 'if (shell === undefined) return undefined;' therefore meant the
       * interceptor was NEVER INSTALLED in the real client — a sent message left
       * every chip on the rail. The harness fixture always passed a keyboard,
       * which is why jsdom could not see it.
       *
       * The fallback is the per-session input facade dsh-sidenote submits
       * through: rootContext.sessions.scope(id) -> ctx.get('conversation')
       * .input.for(actx). It is resolved LAZILY, inside a try, at gesture time —
       * and 'conversation' is deliberately NOT added to this plugin's inject
       * list: declaring a dependency the loader cannot resolve stops the whole
       * plugin from applying (that is exactly what killed generation
       * +c8d19f32d17c while every jsdom assertion stayed green). */
      const facadeOf = () => {
        try {
          const ctx = rootContext;
          if (ctx === undefined || ctx === null) return null;
          let sessionId = props.launcherSessionId;
          if (sessionId === undefined || sessionId === null || sessionId === '') {
            const sessions = ctx.sessions === undefined ? ctx.get('sessions') : ctx.sessions;
            if (sessions === undefined || sessions === null) return null;
            sessionId = sessions.list.getSnapshot().current;
          }
          if (sessionId === undefined || sessionId === null || sessionId === '') return null;
          const sessions = ctx.sessions === undefined ? ctx.get('sessions') : ctx.sessions;
          if (sessions === undefined || sessions === null) return null;
          const actx = sessions.scope(sessionId);
          if (actx === undefined) return null;
          const conversation = ctx.get('conversation');
          if (conversation === undefined || conversation === null) return null;
          const input = conversation.input.for(actx);
          if (input === null || input === undefined) return null;
          if (typeof input.submit !== 'function') return null;
          return input;
        } catch {
          return null;
        }
      };

      if (!hasActions && facadeOf() === null) return undefined;

      let committing = false;
      /* R11 — the moment of the last send-ish gesture, and the fallback that
         makes the rail unable to outlive a message even when the gesture was
         NOT served by us. */
      let gestureAt = 0;
      /** When the payload was last spliced into the composer (0 = never). */
      let lastInjectAt = 0;
      let lastSeenDraft = String(LAST_DRAFT === undefined || LAST_DRAFT === null ? '' : LAST_DRAFT);

      /** One frame — or a tick where rAF does not exist (jsdom without
       *  pretendToBeVisual). Used by the R14 write-then-submit handshake. */
      const schedule = (fn) => {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(fn);
        } else {
          window.setTimeout(fn, 16);
        }
      };

      const inComposer = (target) =>
        target instanceof Element && target.closest('[data-composer-card]') !== null;

      /** A button that advertises itself as the send control.
       *
       * The Host's own send button is the last button in the card, which is how
       * dsh-sidenote identifies it too — but the label is localized and a dozen
       * plugins contribute buttons to the same card, so an explicit
       * send-looking label has to count as well: otherwise the payload never
       * leaves and the chips stay up. */
      const looksLikeSendButton = (button) => button !== null && button !== undefined && /send|发送|提交/i.test(
        String(button.getAttribute('aria-label') || '') + ' ' + String(button.getAttribute('title') || '')
      );
      const sendButtonOf = (card) => {
        if (card === null || card === undefined) return null;
        const buttons = card.querySelectorAll('button');
        const last = buttons.length === 0 ? null : buttons[buttons.length - 1];
        if (looksLikeSendButton(last)) return last;
        for (const button of buttons) if (looksLikeSendButton(button)) return button;
        return last;
      };

      /** R38 — a message made ONLY of picked references has an EMPTY draft, and
       *  the Host disables its send button while the draft is empty: a disabled
       *  button produces no click event at all, so 'spliceAndSubmit' was never
       *  entered and the rail could not be sent by clicking ("全部ui都还在。。。。"
       *  and then "消息也是现在才发出去" once Enter finally routed through us).
       *
       * While we hold chips the affordance must stay live. This clears the DOM
       * attribute ONLY — the draft is never touched (R14: the editor is the
       * Host's, and fighting it is what produced the payload leak). With an
       * empty rail we do nothing, so the Host's own empty-draft semantics come
       * back untouched. */
      const ungateSendButton = () => {
        if (store.chips.length === 0) return;
        const button = sendButtonOf(document.querySelector('[data-composer-card]'));
        if (button === null || button.disabled !== true) return;
        button.disabled = false;
        button.setAttribute('aria-disabled', 'false');
      };

      /** A candidate menu the user is actually choosing from.
       *
       * R11 — this used to test bare EXISTENCE. The Host can keep a listbox node
       * mounted between openings, in which case the very first send (and every
       * one after it) was refused — which produces both reported symptoms at
       * once: the payload never reaches the model AND the chips never clear.
       * A parked node has no layout box, so the test is now visibility. */
      const candidateMenuOpen = (card) => {
        const nodes = card.querySelectorAll('[role="listbox"]');
        for (const node of nodes) {
          if (node.offsetParent === null) continue;
          if (typeof node.getBoundingClientRect !== 'function') continue;
          const rect = node.getBoundingClientRect();
          if (rect.height > 0 && rect.width > 0) return true;
        }
        return false;
      };

      /** R11 — a refused gesture must never be silent again. */
      const noteDeclined = (why) => {
        if (store.chips.length === 0) return;
        const message = t('exec.declined') + '（' + why + '）';
        store.set({ execError: message });
        try {
          const logger = rootContext === undefined ? undefined : rootContext.logger;
          if (logger !== undefined && logger !== null && typeof logger.warn === 'function') {
            logger.warn('dsh-composer-launcher: send gesture not served — ' + why +
              ' (chips=' + store.chips.length + ')');
          }
        } catch {
          /* Logging is a nicety; the on-screen note is the contract. */
        }
      };

      /** Write text into the Host composer through whichever handle we hold.
       *  Lives at closure level so the sweeper below can clean the box without
       *  going through a send gesture. */
      const composeWrite = (text) => {
        try {
          if (hasActions) { actions.setDraft(text); return true; }
          const facade = facadeOf();
          if (facade !== null && typeof facade.setDraft === 'function') { facade.setDraft(text); return true; }
        } catch {
          /* A failed write is reported by the caller. */
        }
        return false;
      };

      /** Drop the rail AND any of our UI that belonged to the message that just
       *  left, so nothing of ours survives on screen after a submit. */
      const clearRailNow = () => {
        store.chips.length = 0;
        store.set({
          chips: store.chips,
          view: 'root',
          query: '',
          open: false,
          webHover: false,
          execError: null,
          stack: [],
          goalMode: null
        });
      };

      /** Remove our 【…】 block from whatever is in the composer, keeping the
       *  user's own lines exactly as they are. */
      const stripPayloadLines = (text) => String(text === undefined || text === null ? '' : text)
        .split('\n')
        .filter((line) => line.trim().indexOf('【') !== 0)
        .join('\n')
        .trim();

      /** Splice + submit. Returns whether THIS gesture was served.
       * @param fromClick - true when the send BUTTON was pressed (as opposed to
       *   Enter). The candidate-menu guard only makes sense for Enter: while a
       *   menu is open, Enter is picking an item — but pressing the send button
       *   is never picking, and refusing it left the chips armed and the payload
       *   parked, which is the "第二次才发出去" leak all over again. */
      const spliceAndSubmit = (fromClick) => {
        if (committing) return true;
      /* G1 / R56 — 目标模式 must be served even with an EMPTY rail.
       *
       * This used to read chips.length === 0, which meant an armed 目标 with no
       * references never entered this path at all: the goal was never created,
       * the flag was never cleared, and the message went out as a plain one -
       * the strip kept saying "下一条消息：设为目标" and the NEXT message was
       * hijacked too. An armed mode is a reason to serve the gesture by itself;
       * the payload splice is what needs chips. */
      if (store.chips.length === 0 && !goalArmed(store)) return false;
        /* Never fight a candidate menu the user is PICKING from with Enter. */
        const card = document.querySelector('[data-composer-card]');
        if (fromClick !== true && card !== null && candidateMenuOpen(card)) return false;
        committing = true;
        try {
          const facade = facadeOf();
          const shellSubmit = shell !== undefined && shell !== null && typeof shell.submit === 'function';
          const raw = sendDraftOf(props);
          /* The exact block we are about to add. It is both the write
             verification (did it land in the editor?) and the leak test (is it
             still there afterwards?) — the same string the model will read. */
          const marker = store.chips.map(chipPayload).join('\n');
          let full = draftWith(store.chips, raw);
          /* R48/R49 — 目标模式 sends the WHOLE block as a MESSAGE *and* sets the
             goal from that same block.
             R48 dropped the message ("目标模式下你那条消息不会再作为聊天消息出现")
             and the verdict came straight back: "你确实是把我的工具全部都发出去了…
             但是实际我输入框里面的任何东西你没有进行发出去". Both halves are needed:
               * the message carries the references AND the user's words, so it is a
                 normal send that shows up in the conversation;
               * the goal objective is the SAME block, so the goal round knows which
                 plugins / pages were named and nothing lives only in a queue. */
          /* R58 — THE GOAL CARRIES THE USER'S WORDS, NOT A COPY OF THE MESSAGE.
           *
           * R49 handed the goal the WHOLE block on purpose (R48 had dropped the
           * message, so the goal was the only carrier). The Host then delivered
           * that objective again as its own goal round, so the same text arrived
           * twice. R57 made the message itself ride the gesture reliably,
           * so the goal only has to state the OBJECTIVE; the picked references
           * are already in the session history the goal round runs against.
           * With nothing typed, the block is still the objective - it is the only
           * thing the user chose. */
          const goalObjective = goalArmed(store)
            ? (raw.trim() !== '' ? raw.trim() : full.trim())
            : '';

          const writeDraft = (text) => composeWrite(text);
          const submitNow = () => {
            const send = (mode) => {
              if (shellSubmit) shell.submit(mode);
              else if (facade !== null) facade.submit(mode);
              else throw new Error('no submit channel');
            };
            /* R57 — 一起一并发出去，不排队。
             *
             * Reported symptom: the message - references and all - waited behind the
             * goal round instead of going out with it. This used to hardcode "queue",
             * so whenever the agent was running the message - references and all -
             * waited behind the goal round the previous step had just started.
             * "steer" is the Host's OWN answer to that, and it is safe to ask for
             * unconditionally: resolveSubmitMode() normalises it back to "queue"
             * when the session is not running or cannot steer
             * (dsh-client-ui-conversation :13577-13578), which is exactly what the
             * Host's own send button does. A refusal still falls back, because no
             * rule here may ever block the send (R14). */
            try {
              send('steer');
              return;
            } catch (error) {
              send('queue');
            }
          };
          const clearRail = () => clearRailNow();

          if (!writeDraft(full)) { committing = false; return false; }
          /* Stamp the injection so the sweeper knows a 【…】 block written before
             this moment is stale and must not survive. */
          lastInjectAt = Date.now();

          /* R14 — THE WRITE AND THE SUBMIT ARE NOT ATOMIC, AND THE STORE MIRROR
           * IS NOT THE TRUTH.
           *
           * NO RULE HERE MAY EVER BLOCK THE SEND. An earlier version refused to
           * submit when it could not see its own payload in the editor, and that
           * turned a corruption bug into a TOTAL send failure ("我现在是发不出
           * 去的状态") — strictly worse for the user. The order of guarantees is:
           *   1. the message ALWAYS goes out;
           *   2. the payload must not ride the NEXT message.
           * So: give the write a few frames to land (best effort), submit
           * UNCONDITIONALLY, then sweep the editor afterwards for as long as it
           * takes to get the leftovers out. */
          const landed = () => draftHoldsMarker(marker, props);
          let spins = 0;
          const step = () => {
            if (!landed() && spins < 4) {
              spins += 1;
              schedule(step);
              return;
            }
            let failed = false;
            try {
              submitNow();
            } catch (error) {
              failed = true;
            }
            if (failed) {
              /* Never leave the payload parked: restore the user's own text and
                 say so. Doing this silently is what produced the leak. */
              writeDraft(raw);
              noteDeclined(t('exec.submitFailed'));
              committing = false;
              return;
            }
            clearRail();
            /* R51 — WHOEVER SUBMITS, CLEARS.
               The Host captures the draft synchronously inside submit()
               (draft: this.projection.clipboardText, dsh-client-ui-conversation
               :12878), so by the time submitNow() returns the content is already
               in the Host's hands — sent OR queued. Leaving a copy in the box is
               therefore never correct, and relying on the Host to clear it is what
               left the user's sentence sitting there ("我把消息全部发送之后…为什么
               还会有消息存在于输入框呢"). This is deterministic and immediate: no
               timer, no detector, no cleanup pass. */
            composeWrite('');
            /* R32 — the goal is set BESIDE the message, never inside it.
               R37 — and it is set as DATA, not as a slash command.
               "/goal <objective>" writes its own transcript entry (so the user
               sees messages they never typed) and starts a turn of its own,
               which is what left the user's real message stuck in the queue
               ("消息没有发出去！"). The remote does the same job with neither
               side effect. A failure is logged rather than surfaced in the
               menu: the message has already gone out and our chrome must not
               cover it. */
            if (goalObjective !== '') {
              void setGoalViaRemote(rootContext, store.sessionId, goalObjective).then((failure) => {
                if (failure === null) return;
                /* G3 / R56 — SAY IT. A failed goal write decides what the NEXT
                   message will do, so a logger.warn nobody can read (plugin logs
                   do not reach harness.log) is not an acceptable report. The
                   message itself has already left, so this rides the menu's own
                   error line instead of a modal. */
                try {
                  store.set({ execError: t('goal.failed') + failure });
                } catch {
                  /* the message already left; this is a nicety */
                }
                try {
                  const logger = rootContext === undefined ? undefined : rootContext.logger;
                  if (logger !== undefined && logger !== null && typeof logger.warn === 'function') {
                    logger.warn('dsh-composer-launcher: setting the goal failed — ' + failure);
                  }
                } catch {
                  /* Logging is a nicety; the message already left. */
                }
              });
            }
            /* ANTI-LEAK — poll the EDITOR, not a mirror, and use a BROADER test
               than the exact marker: any of our 【…】 blocks left behind would
               ride the next message. Give the Host a few frames to clear on its
               own first (it may consume the draft asynchronously), then put the
               user's own text back. */
            let guard = 0;
            const sweep = () => {
              const left = sendDraftOf(props);
              const dirty = left.indexOf('【') >= 0;
              if (dirty && guard < 8) {
                guard += 1;
                schedule(sweep);
                return;
              }
              if (dirty) writeDraft(raw);
              committing = false;
            };
            schedule(sweep);
          };
          schedule(step);
          /* Watchdog: the committing flag guards re-entry, so a state that never
             resolves must not be able to disable sending for the rest of the
             session ("我现在是发不出去的状态"). */
          window.setTimeout(() => { committing = false; }, 1500);
        } catch {
          committing = false;
          return false;
        }
        return true;
      };

      const onKeyDown = (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.defaultPrevented) return;
        if (!inComposer(event.target)) return;
        gestureAt = Date.now();
        if (!spliceAndSubmit(false)) { noteDeclined(t('exec.enterDeclined')); return; }
        event.preventDefault();
        event.stopImmediatePropagation();
      };

      const onClick = (event) => {
        if (!inComposer(event.target)) return;
        const card = document.querySelector('[data-composer-card]');
        if (card === null) return;
        /* R38 — the matcher lives in sendButtonOf(): the card's last button, or
           any button that advertises itself as the send control. */
        const clicked = event.target.closest('button');
        if (clicked === null) return;
        if (clicked !== sendButtonOf(card) && !looksLikeSendButton(clicked)) return;
        gestureAt = Date.now();
        if (!spliceAndSubmit(true)) { noteDeclined(t('exec.sendDeclined')); return; }
        event.preventDefault();
        event.stopImmediatePropagation();
      };

      /* R11 fallback — THE RAIL MUST NOT OUTLIVE THE MESSAGE.
       *
       * Whatever route the send actually took (our interceptor, a keyboard
       * shortcut, a host-side submit, a button that is not the last one in the
       * card), a draft that goes non-empty -> empty right after a send-ish
       * gesture means the message is gone. Clearing the chips here is what
       * guarantees "发送了 UI 还在" can never come back, and gating it on
       * gestureAt means a manual Ctrl+A / Delete never drops the chips. */
      const watch = window.setInterval(() => {
        /* R25 — THIS USED TO READ LAST_DRAFT, the store mirror that does not
           follow the Lexical editor — so the entire fallback was dead code and
           the payload could sit in the box until the next message carried it
           ("第二次才给你发，UI 又出现了"). It reads the EDITOR now. */
        const live = readLiveDraft();
        const previous = lastSeenDraft;
        lastSeenDraft = live;

        /* R38 — while the rail holds chips, the Host's send button must not be
           disabled by an empty draft, or clicking it produces no event at all. */
        ungateSendButton();

        /* A) The message went out: a draft that went content -> empty right after
              a send-ish gesture means the Host consumed it. The rail must not
              outlive the message. */
        /* G2 / R56 — an ARMED 目标 must be retired by a host-side send too. The
           old test required a chip on the rail, so a goal-only arming survived
           every send for the rest of the session (the "UI 不消失" symptom all
           over again, this time on the goal axis). */
        if ((store.chips.length > 0 || goalArmed(store)) && previous.trim() !== '' && live.trim() === '' &&
            Date.now() - gestureAt < 4000) {
          clearRailNow();
          return;
        }

        /* B) HARD ANTI-LEAK, independent of ANY gesture detection.
              A 【…】 block in the composer that we are not in the middle of
              writing is stale by definition — it is exactly what rode the next
              message. It is removed here even if our send path was never
              entered at all. */
        if (lastInjectAt !== 0 && Date.now() - lastInjectAt > 3000 && live.indexOf('【') >= 0) {
          const cleaned = stripPayloadLines(live);
          if (cleaned !== live) composeWrite(cleaned);
          lastInjectAt = 0;
        }
      }, 250);

      document.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('click', onClick, true);
      return () => {
        document.removeEventListener('keydown', onKeyDown, true);
        document.removeEventListener('click', onClick, true);
        window.clearInterval(watch);
      };
    }

    /** The "+" button, mounted into conversation.input.left. */
    function LauncherButton (props) {
      const store = storeFor(useSessionKey(props.launcherSessionId, props.inputActions));
      const [, force] = react.useReducer((n) => n + 1, 0);
      const anchorRef = react.useRef(null);
      /* Hook call kept ON PURPOSE, the value is not used: props.useInput is what
         subscribes this component to draft changes, and the goal-mode face is
         re-asserted on every render precisely so it survives the Host
         re-mounting its own placeholder node. */
      const draft = readDraft(props);
      /* V16 — CACHE IT, and never re-read the draft from a gesture handler.
         spliceAndSubmit() used to call readDraft() from a DOM event handler, and
         readDraft calls props.useInput — a React HOOK (dsh-client-ui-slots
         standardHookPropName: slot "input" -> the useInput prop). A hook called
         outside a component body breaks the rules of hooks; React throws,
         readDraft's own catch turns that into '', and the interceptor then
         rewrote the draft to the chip payload ALONE (the user's text gone) or
         bailed out entirely. That single defect is both reported symptoms at
         once: "AI 说它一个都看不到" AND "发送了 UI 还在输入框上方没消失". The
         render-time value is the only legal one, so it is cached here. */
      store.latestDraft = draft;
      LAST_DRAFT = draft;

      react.useEffect(() => store.subscribe(force), [store]);
      react.useEffect(() => {
        /* Hide the harness's own "+" so the tool row keeps exactly one.
           The native button is the one carrying aria-haspopup="listbox".
           It is NOT necessarily an immediate sibling: the slot renderer may
           wrap this component in its own element, so walk up until an
           ancestor that actually CONTAINS such a button turns up, stopping at
           the composer card. Climbing past the card would start matching
           unrelated UI. */
        const node = anchorRef.current;
        if (node === null) return undefined;
        let scope = null;
        let cursor = node;
        for (let depth = 0; depth < 6 && cursor !== null; depth++) {
          cursor = cursor.parentElement;
          if (cursor === null) break;
          if (cursor.querySelector('button[aria-haspopup="listbox"]') !== null) {
            scope = cursor;
            break;
          }
          if (cursor.hasAttribute('data-composer-card')) break;
        }
        if (scope === null) return undefined;
        const native = scope.querySelector('button[aria-haspopup="listbox"]');
        if (native === null || scope.contains(node) === false) return undefined;
        if (native.contains(node)) return undefined;
        const hidden = [];
        const hide = (element) => {
          hidden.push([element, element.style.display]);
          element.style.display = 'none';
        };
        hide(native);
        /* The paperclip follows the "+" in the same tool row and its label is
           localized, so identify it positionally: the first button in the row
           that is neither the "+" nor this plugin's own button. Matching must
           test containment BOTH ways — this plugin renders a <button> inside
           the slot span, so testing candidate.contains(node) alone is false
           for it. */
        for (const candidate of scope.querySelectorAll('button')) {
          if (candidate === native) continue;
          if (candidate.contains(node) || node.contains(candidate)) continue;
          hide(candidate);
          break;
        }
        return () => {
          for (const [element, previous] of hidden) element.style.display = previous;
        };
      }, []);

      /* Payload delivery rides the submit gesture, not the draft. */
      react.useEffect(
        () => installSendInterceptor(props, store),
        [store, props.keyboard, props.inputActions]
      );

      /* #22 — the composer's goal-mode face. Driven by the store field, so it
         flips on the SAME render as the click that armed it (no waiting for a
         keystroke). No dependency array on purpose: the Host re-mounts its own
         placeholder node whenever the draft goes empty again, which would drop
         our text, so this re-asserts the goal face after EVERY render — and it
         is written to be a no-op when the DOM already matches. */
      react.useEffect(() => {
        const node = anchorRef.current;
        const card = node === null || node === undefined ? null : node.closest('[data-composer-card]');
        applyGoalMode(card, goalArmed(store));
      });

      /* R1b — the drag floor must not outlive the text.
         Re-asserted on EVERY render for the same reason applyGoalMode is: the
         Host re-mounts its own nodes, and a one-shot write leaves a tall empty
         card behind once the draft is cleared ("拖拽的这个问题还是存在").
         With an empty draft and no drag in progress the floor is removed. */
      react.useEffect(() => {
        /* Anchor off OUR OWN slot node, not off the resize handle: the handle
           lives in another slot and is absent until that slot mounts, which made
           this effect a no-op exactly when goal mode needed it. */
        const node = anchorRef.current;
        const card = node === null || node === undefined ? null : node.closest('[data-composer-card]');
        if (card === null) return;
        /* R24 — runs even before the first drag, because goal mode's floor lives
           in the same place now (applyComposerHeight owns min-height outright). */
        const stored = readStoredComposerHeight();
        applyComposerHeight(card, stored === null ? 0 : stored, false, goalArmed(store));
      });

      /* R28/R29 — a picked reference (对话 / 文件夹) becomes a REAL chip through
         the Host's own insert channel; see hostInsertReference(). The
         plain-text effect below stays as the degradation path, because a
         reference the user asked for must never be silently dropped. */
      react.useEffect(() => {
        const chip = store.pendingChip;
        if (chip === undefined || chip === null) return;
        store.pendingChip = null;
        if (hostInsertReference(props, chip)) return;
        try {
          const logger = rootContext === undefined ? undefined : rootContext.logger;
          if (logger !== undefined && logger !== null && typeof logger.warn === 'function') {
            logger.warn('dsh-composer-launcher: reference chip refused, writing the mention as text');
          }
        } catch {
          /* Logging is a nicety; the re-arm below is the contract. */
        }
        /* Degrade, never lose the intent: the mention is still resolved by the
           Host's own text parser, it is merely not pretty. */
        store.set({ pendingText: chip.ref, open: false });
      });

      /* R20 — a folder chosen through the Host's native picker lands here. This
         component is the only place with a legal setDraft handle, so the path is
         handed over through the store and written into the composer as a
         reference, which is how every other intake in DSH is addressed. */
      react.useEffect(() => {
        const text = store.pendingText;
        const ref = store.pendingRef;
        if ((text === undefined || text === null || text === '') &&
            (ref === undefined || ref === null || ref === '')) return;
        store.pendingText = null;
        store.pendingRef = null;
        try {
          if (props.inputActions !== undefined && props.inputActions !== null &&
              typeof props.inputActions.setDraft === 'function') {
            const current = typeof store.latestDraft === 'string' ? store.latestDraft : '';
            const head = current === '' ? '' : current.replace(/\s+$/, '') + ' ';
            /* A session mention already carries its own @ grammar; a folder path
               does not, so only the latter is wrapped. */
            const insert = (text !== undefined && text !== null && text !== '') ? text : ('@' + ref);
            props.inputActions.setDraft(head + insert + ' ');
          }
        } catch {
          /* A lost reference is better than a broken composer. */
        }
      });

      /* R30 — mirror DSH's OWN plan mode. The Host PROJECTION is the
         authoritative reader (the Host's own chip consumes the same one, so it
         sees a queued selection too); the card MutationObserver stays as the
         fallback for a deployment where the projection is unreachable. */
      react.useEffect(() => {
        const cardOf = () => {
          const node = anchorRef.current;
          return node === null || node === undefined ? null : node.closest('[data-composer-card]');
        };
        const sync = () => {
          const next = planModeNow(rootContext, store.sessionId, cardOf());
          if (next === null) return;
          /* R34 — HOST-SIDE SYNC. Plan mode can also be turned on from the
             Host's own chip or by typing /plan, so the exclusivity cannot live
             in our rows alone: whenever the Host says plan mode IS on, an armed
             goal mode is withdrawn here too — otherwise the two would still
             meet on the next send. */
          const patch = {};
          if (store.planOn !== next) patch.planOn = next;
          /* R43 — while a switch is in flight, plan mode's answer is STALE: the
             /plan off we just sent has not reached the projection yet, and
             honouring it here would cancel the goal the very same click armed
             (that was the "点两次才行" bug). Outside the window nothing changes:
             plan mode turned on from the Host chip still withdraws the goal. */
          const switching = Date.now() - (typeof store.modeSwitchAt === 'number' ? store.modeSwitchAt : 0) < 1500;
          if (next === true && goalArmed(store) && !switching) patch.goalMode = null;
          if (patch.planOn !== undefined || patch.goalMode !== undefined) store.set(patch);
        };
        const face = planFaceOf(rootContext, store.sessionId);
        let off;
        if (face !== null && typeof face.subscribe === 'function') {
          try {
            off = face.subscribe(sync);
          } catch {
            off = undefined;
          }
        }
        sync();
        const card = cardOf();
        const Observer = typeof window.MutationObserver === 'function' ? window.MutationObserver : null;
        const release = () => { if (typeof off === 'function') off(); };
        if (card === null || Observer === null) return release;
        const observer = new Observer(sync);
        observer.observe(card, { childList: true, subtree: true });
        return () => {
          observer.disconnect();
          release();
        };
      }, [store]);

      react.useEffect(() => {
        const onDown = (event) => {
          if (store.open !== true) return;
          const node = anchorRef.current;
          if (node !== null && node.contains(event.target)) return;
          /* The tab hover panel is PORTALLED to <body> (so nothing can clip
             it), which means a pointerdown inside it is NOT inside the menu
             element any more: without the second exemption the menu would close
             on pointerdown and the row's click would land on a dead node. The
             attribute is already on the panel; it just was not consulted. */
          if (event.target instanceof Element
              && (event.target.closest('[data-dcl-menu]') !== null
                  || event.target.closest('[data-dcl-webhov]') !== null)) return;
          store.set({ open: false });
        };
        document.addEventListener('pointerdown', onDown, true);
        return () => document.removeEventListener('pointerdown', onDown, true);
      }, [store]);

      react.useEffect(() => {
        if (store.open !== true) return;
        /* The KEEP the hidden native "+" in place: it is still the Host's own
           command-menu button, and clicking it is the guaranteed way back to
           the native panel even if a trigger controller rejects our hit. */
        void loadTabs(store, CONFIG.port, true);
      }, [store.open]);

      const open = store.open === true;
      /* R56 — 目标模式 wears the Host Plan chip's SEAT and SHAPE.
       *
       * The user asked for exactly that: "跟计划模式一样…显示在完全权限旁边，因为这
       * 两个模式是不可能说是一起用的，所以显示在同一个位置很合理". The two modes are
       * exclusive (toggleGoalMode/the 计划 row), so the goal chip simply OCCUPIES
       * the seat the Host Plan chip takes while plan mode is off: this component
       * is conversation.input.left, which the host renders right after the plan
       * slot (dsh-client-ui-conversation :16188-16190), so a chip rendered here
       * lands in that same spot. The + button keeps its own order:-1 span so the
       * chip never displaces it. */
      const armedGoalText = goalArmed(store)
        ? (typeof store.goalMode === 'string' ? store.goalMode.trim() : '')
        : null;
      const goalChip = armedGoalText === null ? null : h('button', {
        type: 'button',
        className: 'dcl-goalchip',
        key: 'goalchip',
        'aria-label': t('mode.goalChipAria') + (armedGoalText === '' ? '' : '：' + armedGoalText),
        title: t('mode.goalChipTip') + (armedGoalText === '' ? '' : '：' + armedGoalText),
        onMouseDown: (event) => event.preventDefault(),
        onClick: () => store.set({ goalMode: null })
      }, [
        h('span', { className: 'dcl-goalchip-i', key: 'i', dangerouslySetInnerHTML: { __html: ICON.goal } }),
        h('span', { key: 'l' }, t('mode.goalChip')),
        h('span', { className: 'dcl-goalchip-x', key: 'x' }, '\u00d7')
      ]);
      return h(react.Fragment, null,
        goalChip,
        h('span', { ref: anchorRef, key: 'launcher', style: { display: 'inline-flex', order: -1 } },
        h('button', {
          type: 'button',
          className: 'dcl-btn',
          'data-open': open ? '1' : '0',
          'aria-label': t('button.title'),
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          onMouseDown: (event) => event.preventDefault(),
          onClick: () => {
            if (open) { store.set({ open: false }); return; }
            void loadTabs(store, CONFIG.port, false);
            loadPlugins(rootContext, store);
            /* Prefetch MCP on OPEN, not on click: the list() round trip is the
               expensive one, and starting it here means the row already shows a
               real count by the time the pointer reaches it. */
            void loadMcp(rootContext, store, { force: false });
            /* Reopening starts a NEW navigation: a leftover stack would send
               the ← arrow somewhere the user never came from, and a leftover
               webHover would float the tab panel open without a hover. */
            store.set({ open: true, view: 'root', query: '', execError: null, stack: [], webHover: false });
          },
          dangerouslySetInnerHTML: { __html: ICON.plus }
        }),
        open ? h(MenuPortal, {
          store,
          anchor: anchorRef
        }) : null));
    }

    /** Where the dropdown goes and how tall it may be.
     *
     * Pure arithmetic on the composer card's rect, deliberately separated from
     * the portal so the invariant can be asserted headlessly (jsdom has no
     * layout engine, so a DOM measurement would prove nothing). The contract,
     * exactly:
     *
     *   top >= 8                            never above the top edge
     *   MIN_H <= height <= MAX_H            never a degenerate / oversized menu
     *   if the anchor leaves room for MIN_H, then
     *     top + height <= box.top - GAP     never taller than the gap it opens
     *                                       into
     *
     * Clamping the top edge FIRST is what makes the last one hold; sizing the
     * menu first (with a minimum) is exactly the bug that replaced it. The
     * floor only engages in the degenerate case — a composer within MIN_H of
     * the top edge, where NOTHING can satisfy both rules — and there a legible
     * MIN_H menu that overlaps is better than a zero-height sliver. Note the
     * floor is a floor on HEIGHT, never on the pre-clamp available value: that
     * was the original defect.
     * @param box - the composer card's rect ({ left, top, width }).
     * @returns {{ top: number, height: number, gap: number }} (plus the two
     *          bounds, so an assertion can read them instead of hard-coding).
     */
    function menuBox (box) {
      const GAP = 12;
      const MAX_H = 360;
      const MIN_H = 120;
      const top = Math.max(8, box.top - GAP - MAX_H);
      const available = Math.max(0, box.top - GAP - top);
      return { top, height: Math.min(MAX_H, Math.max(MIN_H, available)), gap: GAP, minHeight: MIN_H, maxHeight: MAX_H };
    }

    /** The dropdown, portalled to body so it escapes the composer's clipping. */
    function MenuPortal (props) {
      const { store } = props;
      const [, force] = react.useReducer((n) => n + 1, 0);
      const scrollRef = react.useRef(null);
      const thumbRef = react.useRef(null);
      const boxRef = react.useRef(null);
      const [box, setBox] = react.useState(null);

      react.useEffect(() => store.subscribe(force), [store]);

      react.useLayoutEffect(() => {
        const anchor = props.anchor.current;
        if (anchor === null) return undefined;
        /* setBox is called on every scroll/resize, so it MUST not allocate a
           fresh object each time: a new object is a new state value and
           re-renders the entire menu tree. Comparing the three numbers keeps
           identical rects from causing any render at all. */
        const update = () => {
          const next = anchor.closest('[data-composer-card]');
          const r = (next === null ? anchor : next).getBoundingClientRect();
          setBox((previous) => (
            previous !== null && previous.left === r.left && previous.top === r.top && previous.width === r.width
              ? previous
              : { left: r.left, top: r.top, width: r.width }
          ));
        };
        let frame = 0;
        const schedule = () => {
          if (frame !== 0) return;
          frame = window.requestAnimationFrame(() => {
            frame = 0;
            update();
          });
        };
        update();
        window.addEventListener('resize', schedule);
        /* NOT capture: a capture-phase listener also catches the menu's OWN
           inner scroll (the .dcl-scroll list), which re-measured the composer
           on every wheel tick for no reason. */
        window.addEventListener('scroll', schedule);
        return () => {
          if (frame !== 0) window.cancelAnimationFrame(frame);
          window.removeEventListener('resize', schedule);
          window.removeEventListener('scroll', schedule);
        };
      }, [props.anchor]);

      /* #19 — the self-drawn LEFT indicator. Its geometry is recomputed on every
         scroll tick, straight onto the thumb's style (no state, so scrolling
         never re-renders the menu). jsdom reports 0/0 for scrollHeight and
         clientHeight, so the ratio is guarded rather than allowed to go NaN. */
      react.useEffect(() => {
        const list = scrollRef.current;
        const thumb = thumbRef.current;
        if (list === null || thumb === null) return undefined;
        const sync = () => {
          const total = list.scrollHeight;
          const view = list.clientHeight;
          const ratio = total > 0 && view > 0 ? Math.min(1, view / total) : 1;
          const travel = total - view;
          const offset = travel > 0 ? list.scrollTop / travel : 0;
          /* Percent of the TRACK, floored so the thumb never vanishes. */
          const pct = Math.round(Math.max(18, ratio * 100));
          thumb.style.height = pct + '%';
          /* translateY is relative to the thumb's own height. */
          const shift = Math.round((offset * (100 - pct) / pct) * 10000) / 100;
          thumb.style.transform = 'translateY(' + shift + '%)';
        };
        /* V11 — the left indicator used to be a permanent 4px stripe. The user
           asked for something that hides itself and feels considered ("我想要
           那种可以自动隐藏的，并且动画效果更好的，更高级的感觉"). It fades in on
           any scroll and fades back out after a short idle, so the list is
           clean while reading and the indicator is there the moment it
           matters. */
        const track = thumb.parentElement;
        let idle = 0;
        const arm = () => {
          if (track === null) return;
          track.classList.add('is-active');
          if (idle !== 0) window.clearTimeout(idle);
          idle = window.setTimeout(() => track.classList.remove('is-active'), 1200);
        };
        const onScroll = () => { sync(); arm(); };
        sync();
        arm();
        list.addEventListener('scroll', onScroll, { passive: true });
        return () => {
          list.removeEventListener('scroll', onScroll);
          if (idle !== 0) window.clearTimeout(idle);
          if (track !== null) track.classList.remove('is-active');
        };
        /* [box], not []: the first render returns null (the anchor has not been
           measured yet), so a mount-only effect would run with null refs and
           never attach. */
      }, [box]);

      /* Nothing here needs the draft any more: after #17 a chip is pure store
         state and the payload is spliced in at submit time, so no view may
         write to (or read) the composer text. */
      const body = (function () {
        if (store.view === 'web') return viewWeb(store);
        if (store.view === 'skills') return viewSkills(store);
        if (store.view === 'commands') return viewCommands(rootContext, store);
        if (store.view === 'mcp') return viewMcp(rootContext, store);
        if (store.view === 'chats') return viewChats(store);
        if (store.view === 'plugins') return viewPlugins(rootContext, store);
        return viewRoot(rootContext, store);
      })();

      const needsSearch = store.view === 'skills' || store.view === 'plugins' || store.view === 'commands' || store.view === 'chats';
      const head = [];
      let scrollKids = body;
      if (needsSearch && body.length > 0) {
        /* body[0] is the breadcrumb bar these views open with. Lifting the
           search box into the pinned header must NOT take the crumbs with it
           — slicing them away leaves the user with no way back. */
        head.push(body[0]);
        const placeholder = store.view === 'skills'
          ? t('search.skills')
          : (store.view === 'commands'
            ? t('search.commands')
            : (store.view === 'chats' ? t('search.chats') : t('search.plugins')));
        head.push(searchBar(store, placeholder));
        scrollKids = body.slice(1);
      }

      if (box === null) return null;
      /* Open upward from the composer, inside the space that ACTUALLY exists
         above it.
         Order matters, and it used to be wrong: the old code sized the menu
         first (Math.max(160, box.top - GAP - 8) — a floor of 160px no matter
         how little room there was) and only then clamped top to 8. On a
         composer near the top of the window the two disagreed, the menu was
         TALLER than the gap it opened into, its content spilled over the
         header and the dock was pushed down.
         Clamp the top edge FIRST, then derive the height from the clamped
         value. The geometry lives in menuBox() so the invariant (top >= 8 and
         top + height <= box.top - GAP) is testable without a layout engine. */
      const geom = menuBox(box);
      const style = {
        position: 'fixed',
        left: box.left + 'px',
        top: geom.top + 'px',
        width: box.width + 'px',
        height: geom.height + 'px'
      };
      return reactDom.createPortal(
        h('div', { className: 'dcl-menu', 'data-dcl-menu': '1', ref: boxRef, style },
          head,
          h('div', { className: 'dcl-scrollwrap' },
            h('div', { className: 'dcl-scroll', ref: scrollRef }, scrollKids),
            /* #19 — the LEFT indicator. The native bar is hidden in CSS (it
               cannot be moved reliably), so this pair carries the position. */
            h('div', { className: 'dcl-scrollbar-l', 'aria-hidden': 'true' },
              h('span', { className: 'dcl-scrollbar-thumb', ref: thumbRef })))),
        document.body
      );
    }

    /** The picked-items rail, mounted above the composer in the dock slot.
     *
     * It ALWAYS renders its .dcl-railbox wrapper, but the wrapper is
     * max-height:0 until there is a chip, so the empty state contributes ZERO
     * height. The old build kept an empty spacer of the rail's own height
     * "to stop the jitter"; that permanently parked ~34px between the
     * 「N 条注释」 pill and the input card. Stability now comes from animating
     * the wrapper's max-height instead of from occupying space: the dock
     * absorbs the height change over .16s, so nothing jumps, and nothing is
     * reserved while the rail is empty.
     *
     * The inner .dcl-rail only exists when there is something to show, which
     * is also what the assertions key off (.dcl-rail === null <=> no gap). */
    function ChipRail (props) {
      const store = storeFor(useSessionKey(props.launcherSessionId, props.inputActions));
      const [, force] = react.useReducer((n) => n + 1, 0);
      const draft = readDraft(props);
      /* V16 — CACHE IT, and never re-read the draft from a gesture handler.
         spliceAndSubmit() used to call readDraft() from a DOM event handler, and
         readDraft calls props.useInput — a React HOOK (dsh-client-ui-slots
         standardHookPropName: slot "input" -> the useInput prop). A hook called
         outside a component body breaks the rules of hooks; React throws,
         readDraft's own catch turns that into '', and the interceptor then
         rewrote the draft to the chip payload ALONE (the user's text gone) or
         bailed out entirely. That single defect is both reported symptoms at
         once: "AI 说它一个都看不到" AND "发送了 UI 还在输入框上方没消失". The
         render-time value is the only legal one, so it is cached here. */
      store.latestDraft = draft;
      LAST_DRAFT = draft;
      const boxRef = react.useRef(null);
      react.useEffect(() => store.subscribe(force), [store]);
      const hasChips = store.chips.length > 0;
      /* R34 — WHICH MODE OWNS THE NEXT MESSAGE, said out loud.
       *
       * 计划 and 目标 are exclusive (see toggleGoalMode / the 计划 row), but a
       * green dot inside a closed menu is not an answer the user can read while
       * typing. When a mode is in force this strip renders directly above the
       * composer and cancels on click.
       *
       * R35 — 计划 and 目标 DO NOT SHARE A TENSE. 计划 is Host state that is
       * already active (its own chip is on screen); 目标 is a local flag that
       * only takes effect on the next send. The strip therefore reads the plan
       * PROJECTION for { active, pending } and says "已开启" / "正在进入", and
       * only 目标 keeps the "下一条消息" frame.
       *
       * R54 — AND IT NEVER MIRRORS A STATE THE HOST ALREADY RENDERS.
       *
       * The Host draws its own Plan chip in the composer's modes row
       * (conversation.input.plan, "Plan ×"), and that chip IS the plan-mode
       * indicator: it renders exactly while the effective target is plan mode
       * and cancels with /plan off. Mirroring it here made a SECOND, permanent
       * bar for a state the user can already see - and because the rail clears
       * itself after a send while that bar cannot (the mode is still on), the
       * leftover read as "发送之后 UI 没消失" in a screenshot.
       *
       * R55 — AND NEITHER DOES THE PENDING WINDOW.
       *
       * The strip's remaining plan branch flashed a warn-coloured bar for the
       * moment between /plan leaving and the projection turning active ("当我点击
       * 计划模式的时候呢，会有个黄色的UI突然跳出来"). That window is not ours
       * either: the Host chip renders on pending ? !active : active, i.e. it is
       * ALREADY on screen throughout the very same window.
       *
       * R56 — AND 目标 IS NOT A BAR EITHER.
       *
       * The last thing the strip owned was the local 目标 arming, and the user
       * asked for it in the Host chip's own seat and shape: "跟计划模式一样…
       * 显示在完全权限旁边，因为这两个模式是不可能说是一起用的". So the whole strip
       * is DELETED here and 目标 renders as a chip in the composer's modes row
       * (see LauncherButton). Nothing of ours is a full-width bar any more. */

      /* V9 — WHERE THE CHIPS LAND.
       *
       * The dock anchor is rendered with display:contents
       * (@deepseek-ai/dsh-client-ui-renderer SlotOutlet: ANCHOR_STYLE is
       * {display:'contents'}), so every dock entry is a DIRECT child of the
       * composer hero — and that hero stacks its children. The rail therefore
       * always opened its own line at the far left instead of continuing the
       * 「N 条注释」 pill ("顶格在最左边，而不是在注释屁股后面").
       *
       * Re-writing the host hero's flex direction would reflow the input bar
       * too, which is not ours to break. The rail is pulled onto the pill's
       * line arithmetically instead: measure the PRECEDING sibling (sidenote's
       * chip, which the dock's order places just before us) and lift/indent by
       * exactly its box. With no pill in front the offsets are cleared and the
       * rail simply takes its own row, as before. */
      react.useLayoutEffect(() => {
        const box = boxRef.current;
        if (box === null) return undefined;
        /* R13 — IN FLOW, aligned with the composer card.
         *
         * Two earlier attempts to make the chips ride the annotation pill's line
         * failed badly: a margin guess could not see the real dock, and a FIXED
         * box anchored by its BOTTOM edge grew UPWARD as the chips wrapped, covering the
         * annotation pill and the goal chip ("跟目标的重叠，跟注释也重叠，换行后
         * 重叠更夸张"). The rail is a normal row again, so wrapping pushes the
         * composer DOWN instead of overlapping anything, and its left edge is
         * matched to the card's left edge by measurement only.
         *
         * Clearing the inline offsets BEFORE measuring is load-bearing: measuring
         * with our own margin already applied reads back a zero delta and the
         * value would oscillate to 0. */
        const place = () => {
          box.style.position = '';
          box.style.left = '';
          box.style.right = '';
          box.style.top = '';
          box.style.bottom = '';
          box.style.width = '';
          box.style.marginLeft = '';
          /* R56 — the rail is the only thing this box can hold now that 目标 is a
             chip in the modes row, so an empty rail is simply parked. */
          if (!hasChips) return;
          const card = document.querySelector('[data-composer-card]');
          if (card === null) return;
          const cardRect = card.getBoundingClientRect();
          const ownRect = box.getBoundingClientRect();
          if (cardRect.width <= 0 || ownRect.width <= 0) return;
          box.style.width = Math.round(cardRect.width) + 'px';
          box.style.marginLeft = Math.round(cardRect.left - ownRect.left) + 'px';
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
          window.removeEventListener('resize', place);
          window.removeEventListener('scroll', place, true);
        };
      }, [hasChips, store.chips.length]);

      return h('div', {
        className: 'dcl-railbox' + (hasChips ? ' has' : ''),
        ref: boxRef,
        'aria-hidden': hasChips ? undefined : 'true'
      }, [
        hasChips ? h('div', { className: 'dcl-rail', key: 'rail' }, store.chips.map((chip, index) =>
          h('span', { className: 'dcl-chip', key: chip.label + index },
            h('span', { className: 'dcl-chip-ic', dangerouslySetInnerHTML: { __html: chip.icon === undefined || chip.icon === null ? ICON.plug : chip.icon } }),
            h('span', { className: 'dcl-chip-t' }, chip.label),
            h('span', {
              className: 'dcl-chip-x',
              onClick: () => {
                store.chips.splice(index, 1);
                /* Same reasoning: removing a chip changes only the rail; the
                   draft was never carrying the payload. */
                store.set({});
              }
            }, '×')))) : null
      ]);
    }

    /* ------------------------------------------------------------------ *
     * Settings card
     *
     * Shaped like every other card in 设置 → 插件 → 插件配置: ONE collapsed row
     * (name + description + chevron) that expands into the real form.
     *
     * The framework does NOT supply that row. dsh-client-ui-settings-plugins
     * only dispatches by namespace —
     *   renderSlot("settings.plugin.item", {}, { entryKey: ns })
     * — so each plugin draws its own header. The markup and every CSS value
     * below are copied from the framework's own PluginCard (its .YyYd_a_*
     * rules) so this card is pixel-identical to 表情 / Docker 容器面板 instead
     * of dumping ten switches at level 1.
     * ------------------------------------------------------------------ */
    const SETTINGS_OPEN_KEY = 'dsh-composer-launcher/settings-open';
    /**
     * 设置页展开状态 —— **只记在内存里**（同一个会话内重挂还记着，软件一重启就回到收起）。
     *
     * 「启动器这个界面一打开就直接打开了，哪怕软件重启它还是打开的，
     * 应该软件重启了默认关闭」。原来它把 open 写进 localStorage，于是**永久**记住"上次是开的"。
     */
    let SETTINGS_CARD_OPEN = false;

    function SettingsCard () {
      const store = storeFor('settings');
      const [, force] = react.useReducer((n) => n + 1, 0);
      const [open, setOpen] = react.useState(SETTINGS_CARD_OPEN);
      /* R61 — the plugin picker's open state lives in the component, not in a
         window.prompt the surface cannot render. */
      const [pickerOpen, setPickerOpen] = react.useState(false);
      /* 选择器里的筛选词（40+ 个插件平铺时，没有搜索框就等于"找不到"）。 */
      const [pickQuery, setPickQuery] = react.useState('');
      /* 选择器的筛选片：全部 / 只看已启用 / 只看已常驻。 */
      const [pickFilter, setPickFilter] = react.useState('all');
      react.useEffect(() => store.subscribe(force), [store]);
      const cfg = CONFIG;

      const setOpenPersisted = (next) => {
        SETTINGS_CARD_OPEN = next === true;
        setOpen(next);
        /* 顺手把以前留下来的那条 localStorage 记录清掉 —— 不然已记住的偏好还会"被记住"。 */
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.removeItem(SETTINGS_OPEN_KEY);
          } catch {
            /* 清不掉也只是留一条没用的记录 */
          }
        }
      };

      const toggle = (key) => () => {
        cfg[key] = !cfg[key];
        commitConfig();
      };
      /** 选择器里按筛选词 + 筛选片过滤后的插件行。 */
      const filteredPluginRows = () => {
        const all = Array.isArray(store.plugins) ? store.plugins : [];
        const byChip = all.filter((row) => {
          if (pickFilter === 'on') return row.enabled === true;
          if (pickFilter === 'pinned') return cfg.pinned.some((name) => samePluginName(name, row.name));
          return true;
        });
        const query = pickQuery.trim().toLowerCase();
        if (query === '') return byChip;
        return byChip.filter((row) => String(row.name).toLowerCase().indexOf(query) >= 0
          || String(row.title ?? '').toLowerCase().indexOf(query) >= 0
          || String(row.entryId ?? '').toLowerCase().indexOf(query) >= 0);
      };
      /**
       * 选择器本体（loading / 读失败 / 真的没有 / 筛不到 / 列表 五态）。
       *
       * 「读失败」和「真的没有」以前长得一模一样，这是"添加不了"的
       * 另一种死法：inventory 远程一时失败时只显示"宿主机没有报告任何插件"，
       * 以为永远没有自己要的插件。现在分开报错 + 给重试按钮。
       */
      const pickerBody = () => {
        if (store.pluginState === 'loading') {
          return h('span', { className: 'dcl-note' }, t('settings.pinned.loading'));
        }
        if (store.pluginState === 'error') {
          return h('span', { className: 'dcl-note' }, [
            h('span', { key: 'e' }, t('settings.pinned.failed')),
            h('button', {
              key: 'r', type: 'button', className: 'dcl-btn2',
              onClick: () => { void loadPlugins(rootContext, store); }
            }, t('settings.pinned.retry'))
          ]);
        }
        const all = Array.isArray(store.plugins) ? store.plugins : [];
        if (all.length === 0) {
          return h('span', { className: 'dcl-note' }, t('settings.pinned.empty'));
        }
        const rows = filteredPluginRows();
        if (rows.length === 0) {
          return h('span', { className: 'dcl-note' }, t('settings.pinned.nomatch'));
        }
        return rows.map((row) => {
          const title = typeof row.title === 'string' && row.title !== '' ? row.title : row.name;
          const bits = [];
          if (typeof row.entryId === 'string' && row.entryId !== '') bits.push(row.entryId);
          if (typeof row.toolCount === 'number') {
            bits.push(row.toolCount === 0 ? t('settings.pinned.noTools') : t('settings.pinned.tools', { n: row.toolCount }));
            if (row.bytes > 0) bits.push(t('settings.pinned.tokens', { n: approxTokens(row.bytes) }));
          }
          if (row.enabled !== true) bits.push(t('settings.pinned.disabled'));
          if (row.uiOnly === true) bits.push(t('settings.pinned.uiOnly'));
          return h('button', {
            key: row.name,
            type: 'button',
            /* 两行：第一行中文名（认得出），第二行包名 + 工具数 + 大概 token（知道代价）。 */
            className: 'dcl-pick2' +
              (cfg.pinned.some((name) => samePluginName(name, row.name)) ? ' on' : ''),
            title: row.name,
            onClick: () => {
              const at = cfg.pinned.findIndex((name) => samePluginName(name, row.name));
              if (at >= 0) cfg.pinned.splice(at, 1);
              else cfg.pinned.push(row.name);
              commitConfig();
            }
          },
          h('span', { className: 'dcl-pick-t', key: 't' }, title),
          h('span', { className: 'dcl-pick-s', key: 's' }, row.name + (bits.length === 0 ? '' : ' · ' + bits.join(' · '))));
        });
      };
      const step = (key, min, max) => (delta) => () => {
        cfg[key] = Math.min(max, Math.max(min, cfg[key] + delta));
        commitConfig();
      };
      const field = (label, hint, control, key) => h('div', { className: 'dcl-f', key },
        h('div', { className: 'dcl-lab' }, h('b', null, label), hint === null ? null : h('i', null, hint)),
        control);
      const sw = (key) => h('button', {
        type: 'button', className: 'dcl-sw', 'data-on': cfg[key] ? '1' : '0', onClick: toggle(key)
      });
      const stepper = (key, min, max) => h('span', { className: 'dcl-stepper' },
        h('button', { type: 'button', onClick: step(key, min, max)(-1) }, '−'),
        h('span', null, String(cfg[key])),
        h('button', { type: 'button', onClick: step(key, min, max)(1) }, '+'));

      return h('li', { className: 'dcl-sc' + (open ? ' open' : '') },
        h('button', {
          type: 'button',
          className: 'dcl-sc-h',
          'aria-expanded': open ? 'true' : 'false',
          'aria-label': t(open ? 'settings.collapseAria' : 'settings.expandAria') + t('settings.title'),
          /**
           * Measured on the real settings pane: the card is 827px tall when
           * expanded, while the pane itself is only ~746px high. Scrolling down
           * to the pinned / filter rows therefore pushes the card's own title
           * out of the pane (measured: title at y=-45, card body from y=-30),
           * which reads as "the panel escaped its frame".
           * ⇒ after expanding, scroll the title back into view (block:nearest,
           * the smallest move there is, so a scroll in progress is not lost).
           */
          onClick: (event) => {
            const next = !open;
            setOpenPersisted(next);
            if (!next) return;
            const head = event === undefined ? null : event.currentTarget;
            setTimeout(() => {
              try { if (head !== null) head.scrollIntoView({ block: 'nearest' }); } catch { /* 老浏览器就算了 */ }
            }, 0);
          }
        },
        h('span', { className: 'dcl-sc-t' },
          h('span', { className: 'dcl-sc-n' }, t('settings.title')),
          h('span', { className: 'dcl-sc-d' }, t('settings.subtitle'))),
        h('span', { className: 'dcl-sc-c', dangerouslySetInnerHTML: { __html: ICON.chevDown } })),
        open ? h('div', { className: 'dcl-sc-b' },
          h('div', { className: 'dcl-card' },
            h('div', { className: 'dcl-grp' }, h('h4', null, t('settings.section.add')),
          field(t('settings.showWeb'), t('settings.showWeb.hint'), sw('showWeb'), 'a1'),
          field(t('settings.webCount'), t('settings.webCount.hint'), stepper('webCount', 1, 10), 'a2'),
          field(t('settings.port'), t('settings.port.hint'), h('input', {
            className: 'dcl-input', type: 'number', min: 1, max: 65535, value: cfg.port,
            onChange: (event) => {
              const next = Number.parseInt(event.currentTarget.value, 10);
              cfg.port = Number.isInteger(next) ? next : cfg.port;
              commitConfig();
            }
          }), 'a3'),
          /* B2 — the debug-browser LAUNCH action lives here now. It opens a
             second, empty browser profile, so it is a maintenance action, not
             the answer to 「浏览器」; the menu's browser entry is the tab list. */
          field(t('settings.debugBrowser'),
            t('settings.debugBrowser.hint', { port: cfg.port }),
            h('button', {
              type: 'button', className: 'dcl-btn2',
              onClick: () => { void openDebugBrowser(store); }
            }, t('settings.debugBrowser.go')), 'a7'),
          field(t('settings.showFiles'), t('settings.showFiles.hint'), sw('showFiles'), 'a4'),
          field(t('settings.showPlan'), t('settings.showPlan.hint'), sw('showPlan'), 'a5'),
          field(t('settings.showGoal'), t('settings.showGoal.hint'), sw('showGoal'), 'a6')),

        h('div', { className: 'dcl-grp' }, h('h4', null, t('settings.section.cap')),
          field(t('settings.showCmd'), t('settings.showCmd.hint'), sw('showCmd'), 'b1'),
          field(t('settings.showSkill'), t('settings.showSkill.hint'), sw('showSkill'), 'b2'),
          field(t('settings.showMcp'), t('settings.showMcp.hint'), sw('showMcp'), 'b3')),

        h('div', { className: 'dcl-grp' }, h('h4', null, t('settings.section.plug')),
          field(t('settings.pluginMode'), t('settings.pluginMode.hint'),
            h('span', { className: 'dcl-seg' }, ['pinned', 'frequent', 'mixed'].map((mode) =>
              h('button', {
                key: mode, type: 'button', 'data-on': cfg.pluginMode === mode ? '1' : '0',
                onClick: () => { cfg.pluginMode = mode; commitConfig(); }
              }, t('settings.mode.' + mode)))), 'c1'),
          field(t('settings.pluginCount'), t('settings.pluginCount.hint'), stepper('pluginCount', 1, 10), 'c2'),
          h('div', { className: 'dcl-f', key: 'c3' },
            h('div', { className: 'dcl-lab' }, h('b', null, t('settings.pinned')), h('i', null, t('settings.pinned.hint')))),
          h('div', { className: 'dcl-pinrow', key: 'c4' },
            cfg.pinned.length === 0 ? h('span', { className: 'dcl-note' }, t('settings.pinned.none')) : null,
            cfg.pinned.map((name, index) => {
              /* R30 — 常驻项必须能看出「这台机器上到底有没有这个插件」。
                 过「设置里的常驻跟加号界面不一致」：没装的常驻项在加号界面
                 里当然出不来（没有可点的条目），设置里却还挂着一个绿点，像在生效。
                 现在没装的画成黄点 + 「未安装」，一眼就能删掉。 */
              const known = Array.isArray(store.plugins) && store.plugins.some((p) => samePluginName(p.name, name));
              return h('span', { className: 'dcl-pin', key: name },
                h('span', { className: 'dcl-dot ' + (known ? 'dcl-dot-pin' : 'dcl-dot-warn') }),
                name,
                known ? null : h('i', { className: 'dcl-pin-miss' }, t('settings.pinned.missing')),
                h('span', {
                  className: 'dcl-pin-x',
                  onClick: () => {
                    cfg.pinned.splice(index, 1);
                    /* 同时忘掉用量记录：否则「混合 / 高频」规则下次又把它补回来
                       （：「删掉了，重启之后又出现了」）。 */
                    dropFrequency(name);
                    commitConfig();
                  }
                }, '×'))
            }),
            h('button', {
              type: 'button', className: 'dcl-pin dcl-pin-add',
              onClick: () => {
                /* R61 — NO window.prompt.
                 *
                 * The DSH surface does not implement it, so this button was a
                 * silent no-op ("添加插件是没有用的"), which is also why 常驻插件
                 * could never be extended. The picker below is a REAL list of the
                 * plugins the Host reports through remote.pluginInventory. */
                if (pickerOpen !== true) void loadPlugins(rootContext, store);
                setPickerOpen(pickerOpen !== true);
              }
            }, t('settings.pinned.add'))),
          pickerOpen ? h('div', { className: 'dcl-pickwrap', key: 'c4b' },
            /* 「添加不了」的一半是**根本找不到**：清单里 40+ 个插件
               平铺成一片小药丸，没有搜索框，以为列表里没有自己要的那个。
               现在加一个筛选框 + 计数，并把"只列已安装插件"写清楚
               （市场里还没装的东西不会出现在这儿 ⇒ 先去插件市场装）。 */
            h('div', { className: 'dcl-pickbar', key: 'bar' },
              h('input', {
                className: 'dcl-input dcl-picksearch',
                type: 'search',
                placeholder: t('settings.pinned.search'),
                value: pickQuery,
                onInput: (event) => { setPickQuery(String(event.currentTarget.value ?? '')); }
              }),
              h('span', { className: 'dcl-seg dcl-pickseg', key: 'seg' }, [
                ['all', 'settings.pinned.filterAll'],
                ['on', 'settings.pinned.filterOn'],
                ['pinned', 'settings.pinned.filterPinned']
              ].map((pair) => h('button', {
                key: pair[0], type: 'button', 'data-on': pickFilter === pair[0] ? '1' : '0',
                onClick: () => setPickFilter(pair[0])
              }, t(pair[1])))),
              h('span', { className: 'dcl-note', key: 'n' },
                t('settings.pinned.count', {
                  n: filteredPluginRows().length,
                  total: (Array.isArray(store.plugins) ? store.plugins : []).length
                }))),
            h('div', { className: 'dcl-picklist', key: 'list' }, pickerBody()),
            h('div', { className: 'dcl-note', key: 'hint' }, t('settings.pinned.installedOnly'))) : null,
          h('div', { className: 'dcl-note', key: 'c5' }, t('settings.source')),
          h('div', { key: 'c6' },
            h('button', {
              type: 'button', className: 'dcl-btn2',
              onClick: () => {
                CONFIG = Object.assign({}, DEFAULTS, { pinned: DEFAULTS.pinned.slice() });
                /* 恢复默认＝干净默认：连"用量记忆"一起清（见 clearFrequency 的注释）。 */
                clearFrequency();
                commitConfig();
              }
            }, t('settings.reset')))))) : null);
    }

    /* ------------------------------------------------------------------ *
     * Plugin body
     * ------------------------------------------------------------------ */
    /**
     * Services this plugin needs; the loader waits for them before apply().
     *
     * The 'remote.*' entries are NOT optional decoration. A typert remote
     * only appears on ctx.remote after its namespace is declared here — the
     * framework's own consumers declare them exactly this way:
     *   dsh-client-ui-settings-plugin-inventory: inject = ["slots","locale",
     *       "remote","remote.pluginInventory"]
     *   dsh-client-ui-commands:                  inject = [..., "remote",
     *       "remote.commands", ...]
     *   dsh-client-ui-skill:                     inject = ["inputTriggers",
     *       "sessions","slots","locale","remote","remote.skills"]
     * Without remote.pluginInventory, ctx.remote.pluginInventory was undefined,
     * loadPlugins threw, the catch swallowed it and 全部插件 rendered empty —
     * a wiring bug disguised as a content bug.
     *
     * remote.skills was the SAME defect a SECOND time: ctx.remote.skills was
     * undefined, loadSkills threw, the catch swallowed it and 技能 rendered
     * blank. Both namespaces are declared here so neither can regress.
     *
     * 'sessions' + 'inputTriggers' are what make a session-SCOPED trigger
     * controller reachable; inputTriggers.sessionOf() throws on a root context.
     */
    const inject = [
      'slots',
      'remote',
      'remote.commands',
      'remote.pluginInventory',
      'remote.skills',
      /* remote.mcpManager is the THIRD time this bit us (pluginInventory, then
         skills, now the MCP roster). Without it ctx.get('remote.mcpManager')
         answers undefined, mcpCall fails on every method, listWorkspaces never
         lands, the workspace <select> stays empty/disabled and the per-workspace
         eye is never rendered — the whole 能力 -> MCP page degrades to one line
         of error text with no way to see another workspace. */
      'remote.mcpManager',
      'settingsScope',
      'sessions',
      'inputTriggers',
      /* UI language (dsh-client-locale provides it). Optional: t() falls back to
         <html lang> and then to English, so a composition without it still
         renders — but declaring it is what makes ctx.get('locale') resolve. */
      'locale'
    ];

    let rootContext;

    function apply (ctx) {
      rootContext = ctx;
      ensureStyles();
      /* C1/C2 — the tooltip + dot sheet, and the bridge that retires every
         native title inside our own subtrees. Both are pure until called, so
         apply() stays free of any DOM/服务 access that a real loader could
         choke on. */
      ensureExtraStyles();
      ctx.effect(() => installTitleBridge(), 'dsh-composer-launcher: unified tooltip bridge');
      /* Copy follows the interface language; the returned disposer is the
         MutationObserver path, so cordis tears it down with the plugin. */
      ctx.effect(() => languageWatcher(ctx), 'dsh-composer-launcher: interface language');

      const seed = loadConfig();
      if (seed !== null) {
        CONFIG = Object.assign({}, DEFAULTS, seed, {
          pinned: seed.pinned === undefined ? DEFAULTS.pinned.slice() : seed.pinned
        });
      }
      void storeFor('settings');

      /* Bind the Host settings scope so the card edits the real document
         instead of only the localStorage mirror. Every step is defensive: a
         deployment without the scope keeps working off the mirror. */
      ctx.inject(['settingsScope'], (scopeCtx) => {
        let scope;
        try {
          scope = scopeCtx.settingsScope.bind({ namespace: NS, decode: decodeConfig });
        } catch (error) {
          ctx.logger?.warn?.('dsh-composer-launcher: settings scope unavailable', error);
          return;
        }
        settingsScope = scope;
        const sync = () => {
          try {
            const snapshot = scope.getSnapshot();
            const value = snapshot === undefined || snapshot === null ? undefined : snapshot.value;
            if (value === undefined || value === null) return;
            CONFIG = Object.assign({}, DEFAULTS, decodeConfig(value));
            broadcast();
          } catch {
            /* A malformed section keeps the last good config. */
          }
        };
        sync();
        try {
          ctx.effect(() => scope.subscribe(sync), 'dsh-composer-launcher: settings mirror');
        } catch {
          /* subscription is a nicety, not a precondition */
        }
      });

      /* The registration's OWN inject() receives the real sessionId and its
         return value is merged into the component's props — the same contract
         dsh-client-ui-input-trigger uses for its overlay menu. This is the only
         way to learn a real session address here: the composer's standard kit
         deliberately exposes inputActions/useInput but NOT sessionId. */
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: 'composer-launcher',
        order: 40,
        inject: (sessionId) => ({ launcherSessionId: sessionId })
      }, LauncherButton));

      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'composer-launcher-rail',
        /* 30 > dsh-sidenote's 10, so the 「N 条注释」 chip renders FIRST and
           this rail sits after it. Same list slot = the two stack in flow
           instead of overlapping. */
        order: 30,
        inject: (sessionId) => ({ launcherSessionId: sessionId })
      }, ChipRail));

      /* #21 — the drag handle. conversation.input.overlay is a REAL slot, and a
         LIST one at that (verified in the framework's own declaration table:
         "conversation.input.overlay": { kind: "list", scope: "session" }), so a
         second occupant is legal here — unlike conversation.input.plan, which
         is single. Its container (the card's .overlayAnchor) is a zero-height
         position:absolute box at the top of the composer, which is exactly
         where a row-resize handle belongs. A list slot REQUIRES options.id. */
      ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: 'composer-launcher-resize',
        order: 20,
        inject: (sessionId) => ({ launcherSessionId: sessionId })
      }, ResizeHandle));

      /* WHY THERE IS NO GOAL CHIP REGISTRATION HERE (#10).
       *
       * The indicator was meant to sit next to the official Plan chip, i.e. a
       * second occupant of "conversation.input.plan". That is impossible, and
       * the framework says so itself:
       *   dsh-client-ui-conversation/lib/client.js declares
       *     "conversation.input.plan": { kind: 'single', scope: 'session' }
       *   dsh-client-ui-slots/lib/index.js SlotCore.register(), case 'single':
       *     throws when a registration already holds the same priority
       *     ("register at a different priority to shadow it (lowest renders)")
       *   entriesOfSlot(): a single slot is ONE cell — only the winner renders.
       * dsh-client-ui-plan registers it with no priority and no id.
       * So a same-priority registration THROWS, and a lower-priority one would
       * SHADOW (hide) the official Plan chip instead of sitting beside it.
       *
       * Goal mode is therefore purely local: the composer placeholder + the
       * height animation + the 目标 row as the toggle/withdraw control. It is
       * deliberately NOT moved to the rail: mode chips must not ride the
       * picked-items rail.
       */

      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: NS,
        id: NS
      }, SettingsCard));

      /* R53 — a plugin unload MUST NOT clear this registry. Clearing it is what
         orphans a rail instance that is still mounted (see SESSIONS_KEY): its
         chips would live in a store the next evaluation can no longer reach, so
         the rail would show picks the send interceptor cannot see. Stores are
         keyed by session and bounded by the sessions the user actually opened,
         so keeping them across a reload is the cheap side of that trade. */
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.NS = NS;
    exports.LauncherButton = LauncherButton;
    exports.ChipRail = ChipRail;
    exports.ResizeHandle = ResizeHandle;
    exports.SettingsCard = SettingsCard;
    /* Test seam: lets a headless harness reach the per-zone stores without
       having to drive them through clicks. Not used by the plugin itself. */
    exports.__debug = {
      storeFor,
      zoneKeyOf,
      menuBox,
      goView,
      goBack,
      /* C1/C2/C3/E1/E2 — pure helpers, so the tooltip bridge, the dot
         contract and the purpose->icon table can be asserted headlessly. */
      iconFor,
      statusDot,
      modeDot,
      planModeOn,
      /* R30 — the projection readers, exported so the effective-target rule can
         be asserted without a DOM chip. */
      planFaceOf,
      planStateOf,
      planModeNow,
      /* R28/R29 — the reference-insert contract: the detect-coordinate
         arithmetic, the folder mention grammar, and the chip writer itself. */
      hostInsertReference,
      detectLengthOf,
      folderMentionOf,
      /* R52 — the send path must round-trip the draft in the coordinates that
         are actually submitted: the Host input store's clipboard draft, where a
         chip is its whole mention (never the DOM label). Exported so the
         loss-free round-trip can be asserted headlessly. */
      inputStoreOf,
      clipboardDraftOf,
      sendDraftOf,
      /* R33 — the payload contract: a reference must carry its ADDRESS, and the
         chip that carries it must survive pick() intact. */
      chipPayload,
      draftWith,
      ICON_RULES,
      ICON_PLUG: ICON.plug,
      EXTRA_ICON,
      EXTRA_CSS,
      /* Goal mode: pure helpers, so the placeholder/height contract and the
         slot decision can be asserted headlessly. */
      goalArmed,
      applyGoalMode,
      toggleGoalMode,
      activeGoalOf,
      /* R31 — the verb chooser: /goal vs /goal edit, by the Host's own rule. */
      goalCommandPrefix,
      /* R37 — the goal is set through remote.goals, not through a command, so
         the pure pieces are exported for the harness. */
      setGoalViaRemote,
      goalRefOf,
      /* R42 — the eye's re-read is exported so the harness can prove the
         workspace view is picked up from the Host, not just written to it. */
      revalidateMcpRoster,
      sameList,
      /* #21 — the composer-height contract, exported so the ancestor lookup,
         the clamp and the persistence can be asserted headlessly. */
      composerHeightOwner,
      clampComposerHeight,
      applyComposerHeight,
      currentComposerHeight,
      readStoredComposerHeight,
      writeStoredComposerHeight,
      COMPOSER_HEIGHT_KEY,
      COMPOSER_HEIGHT_VAR,
      WEB_HOVER_LEAVE_MS,
      hoverPanelBox,
      HOVER_MIN_H,
      HOVER_MAX_H,
      HOVER_GAP,
      HOVER_EDGE,
      /* Still a string, but resolved when it is read, so a headless reader
         gets the copy in whichever language is active at that moment. */
      get GOAL_PLACEHOLDER () { return t('goal.placeholder'); },
      GOAL_MIN_HEIGHT,
      GOAL_TRANSITION_MS,
      GOAL_EASE,
      /* F4 — the tab row's data contract, exported so the caps and the
         '· <browser>' suffix can be asserted headlessly. */
      clampText,
      tabName,
      tabHost,
      tabBrowser,
      TAB_NAME_MAX,
      TAB_HOST_MAX,
      /* F4 — the row's own stylesheet, so a real-Chromium probe can lay a row
         out and MEASURE the ellipsis / the un-compressed browser suffix
         instead of trusting a CSS string match. */
      CSS,
      getConfig: () => CONFIG,
      setConfig: (next) => { CONFIG = next; broadcast(); },
      reset: () => { sessions.clear(); }
    };
    return module.exports;
  }
});
