# MM3 plugin launcher check on Windows (PowerShell). Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\smoke-launcher.ps1 -Bin C:\path\mm3-<version>-win-x64.exe|win-arm64.exe -Case sh-visible|sh-default|powershell
# CI runs it on a real Windows runner (.github/workflows/standalone.yml). It installs the repo's plugin into Claude Code with an isolated
# config and home, with NO Node on PATH, serves the built Windows file from 127.0.0.1 as the fake GitHub Release (the pin file is written
# for that file), and requires `claude mcp list` to show the MM3 server connected after one download, and a second start to download nothing.
# The three cases differ only in what the plugin's MCP command is and which Git for Windows folders are on PATH:
#   sh-visible  the committed plugin.json (command `sh`), PATH has Git's bin and usr\bin folders (sh.exe resolves)
#   sh-default  the committed plugin.json, PATH has only Git's cmd folder: what the Git for Windows installer sets by default (sh.exe does NOT resolve)
#   powershell  the other candidate: command `powershell -File launcher\mm3-launch.ps1 mcp`, PATH has neither
# Needs: claude.exe (native installer: irm https://claude.ai/install.ps1 | iex), python on PATH to serve the files, Git for Windows installed.
param(
  [Parameter(Mandatory=$true)][string]$Bin,
  [Parameter(Mandatory=$true)][ValidateSet('sh-visible','sh-default','powershell')][string]$Case
)
$ErrorActionPreference = 'Stop'
$Repo = (Get-Location).Path
$Bin  = (Resolve-Path $Bin).Path
$Pkg  = Get-Content (Join-Path $Repo 'package.json') -Raw | ConvertFrom-Json
$W    = Join-Path ([IO.Path]::GetTempPath()) ("mm3-launcher-" + [guid]::NewGuid().ToString('N').Substring(0,8))
$null = New-Item -ItemType Directory -Path $W, "$W\home", "$W\cfg", "$W\proj", "$W\rel"
function Fail($m) { Write-Host "x launcher[$Case]: $m"; Write-Host "::error::launcher[$Case]: $m"; exit 1 }

# claude.exe: the native installer puts it in %USERPROFILE%\.local\bin
$claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $claude) { $claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe' }
if (-not (Test-Path $claude)) { Fail 'claude.exe not found -> install Claude Code first (irm https://claude.ai/install.ps1 | iex)' }
$python = (Get-Command python -ErrorAction Stop).Source
$git = Split-Path -Parent (Split-Path -Parent (Get-Command git -ErrorAction Stop).Source)   # ...\Git (git.exe lives in ...\Git\cmd)
if (-not (Test-Path (Join-Path $git 'bin\sh.exe'))) { Fail "Git for Windows has no sh.exe under $git\bin -> this check needs Git for Windows" }

# the plugin exactly as the repo ships it, plus a pin file for the built file, served from localhost
$plugin = Join-Path $W 'plugin'
$null = New-Item -ItemType Directory -Path $plugin
foreach ($d in '.claude-plugin','hooks','launcher','skills','bin') { Copy-Item -Recurse (Join-Path $Repo $d) (Join-Path $plugin $d) }
$asset = Split-Path -Leaf $Bin
$key   = [regex]::Match($asset, '-(win-(?:x64|arm64))\.exe$').Groups[1].Value   # the pin names the file under the key the launcher looks up on this CPU
if (-not $key) { Fail "cannot tell which build $asset is (expected mm3-<version>-win-x64.exe or -win-arm64.exe)" }
Copy-Item $Bin (Join-Path $W "rel\$asset")
$port = 8700 + (Get-Random -Maximum 200)
$pin = [ordered]@{
  version = $Pkg.version
  base    = "http://127.0.0.1:$port"
  assets  = [ordered]@{ $key = [ordered]@{ file = $asset; sha256 = (Get-FileHash -Algorithm SHA256 $Bin).Hash.ToLower(); bytes = (Get-Item $Bin).Length } }
}
$pin | ConvertTo-Json -Depth 5 | Set-Content -Encoding ascii (Join-Path $plugin 'launcher\checksums.json')
if ($Case -eq 'powershell') {
  $pj = Join-Path $plugin '.claude-plugin\plugin.json'
  $m = Get-Content $pj -Raw | ConvertFrom-Json
  $m.mcpServers.mm3.command = 'powershell'
  $m.mcpServers.mm3.args = @('-NoProfile','-ExecutionPolicy','Bypass','-File','${CLAUDE_PLUGIN_ROOT}/launcher/mm3-launch.ps1','mcp')
  $m | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 $pj
}
$log = Join-Path $W 'server.log'
$srv = Start-Process -PassThru -WindowStyle Hidden -FilePath $python -ArgumentList @('-m','http.server',"$port",'--bind','127.0.0.1','--directory',(Join-Path $W 'rel')) -RedirectStandardError $log -RedirectStandardOutput (Join-Path $W 'server.out')
Start-Sleep -Seconds 2

# the environment Claude Code and the launcher run in: no Node, an isolated home and config
$sys = "$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
$extra = switch ($Case) { 'sh-visible' { "$git\bin;$git\usr\bin;$git\cmd" } 'sh-default' { "$git\cmd" } default { '' } }
$env:PATH = (@((Split-Path -Parent $claude), $sys, $extra) | Where-Object { $_ }) -join ';'
$env:HOME = "$W\home"; $env:USERPROFILE = "$W\home"; $env:CLAUDE_CONFIG_DIR = "$W\cfg"
$env:MM3_TEST_RELEASE_URL = "http://127.0.0.1:$port"
$env:CLAUDE_CODE_DISABLE_AUTOUPDATE = '1'; $env:DISABLE_TELEMETRY = '1'; $env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
if (Get-Command node -ErrorAction SilentlyContinue) { Fail "node is still on PATH ($((Get-Command node).Source)); the check needs a machine without Node" }
$shOnPath = [bool](Get-Command sh -ErrorAction SilentlyContinue)
Write-Host "case $Case : sh on PATH = $shOnPath ; node on PATH = False ; claude = $claude"

function Claude([string[]]$a) { Push-Location "$W\proj"; try { $o = & $claude @a 2>&1 | Out-String; return @{ out = $o; code = $LASTEXITCODE } } finally { Pop-Location } }
function Gets { if (Test-Path $log) { @(Select-String -Path $log -Pattern 'GET /' ).Count } else { 0 } }
try {
  $r = Claude @('plugin','marketplace','add',$plugin); if ($r.code -ne 0) { Fail "plugin marketplace add failed: $($r.out)" }
  $r = Claude @('plugin','install','mm3@mvp-scale');    if ($r.code -ne 0) { Fail "plugin install failed: $($r.out)" }
  $r = Claude @('--debug-file',"$W\debug1.log",'mcp','list'); Write-Host $r.out
  if ($r.out -notmatch 'mm3-launch' ) { Fail 'claude mcp list did not list the plugin server' }
  if ($r.out -match 'Failed to connect' -or $r.out -notmatch 'Connected') {
    if (Test-Path "$W\debug1.log") { Select-String -Path "$W\debug1.log" -Pattern 'Server stderr|spawn|ENOENT|not found|Connection failed' | Select-Object -First 15 | ForEach-Object { Write-Host "  debug: $($_.Line)" } }
    Fail "the MM3 server did not connect on the first start (sh on PATH = $shOnPath) -> see the lines above; command used: $(if ($Case -eq 'powershell') { 'powershell -File launcher/mm3-launch.ps1 mcp' } else { 'sh launcher/mm3-launch mcp' })"
  }
  $first = Gets
  if ($first -lt 1) { Fail 'connected, but the fake release saw no download: the file was not fetched through the launcher' }
  $installed = Join-Path "$W\home" '.local\bin\mm3.exe'
  if (-not (Test-Path $installed)) { Fail "connected, but $installed is not there (init did not install it)" }
  $r = Claude @('mcp','list'); Write-Host $r.out
  if ($r.out -match 'Failed to connect' -or $r.out -notmatch 'Connected') { Fail 'the second start did not connect' }
  if ((Gets) -ne $first) { Fail "the second start downloaded again ($first -> $(Gets) requests)" }
  Write-Host "OK launcher[$Case]: connected after one verified download ($first request), second start downloaded nothing"
} finally {
  Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
}
