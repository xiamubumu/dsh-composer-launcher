# Install the DSH Tab Bridge browser extension (part of dsh-composer-launcher).
#
# Packaged extensions cannot be side-loaded silently. Chromium refuses it by
# design -- there is no supported silent path on any platform -- and Firefox
# only allows a temporary load from about:debugging. So this script does
# everything that CAN be automated:
#   * copies the extension to a stable path outside the workspace, so moving or
#     deleting the source folder does not break the loaded extension;
#   * detects which browsers are ACTUALLY installed on this machine;
#   * opens the right extensions page for the one the user most likely browses
#     with, with the folder path on the clipboard.
#
# The browser list comes from the same registry keys lib/index.js reads
# (HKLM/HKCU ...\Clients\StartMenuInternet), so the script and the plugin can
# never disagree about the directory or about which page to open. Nothing here
# hard-codes a drive letter or a user name: a per-user install lives under a
# profile path that may well be non-ASCII.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-extension.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-extension.ps1 -Browser firefox
#
# -Browser takes one of the ids printed under "Detected browsers:".

[CmdletBinding()]
param(
    [string] $Browser = ''
)

$ErrorActionPreference = 'Stop'

# ---- which browsers are really installed -----------------------------
# Order matters: a Chromium fork loves the word "chrome" (360, QQ), so those
# are tested before the plain chrome pattern -- otherwise a 360 install would
# be labelled Google Chrome and we would open a page the user cannot use.
$BrowserKinds = @(
    [pscustomobject]@{ Id = 'edge';    Name = 'Microsoft Edge'; Pattern = 'msedge|microsoft edge'; Url = 'edge://extensions';                     Chromium = $true }
    [pscustomobject]@{ Id = 'brave';   Name = 'Brave';          Pattern = 'brave';                  Url = 'brave://extensions';                    Chromium = $true }
    [pscustomobject]@{ Id = 'vivaldi'; Name = 'Vivaldi';        Pattern = 'vivaldi';                Url = 'vivaldi://extensions';                  Chromium = $true }
    [pscustomobject]@{ Id = 'opera';   Name = 'Opera';          Pattern = 'opera';                  Url = 'opera://extensions';                    Chromium = $true }
    [pscustomobject]@{ Id = 'arc';     Name = 'Arc';            Pattern = '\barc\b';                Url = 'arc://extensions';                      Chromium = $true }
    [pscustomobject]@{ Id = '360';     Name = '360 Extreme';    Pattern = '360|qihoo';              Url = 'chrome://extensions';                   Chromium = $true }
    [pscustomobject]@{ Id = 'qq';      Name = 'QQ Browser';     Pattern = 'qqbrowser|tencent';      Url = 'chrome://extensions';                   Chromium = $true }
    [pscustomobject]@{ Id = 'chrome';  Name = 'Google Chrome';  Pattern = 'chrome';                 Url = 'chrome://extensions';                   Chromium = $true }
    [pscustomobject]@{ Id = 'firefox'; Name = 'Firefox';        Pattern = 'firefox|mozilla';        Url = 'about:debugging#/runtime/this-firefox'; Chromium = $false }
)

# Windows builds its own "default browser" list from these, so they name
# exactly the browsers that are really registered -- machine-wide and per-user
# installs alike. The 32-bit view is separate on a 64-bit Windows.
$RegistryRoots = @(
    'HKLM:\SOFTWARE\Clients\StartMenuInternet'
    'HKLM:\SOFTWARE\WOW6432Node\Clients\StartMenuInternet'
    'HKCU:\SOFTWARE\Clients\StartMenuInternet'
)

$UserChoiceKey = 'HKCU:\SOFTWARE\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice'

# A shell\open\command value is a command LINE: the path is the quoted head
# when there is one, and anything after it is a switch such as
# "--single-argument %1" or "--autolaunch".
function Get-CommandPath {
    param([string] $Command)
    if ($Command -match '^\s*"([^"]+)"') { return $Matches[1] }
    return ($Command -split '\s+--')[0].Trim()
}

# The user's default browser first, so "just run the script" means "the browser
# you actually browse in" rather than "whichever one happened to be found first".
function Get-InstalledBrowsers {
    $found = @()
    $taken = @{}
    foreach ($root in $RegistryRoots) {
        if (-not (Test-Path -LiteralPath $root)) { continue }
        foreach ($key in @(Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue)) {
            $entry = Get-ItemProperty -Path "$($key.PSPath)\shell\open\command" -ErrorAction SilentlyContinue
            if ($null -eq $entry) { continue }
            $command = $entry.'(default)'
            if ([string]::IsNullOrWhiteSpace($command)) { continue }
            $exe = Get-CommandPath $command
            if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { continue }
            $kind = $BrowserKinds |
                Where-Object { $key.PSChildName -match $_.Pattern -or $exe -match $_.Pattern } |
                Select-Object -First 1
            if ($null -eq $kind) { continue }
            if ($taken.ContainsKey($kind.Id)) { continue }
            $taken[$kind.Id] = $true
            $found += [pscustomobject]@{
                Id = $kind.Id; Name = $kind.Name; Exe = $exe
                Url = $kind.Url; Chromium = $kind.Chromium
            }
        }
    }

    $progId = (Get-ItemProperty -Path $UserChoiceKey -Name 'ProgId' -ErrorAction SilentlyContinue).ProgId
    if (-not [string]::IsNullOrWhiteSpace($progId)) {
        for ($i = 1; $i -lt $found.Count; $i++) {
            if ($progId -match ($BrowserKinds | Where-Object { $_.Id -eq $found[$i].Id }).Pattern) {
                $default = $found[$i]
                $found = @($default) + @($found | Where-Object { $_.Id -ne $default.Id })
                break
            }
        }
    }
    return $found
}

$Here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$Source  = Join-Path $Here 'extension'
$Harness = Join-Path $env:APPDATA 'dsh-desktop\harness'
$Target  = Join-Path $Harness 'extensions\dsh-tab-bridge'

if (-not (Test-Path (Join-Path $Source 'manifest.json'))) {
    throw "extension source not found: $Source"
}

# ---- stage a stable copy ---------------------------------------------
New-Item -ItemType Directory -Force -Path $Target | Out-Null
Copy-Item (Join-Path $Source '*') $Target -Recurse -Force
Write-Host "staged  : $Target"
Write-Host "files   :"
Get-ChildItem $Target -File | ForEach-Object { Write-Host ("  {0}  ({1} bytes)" -f $_.Name, $_.Length) }

# ---- pick the browser ------------------------------------------------
$installed = @(Get-InstalledBrowsers)

if ($installed.Count -gt 0) {
    Write-Host ''
    Write-Host 'Detected browsers:' -ForegroundColor Cyan
    # NOT "$browser": PowerShell variable names are case-insensitive, and a
    # foreach loop runs in the enclosing scope -- naming the loop variable
    # after the $Browser parameter would overwrite it before it is ever read.
    foreach ($item in $installed) {
        Write-Host ("  {0,-8} {1}" -f $item.Id, $item.Name)
    }
}

$chosen = $null
if ($Browser -ne '') {
    $chosen = $installed | Where-Object { $_.Id -eq $Browser } | Select-Object -First 1
    if ($null -eq $chosen) {
        $ids = ($installed | ForEach-Object { $_.Id }) -join ', '
        if ($ids -eq '') { $ids = '(none installed)' }
        throw "-Browser '$Browser' is not installed here. Available: $ids"
    }
} elseif ($installed.Count -gt 0) {
    $chosen = $installed[0]
}

# ---- make the path easy to paste -------------------------------------
try {
    Set-Clipboard -Value $Target
    Write-Host ''
    Write-Host 'The extension folder path is now ON YOUR CLIPBOARD.' -ForegroundColor Green
} catch {
    Write-Host ''
    Write-Host 'Copy this path manually:' -ForegroundColor Yellow
    Write-Host $Target
}

Write-Host ''
if ($null -eq $chosen) {
    Write-Host 'No browser found, so do this once in the one you actually browse with:' -ForegroundColor Cyan
    Write-Host '  1. open its extensions page'
    Write-Host '  2. Chromium: [Developer mode] -> [Load unpacked] -> paste the path'
    Write-Host '     Firefox : about:debugging -> [Load Temporary Add-on] -> pick manifest.json'
} elseif ($chosen.Chromium) {
    Write-Host ("Now do this once, in {0}:" -f $chosen.Name) -ForegroundColor Cyan
    Write-Host ("  1. open  {0}" -f $chosen.Url)
    Write-Host '  2. turn ON  [Developer mode]  (top-right toggle; bottom-left in older builds)'
    Write-Host '  3. click  [Load unpacked]'
    Write-Host '  4. paste the path from your clipboard and confirm'
} else {
    Write-Host ("Now do this once, in {0}:" -f $chosen.Name) -ForegroundColor Cyan
    Write-Host ("  1. open  {0}" -f $chosen.Url)
    Write-Host '  2. click  [Load Temporary Add-on...]'
    Write-Host ("  3. pick  {0}" -f (Join-Path $Target 'manifest.json'))
    Write-Host '  NOTE: Firefox drops a temporary add-on when it restarts -- load it again'
    Write-Host '        after a restart, or the Tab Bridge group goes quiet.'
}

Write-Host ''
Write-Host 'Then restart DSH and open the "+" menu -- the Tab Bridge group will list'
Write-Host 'the tabs of THIS browser, with the logins you already have.'
Write-Host ''

if ($null -ne $chosen) {
    Write-Host ("Opening {0} ..." -f $chosen.Url) -ForegroundColor Cyan
    try {
        Start-Process -FilePath $chosen.Exe -ArgumentList $chosen.Url
    } catch {
        Write-Host ("Could not start {0} -- open {1} yourself." -f $chosen.Exe, $chosen.Url) -ForegroundColor Yellow
    }
}
