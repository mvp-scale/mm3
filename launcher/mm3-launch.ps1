# mm3-launch.ps1: the Windows twin of mm3-launch (POSIX sh); why it exists: launcher/README.md.
# Same steps, same messages, same checksums.json:
#   Node 22.13+ present  -> run node bin\mm3.mjs mcp
#   otherwise            -> fetch the win-x64 or win-arm64 file named in checksums.json (by PROCESSOR_ARCHITECTURE), verify its sha256, install it, run `init --no-claude --no-key --yes`, run `mcp`
# Messages go to stderr; stdout is the MCP protocol. Not done here (the sh launcher has them): the slow-install stub that answers
# Claude Code's 30 s handshake while a slow download finishes, and the session-start message.
# Called as `powershell -File mm3-launch.ps1 <mode> [why]` either by the sh launcher (Git Bash, which has already found that Node
# does not work and says why) or directly by plugin.json on a machine where that is the chosen command. With no `why` it checks Node itself.
param([string]$Mode = 'mcp', [string]$Why = '')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'            # Windows PowerShell 5.1 downloads are very slow with the progress bar on
function Say($m)  { [Console]::Error.WriteLine("mm3: $m") }
function Fail($m) { [Console]::Error.WriteLine("mm3: x $m"); exit 1 }

$MinNode   = '22.13'                                 # the one place this launcher reads the Node floor; test/unit/launcher.test.ts keeps it equal to src/util/node-version.ts
$Here      = $PSScriptRoot
$Root      = Split-Path -Parent $Here
$Data      = if ($env:CLAUDE_PLUGIN_DATA) { $env:CLAUDE_PLUGIN_DATA } else { Join-Path $env:LOCALAPPDATA 'mm3-plugin' }
$BinDir    = Join-Path $HOME '.local\bin'
$Installed = Join-Path $BinDir 'mm3.exe'
$Min       = [version]$MinNode

function Get-NodeProblem([bool]$Probe) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { return 'Node.js is not installed' }
  try { $v = [version]((& node --version) -replace '^v','') } catch { return 'Node.js is installed but does not run' }
  if ($v.Major -lt $Min.Major -or ($v.Major -eq $Min.Major -and $v.Minor -lt $Min.Minor)) { return "Node.js v$v is older than the $MinNode that MM3 needs" }
  if ($Probe) {
    & node (Join-Path $Root 'bin\mm3.mjs') --version *> $null
    if ($LASTEXITCODE -ne 0) { return "MM3 would not start on Node.js v$v" }
  }
  return $null
}
function Test-Installed { (Test-Path $Installed) -and ((& $Installed --version 2>$null) -and $LASTEXITCODE -eq 0) }

if ($Mode -eq 'hook') {
  if (-not (Get-NodeProblem $false)) { & node (Join-Path $Root 'hooks\nudge.mjs'); exit $LASTEXITCODE }
  if (Test-Installed) { & $Installed __hook; exit $LASTEXITCODE }
  exit 0
}

$problem = if ($Why) { $Why } else { Get-NodeProblem $true }
if (-not $problem) { & node (Join-Path $Root 'bin\mm3.mjs') mcp; exit $LASTEXITCODE }
Say "$problem. Using the self-contained MM3 build instead."

if (-not (Test-Installed)) {
  $sums  = Get-Content (Join-Path $Here 'checksums.json') -Raw | ConvertFrom-Json
  # the machine's own CPU, not the process's: an x64 PowerShell on Windows 11 arm64 reports AMD64 in PROCESSOR_ARCHITECTURE, but the arm64 file is the right one there.
  # OSArchitecture (X64, Arm64) is the OS; PROCESSOR_ARCHITEW6432 / PROCESSOR_ARCHITECTURE (AMD64, ARM64) is the fallback when that API is missing.
  $arch  = try { [string][System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture } catch { if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE } }
  $u     = $arch.ToUpper()
  $key   = if ($u -eq 'AMD64' -or $u -eq 'X64') { 'win-x64' } elseif ($u -eq 'ARM64') { 'win-arm64' } else { "win-$($arch.ToLower())" }
  $asset = $sums.assets.$key
  if (-not $asset) { Fail "no self-contained MM3 build for $key ($problem) -> install Node.js $MinNode or newer from https://nodejs.org, then restart Claude Code" }
  $base  = if ($env:MM3_TEST_RELEASE_URL) { $env:MM3_TEST_RELEASE_URL } else { $sums.base }
  New-Item -ItemType Directory -Force -Path $Data | Out-Null
  Get-ChildItem -Path $Data -Filter "$($asset.file).part.*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  $part = Join-Path $Data "$($asset.file).part.$PID"
  Say "downloading the self-contained MM3 $($sums.version) for $key (about $([math]::Round($asset.bytes/1MB)) MB) from $base"
  try {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue                      # ships with Windows 10 1803+
    if ($curl) { & curl.exe -fsSL --connect-timeout 15 --speed-limit 1000 --speed-time 30 -o $part "$base/$($asset.file)"; if ($LASTEXITCODE -ne 0) { throw "curl exit $LASTEXITCODE" } }
    else       { Invoke-WebRequest -UseBasicParsing -Uri "$base/$($asset.file)" -OutFile $part }
  } catch { Remove-Item -Force $part -ErrorAction SilentlyContinue; Fail "could not download $base/$($asset.file) -> check your internet connection (or proxy) and restart Claude Code; nothing was installed. Or install Node.js $MinNode+ and restart" }
  $got = (Get-FileHash -Algorithm SHA256 $part).Hash.ToLower()
  if ($got -ne $asset.sha256.ToLower()) { Remove-Item -Force $part; Fail "the download does not match the checksum pinned in this plugin (expected $($asset.sha256), got $got) -> NOT installed. Do not use it; reinstall the plugin or report this at https://github.com/mvp-scale/mm3/issues" }
  Say 'checked: sha256 matches the value pinned in the plugin'
  $staged = Join-Path $Data $asset.file
  Move-Item -Force $part $staged
  Push-Location $HOME                                                              # never touch a project folder
  & $staged init --no-claude --no-key --yes *> (Join-Path $Data 'init.log')
  $initExit = $LASTEXITCODE
  Pop-Location
  if ($initExit -eq 0) { Say "installed: $Installed (set up by 'mm3 init --no-key', details in $Data\init.log)"; Remove-Item -Force $staged }
  else { Say "warning: 'mm3 init' reported a problem (see $Data\init.log); running from $staged for this session"; $Installed = $staged }
  Say "what I did: used the self-contained MM3 because $problem."
  Say "next: MM3 runs now without a key (sample answers). For real answers add your TypeSafe key: in Claude Code run /plugin, choose MM3, Configure; or run 'mm3 doctor' in a terminal."
}
& $Installed mcp
exit $LASTEXITCODE
