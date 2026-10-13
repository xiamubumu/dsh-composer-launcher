# dsh-composer-launcher -- one-shot (re)install into the web profile.
#
# WHAT WENT WRONG BEFORE (why this file looks the way it does)
# ------------------------------------------------------------
# The first version hand-wrote `dependencies` + `dsh.profile.bundles` +
# `pnpm.overrides`. That LOOKS like an install and survives until the next DSH
# launch -- then the desktop generation projector (`projectGenerations`) rebuilds
# the profile manifest FROM ITS OWN REGISTRY and silently drops every field it
# does not own. Measured: after one restart all three entries were gone and the
# plugin was invisible, with no `composer-launcher` line anywhere in harness.log.
#
# So the steps are now:
#   1. the client bundle must be backtick-free
#   2. install.mjs writes the REGISTRY
#      (generation.json + desired.json) and then CALLS DSH's own
#      projectGenerations(), so all four manifest fields -- dependencies,
#      dsh.profile.bundles, pnpm.overrides and dsh.desktop.generationProjection
#      -- are written by the official code and survive a restart.
#   3. the Host half must import from the profile
#
# A DSH restart is required afterwards: cordis.patch.yml and the profile
# manifest are read at boot only.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1

$ErrorActionPreference = 'Stop'

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Name = 'dsh-composer-launcher'

# --- adaptive root: NO literal drive letter, username or platform assumption ------------
# Pure ASCII + 5.1-compatible on purpose (Windows PowerShell 5.1 reads a BOM-less .ps1 as
# ANSI, and it has no '??' operator).
$isWin = $true
$isMac = $false
if (Test-Path variable:IsWindows) { $isWin = [bool]$IsWindows }
if (Test-Path variable:IsMacOS) { $isMac = [bool]$IsMacOS }

# DSH_HOME first (DSH exports it), else the documented per-OS location.
$Harness = $env:DSH_HOME
if (-not $Harness) {
    if ($isWin) {
        $Harness = Join-Path $env:APPDATA 'dsh-desktop/harness'
    } elseif ($isMac) {
        $Harness = Join-Path $HOME 'Library/Application Support/dsh-desktop/harness'
    } else {
        $cfg = $env:XDG_CONFIG_HOME
        if (-not $cfg) { $cfg = Join-Path $HOME '.config' }
        $Harness = Join-Path $cfg 'dsh-desktop/harness'
    }
}
$Profile = Join-Path $Harness 'profiles/web'

# install.mjs resolves the desktop app root on its own (DSH_APP_ROOT -> registry-free
# candidates -> drive sweep). Nothing here needs a literal path; we only warn early.
if (-not $env:DSH_APP_ROOT) {
    Write-Host 'note    : DSH_APP_ROOT is unset -- install.mjs will resolve the DSH Desktop app root itself'
}

if (-not (Test-Path $Profile)) { throw "web profile not found: $Profile" }

# ---- node: the PATH first, else the runtime DSH Desktop ships ----
# The plugin's promise is "you do not have to install Node yourself", so an
# install has to work on a machine that only has DSH. On Windows a bare `node`
# resolves through the app's own bin directory (DSH puts a shim there); this
# covers the case where that shim is missing, DSH is portable, or the shell was
# started before DSH wrote the shim.
function Resolve-Node {
    $onPath = Get-Command node -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    $candidates = @()
    if ($env:DSH_APP_ROOT) {
        $candidates += (Join-Path $env:DSH_APP_ROOT 'node_modules/node/bin/node.exe')
        $candidates += (Join-Path $env:DSH_APP_ROOT 'node_modules/node/bin/node')
    }
    $binDir = Join-Path $Harness '.desktop-bin'
    $candidates += (Join-Path $binDir 'node.exe')
    $candidates += (Join-Path $binDir 'node.cmd')
    $candidates += (Join-Path $binDir 'node')
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $candidate }
    }
    return 'node'
}
$NodeExe = Resolve-Node
Write-Host "node    : $NodeExe"

# ---- gate: run a native command without its stderr aborting the script ----
# PowerShell 5.1 turns a native command's stderr into a terminating error when
# $ErrorActionPreference is Stop, so a warning would abort the deploy on
# success. Relax it across the call and read the real exit code.
function Invoke-NodeGate {
    param([string]$Label, [string[]]$NodeArgs, [string]$FailMessage)
    Write-Host "gate    : $Label"
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $NodeExe @NodeArgs
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { throw $FailMessage }
}

# The client bundle must contain zero backticks. Run this FIRST: it can rewrite
# the file, so doing it after the deploy would mean the bundle that ships is not
# the bundle that was checked. The host half may keep its template
# literals -- it is a plain ESM module loaded by Node and is never spliced into
# a CSS template string, which is the failure the rule guards against.
# strip-backticks.mjs refuses to edit a file where a backtick sits in live code,
# so this both checks and (for the client) repairs.
Invoke-NodeGate -Label 'backtick check on lib\client.js' `
    -NodeArgs @((Join-Path $Here 'strip-backticks.mjs'), (Join-Path $Here 'lib\client.js')) `
    -FailMessage 'client bundle backtick check FAILED'
Write-Host 'gate    : backtick check passed'

# The UI harness that used to run here (React 18 + jsdom, driving the composer
# through the real __ModuleLoader__ contract) is a development-time tool and is
# not part of this distribution -- it hard-codes the author's own workspace, so
# shipping it would be worse than useless. The gate that ran it is gone with it:
# a missing file must not be able to stop an install.
#
# What remains is checkable here and now: the backtick gate above, install.mjs's
# own verification of the shipped bytes against the source tree, and the import
# smoke test below.

# ---- install: registry first, then DSH's own projector ----------------
Write-Host ''
Invoke-NodeGate -Label 'running install.mjs (registry + official projector)' `
    -NodeArgs @((Join-Path $Here 'install.mjs')) `
    -FailMessage 'install.mjs FAILED -- the profile was NOT updated'
Write-Host ''

# ---- smoke-test the Host half from the profile ------------------------
Push-Location $Profile
try {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $NodeExe -e "import('$Name').then(m=>console.log('host half OK:',Object.keys(m).join(','))).catch(e=>{console.error('host half FAIL:',e.message);process.exit(1)})"
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { throw 'host half failed to import from the profile' }
} finally {
    Pop-Location
}

# ---- optional: the browser extension ----------------------------------
# Everything except the Tabs row works without it, so the prompt defaults to
# No. Read-Host throws under -NonInteractive and returns empty on piped input;
# both are caught, so an unattended install never blocks here.
$ExtensionScript = Join-Path $Here 'install-extension.ps1'
if (Test-Path $ExtensionScript) {
    Write-Host ''
    Write-Host 'Optional: the browser extension (DSH Tab Bridge)' -ForegroundColor Cyan
    Write-Host '  The Tabs row can only list your real browser tabs when this extension'
    Write-Host '  is loaded. Every other row works without it.'
    $reply = ''
    try { $reply = Read-Host 'Install the browser extension now? [y/N]' } catch { $reply = '' }
    if ($reply -match '^(y|yes)$') {
        & $ExtensionScript
    } else {
        Write-Host '  Skipped. Run install-extension.ps1 whenever you want it.'
    }
}

Write-Host ''
Write-Host 'DONE. Restart DSH to load the plugin.' -ForegroundColor Green
Write-Host ''
Write-Host 'Rollback (no restart needed until you are ready):'
Write-Host "  1. restore the authoritative pointer:"
Write-Host "       Copy-Item `"$(Join-Path $Harness 'profiles\.generations\desired.json.bak-before-composer-launcher')`" `"$(Join-Path $Harness 'profiles\.generations\desired.json')`" -Force"
Write-Host "  2. re-project so the profile drops the plugin again: run this script again"
Write-Host "     (it locates the official projector under the resolved DSH app root; no literal path)."
Write-Host "  3. restart DSH."
