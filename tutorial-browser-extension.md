# Browser extension tutorial: how to install it, how to verify it, what to do if it fails

> Applies to: `dsh-composer-launcher` **1.0.0** and later.
> This covers only the browser extension used by the "tabs" row in the composer.
> **Without the extension everything else in the plugin still works** — the "tabs" row simply falls back to reading via the debug port (it still gets data, just not the extension's own information).

---

## 1. The short version

| Route | Installs into | What you have to do | Verified? |
|---|---|---|---|
| **A. A browser the plugin launches** | the browser process the plugin starts itself | **Nothing — one click** | ✅ Verified (Edge 155.0.4283.45) |
| **B. The browser you actually use** | your everyday Edge / Chrome / Brave / … | one-time manual install (~20 s), then it stays | ✅ Standard route |
| **C. Enterprise policy** | the whole machine | admin rights + self-hosted signed CRX + HTTPS manifest | ❌ Not provided here; explained only |

**The Chromium hard limit, stated up front**: no plugin can silently push a folder from disk into your everyday browser's extension list — that needs a user gesture or an enterprise policy.
So "install the plugin and the extension is installed too" is true **only for route A**; route B we reduced to two buttons plus five manual steps; route C only an administrator can do, and this repository does not provide it.

---

## 2. Route A: let the plugin launch a browser that already has it (recommended, zero manual work)

### How to trigger it

- UI: the **[Open a browser with the extension loaded]** button in the composer's empty state / tab row
- HTTP: `POST /composer-launcher/open-debug-browser`

### What the plugin actually does

1. **Stages the extension**: copies `extension/` from the plugin's install directory to `<DSH_HOME>\extensions\dsh-tab-bridge` (on Windows: `%APPDATA%\dsh-desktop\harness\extensions\dsh-tab-bridge`), then **validates the 6 required files one by one**: `manifest.json`, `background.js`, `popup.html`, `popup.js`, `_locales\en\messages.json`, `_locales\zh_CN\messages.json`. If any is missing it deletes the half-written copy and re-copies; if the copy fails it logs and reports failure honestly (**never** hands a half extension to the browser).
2. **Launches the browser** (Chromium family, whichever is installed), with:

   ```
   --user-data-dir=<the plugin's own profile>
   --remote-debugging-port=<debug port>
   --no-first-run --no-default-browser-check
   --load-extension=<staged directory>
   --disable-extensions-except=<staged directory>
   --disable-features=DisableLoadExtensionCommandLineSwitch
   about:blank
   ```

   > `--disable-features=…` is for Edge/Chrome **137+**: without it `--load-extension` is ignored outright.
   > `--user-data-dir` is mandatory: Chromium refuses to open a debug port on the default profile.

3. **Verifies it really mounted** (this is the important step): reads `http://127.0.0.1:<debug port>/json/list` and only counts it as success when `chrome-extension://<this extension>/background.js` appears — the result then has `extensionLoaded: true`.
   Browsers' own extensions use `_generated_background_page.html` / `background.rollup.js`, which do **not** count.
4. **Self-heals**: if that profile refused to mount it (long-lived old profiles measured at a 0% mount rate), the plugin:
   kills that browser process tree → waits for the debug port to actually be released (polls to confirm) → retries **once** with a clean `<original profile>-ext` profile → verifies again.
   If both attempts fail it reports `extensionLoaded: false` plus a `note` explaining why, and the tab row falls back to the debug port — **it never claims success it did not verify**.

### What the response looks like

```json
{"ok":true,"launched":true,"binary":"…\\msedge.exe","userDataDir":"…\\.dsh-edge-agent-ext",
 "extensionLoaded":true,"healed":true,"note":"the old profile is no longer accepted; switched to a clean profile: …"}
```

`extensionLoaded` has been **verified**; `healed:true` means it only succeeded after switching to a clean profile.

---

## 3. Route B: install it into the browser you actually use (one time, ~20 s)

1. Click **[Open the extensions page]** — the plugin opens the extensions page of the first Chromium browser on this machine (`edge://extensions` or `chrome://extensions`).
   (HTTP: `POST /composer-launcher/open-extensions-page`)
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select this directory:
   ```
   %APPDATA%\dsh-desktop\harness\extensions\dsh-tab-bridge
   ```
   i.e. `<DSH_HOME>\extensions\dsh-tab-bridge`. The **[Copy extension path]** button puts it on the clipboard.
5. Click the extension icon and confirm the **bridge port is 43130** (fill in the real port if it differs — needed when `DSH_LAUNCHER_BRIDGE_PORT` was changed).

Script route (non-interactive is fine too): `install-extension.ps1` in the repository root, `-Browser <id>` to pick one.

---

## 4. Route C: enterprise policy (not provided here)

To make it automatic for everyone on a machine you need administrator tooling: group policy / registry `ExtensionSettings` plus `ExtensionInstallForcelist`, together with a **self-hosted signed CRX** and an HTTPS update manifest.
That needs a certificate, admin rights and a distribution server — **outside this plugin's scope**. It is listed only so you know the route exists.

---

## 5. How to confirm it really installed

| Check | Where |
|---|---|
| The composer's "tabs" row starts listing pages | just look at the UI |
| `extensionTabs` > 0 | `GET /composer-launcher/health` → `{"ok":true,"plugin":"dsh-composer-launcher","extensionTabs":N,"extensionAt":…}` |
| The browser itself lists it | `edge://extensions` / `chrome://extensions` |
| Hardest check | `GET http://127.0.0.1:<debug port>/json/list` shows `chrome-extension://…/background.js` |

---

## 6. If it will not install

| Symptom | Cause | What to do |
|---|---|---|
| Browser opens, tab row stays empty | that profile refuses to mount extensions (common with old profiles) | click again (the plugin self-heals onto a clean profile); or use route B |
| `extensionLoaded:false` + `note` | both attempts failed (the browser ignored `--load-extension`) | use route B; also check whether the browser is locked down by other policy/launch flags |
| `extensionTabs:0` | extension installed but cannot reach the bridge: wrong port / bridge not running | set the bridge port in the extension popup; confirm 43130 (or `DSH_LAUNCHER_BRIDGE_PORT`) is listening |
| Logs report a staging failure | `extension/` missing from the install dir, or antivirus blocked it | read the `[extension]` lines in the log; reinstall the plugin if needed |
| You use Firefox / Safari | this is a Chromium extension | not supported today; use Chrome/Edge/Brave/Vivaldi/Opera |
| Two DSH instances on one machine | both want 43130 | set `DSH_LAUNCHER_BRIDGE_PORT` for one of them and put the same port in the extension popup |

---

## 7. Prompt for your own agent (copy-paste)

```
Please install the DSH composer browser extension into the browser I normally use.
The staged extension directory is: %APPDATA%\dsh-desktop\harness\extensions\dsh-tab-bridge
If that directory does not exist or has no manifest.json, tell me — do not create one yourself.
Steps: open my usual browser's extensions page (edge://extensions or chrome://extensions) → enable Developer mode →
Load unpacked → pick the directory above → confirm it shows as enabled.
Then report: which browser it went into, any errors, and the bridge port I should put in the extension popup (default 43130).
Do not change browser launch flags, do not edit the registry, do not install enterprise policy.
```

---

## 8. One-line summary

**Route A is zero-manual and verified** (the plugin's own browser carries the extension, and the plugin verifies, self-heals and reports failure honestly); **route B is the only way into your everyday browser**, now two buttons plus five steps; silent installation into an everyday browser is impossible by Chromium's security design, not a defect of this plugin.
