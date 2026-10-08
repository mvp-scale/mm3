# MM3 standalone smoke test (Windows PowerShell). Usage: powershell -ExecutionPolicy Bypass -File scripts\smoke-standalone.ps1 -Bin C:\path\mm3.exe
# Runs the one self-contained file in a throwaway folder with PATH cut down to System32 (so no Node and no git are
# visible to it) and the offline sample provider (no key, no spend): the same checks as scripts/smoke-standalone.sh.
# CI runs it on a real Windows runner (.github/workflows/standalone.yml); the owner can run it on a clean machine.
param([Parameter(Mandatory=$true)][string]$Bin)
$Bin = (Resolve-Path $Bin).Path
$W = Join-Path ([IO.Path]::GetTempPath()) ("mm3-smoke-" + [guid]::NewGuid().ToString("N").Substring(0,8))
New-Item -ItemType Directory -Path $W, "$W\src", "$W\.mm3" | Out-Null
"export function f(a: string) {`n  return a.trim();`n}`n" | Set-Content "$W\src\a.ts"
@'
mak:
  goal: This helper is safe to merge
  depth: quick
  where: [src/a.ts]
  ask:
    concerns:
      input:
        pass: no
        1: Does `f` read anything other than its argument?
        2: Could `f` throw on any string input?
        3: Does `f` return a value other than the trimmed string?
      effects:
        pass: no
        4: Does `f` write to a file or the network?
        5: Does `f` change its argument or a shared value?
        6: Does `f` log the argument?
      reach:
        pass: no
        7: Is `f` exported to callers outside this file?
        8: Does `f` depend on a global or environment variable?
        9: Does `f` call another function that can fail?
    decisions:
      severity:
        pass: [none, low]
        10:
          scale: How severe is the worst issue found?
          levels: [none, low, medium, high, critical]
      route:
        pass: [ship]
        11:
          choice: Where should this go?
          options: [ship, fix, block]
'@ | Set-Content "$W\req.yaml"
Set-Location $W; $env:HOME = $W; $env:USERPROFILE = $W
$nodeOnPath = (Get-Command node -ErrorAction SilentlyContinue); $env:PATH = "$env:SystemRoot\System32"  # hide Node (and git) from the file for every call below
 Write-Host ("file: {0} ({1:N0} MB)  folder: {2}  node on your normal PATH: {3} (hidden from every call below)" -f $Bin, ((Get-Item $Bin).Length/1MB), $W, $(if ($nodeOnPath) { $nodeOnPath.Source } else { "none" }))
$pass = 0; $fail = 0
function Check($name, $want, [string[]]$args2) {
  $sw = [Diagnostics.Stopwatch]::StartNew(); $out = (& $Bin @args2 2>&1 | Out-String); $rc = $LASTEXITCODE; $sw.Stop()
  if ($rc -eq 0 -and $out -match [regex]::Escape($want)) { Write-Host ("PASS  {0}ms  {1}" -f $sw.ElapsedMilliseconds, $name); $script:pass++ }
  else { Write-Host ("FAIL  {0} (rc={1})" -f $name, $rc); ($out -split "`n" | Select-Object -First 3) | ForEach-Object { Write-Host "        $_" }; $script:fail++ } }
Check "help prints" "MM3 turns" @("help")
Check "doctor" "doctor:" @("doctor")
Check "class dry run" "calls:" @("class","req.yaml","--dry-run")
Check "class real run (sample provider)" "MM3-0001" @("class","req.yaml")
Check "view a folder" "1 run" @("view","src")
Check "report hits" "report hits" @("report","hits")
Check "report patterns" "report patterns" @("report","patterns")
Check "outcome" "held" @("outcome","MM3-0001","held","--by","tester")
Check "report problems (SQLite graph)" "row" @("report","problems")
Check "report graph (SQLite graph)" "edges" @("report","graph","place:src/a.ts")
$init = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}'
$mcp = ($init | & $Bin mcp 2>&1 | Out-String)
if ($mcp -match '"serverInfo"') { Write-Host "PASS         MCP initialize over stdio"; $pass++ } else { Write-Host "FAIL  MCP initialize"; $fail++ }
Check "template class (embedded)" "mak:" @("template","class")
Write-Host ""; Write-Host "result: $pass passed, $fail failed"; if ($fail -ne 0) { exit 1 }
