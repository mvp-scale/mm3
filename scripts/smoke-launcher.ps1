# MM3 plugin launcher check on Windows (PowerShell). Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\smoke-launcher.ps1 -Bin C:\path\mm3-<version>-win-x64.exe|win-arm64.exe -Case cmd-default|cmd-space|sh-visible|powershell
# CI runs it on a real Windows runner (.github/workflows/standalone.yml). It installs the repo's plugin into Claude Code with an isolated
# config and home, with NO Node on PATH, serves the built Windows file from 127.0.0.1 as the fake GitHub Release (the pin file is written
# for that file), and requires `claude mcp list` to show the MM3 server connected after one download, and a second start to download nothing.
# The MCP command is the launcher-form one (launcher/manifests/plugin.json, not yet the shipped plugin.json): the extensionless ${CLAUDE_PLUGIN_ROOT}/launcher/mm3-launch, which Claude Code starts through cmd and
# cmd resolves to launcher\mm3-launch.cmd (PATHEXT). The cases differ in which Git for Windows folders are on PATH and in the folder the plugin sits in:
#   cmd-default  the launcher-form plugin.json (launcher/manifests), PATH has only Git's cmd folder: what the Git for Windows installer sets by default (sh.exe does NOT
#                resolve). The machine most users have; it must pass before the plugin is switched to the launcher (informational in CI until then).
#   cmd-space    the same, in a folder whose name has a space (a user name with a space puts the plugin under such a path); informational
#   sh-visible   the same plugin.json, PATH also has Git's bin and usr\bin folders (sh.exe resolves): the .cmd must still be the one that runs
#   powershell   the other candidate: command `powershell -File launcher\mm3-launch.ps1 mcp`, PATH has neither; informational
# After the MCP check (every case but powershell) it also runs the hooks' own command through Git Bash, whose PATH lacks sh: "<plugin>/launcher/mm3-launch" hook
# and session-start must exit 0 and print nothing (the machine has no Node and a working installed mm3, so `hook` runs mm3 __hook on empty input).
# Needs: claude.exe (native installer: irm https://claude.ai/install.ps1 | iex), python on PATH to serve the files, Git for Windows installed.
param(
  [Parameter(Mandatory=$true)][string]$Bin,
  [Parameter(Mandatory=$true)][ValidateSet('cmd-default','cmd-space','sh-visible','powershell')][string]$Case
)
$ErrorActionPreference = 'Stop'
$Repo = (Get-Location).Path
$Bin  = (Resolve-Path $Bin).Path
$Pkg  = Get-Content (Join-Path $Repo 'package.json') -Raw | ConvertFrom-Json
$W    = Join-Path ([IO.Path]::GetTempPath()) ($(if ($Case -eq 'cmd-space') { 'mm3 launcher ' } else { 'mm3-launcher-' }) + [guid]::NewGuid().ToString('N').Substring(0,8))
$null = New-Item -ItemType Directory -Path $W, "$W\home", "$W\cfg", "$W\proj", "$W\rel"
function Fail($m) { Write-Host "x launcher[$Case]: $m"; Write-Host "::error::launcher[$Case]: $m"; exit 1 }

# claude.exe: the native installer puts it in %USERPROFILE%\.local\bin
$claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $claude) { $claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe' }
if (-not (Test-Path $claude)) { Fail 'claude.exe not found -> install Claude Code first (irm https://claude.ai/install.ps1 | iex)' }
$python = (Get-Command python -ErrorAction Stop).Source
$git = Split-Path -Parent (Split-Path -Parent (Get-Command git -ErrorAction Stop).Source)   # ...\Git (git.exe lives in ...\Git\cmd)
$bash = Join-Path $git 'bin\bash.exe'
if (-not (Test-Path $bash)) { Fail "Git for Windows has no bash.exe under $git\bin -> this check needs Git for Windows" }

# the plugin as the repo ships it (with the launcher-form manifests, below), plus a pin file for the built file, served from localhost
$plugin = Join-Path $W 'plugin'
$null = New-Item -ItemType Directory -Path $plugin
foreach ($d in '.claude-plugin','hooks','launcher','skills','bin') { Copy-Item -Recurse (Join-Path $Repo $d) (Join-Path $plugin $d) }
# the repo ships the node-form manifests while the launcher is dormant; the launcher is tested with its own (launcher\manifests), which is what the plugin gets at the switch
Copy-Item (Join-Path $Repo 'launcher\manifests\plugin.json') (Join-Path $plugin '.claude-plugin\plugin.json') -Force
Copy-Item (Join-Path $Repo 'launcher\manifests\hooks.json') (Join-Path $plugin 'hooks\hooks.json') -Force
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
Set-Content -Path (Join-Path $W 'empty.txt') -Value '' -NoNewline
$log = Join-Path $W 'server.log'
$srv = Start-Process -PassThru -WindowStyle Hidden -FilePath $python -ArgumentList @('-m','http.server',"$port",'--bind','127.0.0.1','--directory',('"' + (Join-Path $W 'rel') + '"')) -RedirectStandardError $log -RedirectStandardOutput (Join-Path $W 'server.out')
Start-Sleep -Seconds 2

# the environment Claude Code and the launcher run in: no Node, an isolated home and config
$sys = "$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
$extra = switch ($Case) { 'sh-visible' { "$git\bin;$git\usr\bin;$git\cmd" } 'cmd-default' { "$git\cmd" } 'cmd-space' { "$git\cmd" } default { '' } }
$env:PATH = (@((Split-Path -Parent $claude), $sys, $extra) | Where-Object { $_ }) -join ';'
$env:HOME = "$W\home"; $env:USERPROFILE = "$W\home"; $env:CLAUDE_CONFIG_DIR = "$W\cfg"
$env:MM3_TEST_RELEASE_URL = "http://127.0.0.1:$port"
$env:CLAUDE_CODE_DISABLE_AUTOUPDATE = '1'; $env:DISABLE_TELEMETRY = '1'; $env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
if (Get-Command node -ErrorAction SilentlyContinue) { Fail "node is still on PATH ($((Get-Command node).Source)); the check needs a machine without Node" }
$shOnPath = [bool](Get-Command sh -ErrorAction SilentlyContinue)
if ((@('cmd-default','cmd-space') -contains $Case) -and $shOnPath) { Fail "sh is on PATH ($((Get-Command sh).Source)); this case is about a machine where it is not" }
if ($Case -eq 'sh-visible' -and -not $shOnPath) { Fail 'sh is not on PATH; this case is about a machine where it is' }
Write-Host "case $Case : sh on PATH = $shOnPath ; node on PATH = False ; claude = $claude ; plugin in $W"

function Claude([string[]]$a) { Push-Location "$W\proj"; try { $o = & $claude @a 2>&1 | Out-String; return @{ out = $o; code = $LASTEXITCODE } } finally { Pop-Location } }
function Gets { if (Test-Path $log) { @(Select-String -Path $log -Pattern 'GET /' ).Count } else { 0 } }
try {
  $r = Claude @('plugin','marketplace','add',$plugin); if ($r.code -ne 0) { Fail "plugin marketplace add failed: $($r.out)" }
  $r = Claude @('plugin','install','mm3@mvp-scale');    if ($r.code -ne 0) { Fail "plugin install failed: $($r.out)" }
  $r = Claude @('--debug-file',"$W\debug1.log",'mcp','list'); Write-Host $r.out
  if ($r.out -notmatch 'mm3-launch' ) { Fail 'claude mcp list did not list the plugin server' }
  if ($Case -ne 'powershell' -and $r.out -match 'mm3-launch\.ps1') { Fail 'the launcher-form plugin.json names the .ps1 directly; it must name the extensionless launcher' }
  if ($r.out -match 'Failed to connect' -or $r.out -notmatch 'Connected') {
    if (Test-Path "$W\debug1.log") { Select-String -Path "$W\debug1.log" -Pattern 'Server stderr|spawn|ENOENT|not found|Connection failed' | Select-Object -First 15 | ForEach-Object { Write-Host "  debug: $($_.Line)" } }
    Fail "the MM3 server did not connect on the first start (sh on PATH = $shOnPath) -> see the lines above; command used: $(if ($Case -eq 'powershell') { 'powershell -File launcher/mm3-launch.ps1 mcp' } else { '<plugin>/launcher/mm3-launch mcp (cmd resolves it to mm3-launch.cmd)' })"
  }
  $first = Gets
  if ($first -lt 1) { Fail 'connected, but the fake release saw no download: the file was not fetched through the launcher' }
  $installed = Join-Path "$W\home" '.local\bin\mm3.exe'
  if (-not (Test-Path $installed)) { Fail "connected, but $installed is not there (init did not install it)" }
  $r = Claude @('mcp','list'); Write-Host $r.out
  if ($r.out -match 'Failed to connect' -or $r.out -notmatch 'Connected') { Fail 'the second start did not connect' }
  if ((Gets) -ne $first) { Fail "the second start downloaded again ($first -> $(Gets) requests)" }
  if ($Case -ne 'powershell') {
    # the hooks' own shell-form command, run the way Claude Code runs it on Windows: in Git Bash, with this PATH (no sh on it for cmd-default)
    $root = $plugin -replace '\\','/'
    foreach ($mode in 'hook','session-start') {
      $script = Join-Path $W "hook-$mode.sh"
      [IO.File]::WriteAllText($script, ("`"$root/launcher/mm3-launch`" $mode`n"), (New-Object Text.UTF8Encoding $false))
      $eo = Join-Path $W "hook-$mode.out"; $ee = Join-Path $W "hook-$mode.err"
      $p = Start-Process -Wait -PassThru -NoNewWindow -FilePath $bash -ArgumentList @('--noprofile','--norc',('"' + $script + '"')) -RedirectStandardInput (Join-Path $W 'empty.txt') -RedirectStandardOutput $eo -RedirectStandardError $ee
      $so = (Get-Content $eo -Raw -ErrorAction SilentlyContinue); $se = (Get-Content $ee -Raw -ErrorAction SilentlyContinue)
      Write-Host "hook [$mode]: exit $($p.ExitCode), stdout [$so], stderr [$se]"
      if ($p.ExitCode -ne 0 -or $so -or $se) { Fail "the hook command ($mode) through Git Bash exited $($p.ExitCode) or printed something (stdout [$so] stderr [$se])" }
    }
  }
  Write-Host "OK launcher[$Case]: connected after one verified download ($first request), second start downloaded nothing$(if ($Case -ne 'powershell') { '; the hooks ran through Git Bash silently' })"
} finally {
  Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
}
