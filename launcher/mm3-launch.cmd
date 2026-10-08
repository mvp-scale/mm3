@echo off
rem mm3-launch.cmd: the Windows entry of the one command the Claude Code plugin runs (why it exists: launcher/README.md).
rem .claude-plugin/plugin.json names "${CLAUDE_PLUGIN_ROOT}/launcher/mm3-launch" with no extension. Claude Code on Windows starts that
rem through cmd, and cmd adds the extensions in PATHEXT, so it runs THIS file (the same way npm's node_modules/.bin shims run);
rem macOS and Linux run the POSIX shell file of that name. Nothing here needs sh, Git, or PowerShell when Node is usable.
rem   normal case : Node 22.13+ is present and MM3 starts on it, so it runs: node bin\mm3.mjs mcp   (nothing is downloaded, nothing is printed)
rem   fallback    : Node missing, too old, or MM3 will not start on it, so launcher\mm3-launch.ps1 does the fetch, the sha256 check, the install
rem                 and runs the self-contained MM3 (it prints why on stderr)
rem stdout belongs to the MCP protocol: every message goes to stderr. Only the MCP server starts here (mode mcp); the plugin's hooks
rem run through Git Bash, which runs the POSIX file.
rem This file must keep CRLF line endings (.gitattributes), ASCII only, and no rem line may hold the characters that cmd treats as operators.
setlocal EnableExtensions
set "MIN_NODE=22.13"
rem The one place this file reads the Node floor; test/unit/launcher.test.ts fails if it differs from src/util/node-version.ts
set "HERE=%~dp0"
if not exist "%HERE%mm3-launch.ps1" if defined CLAUDE_PLUGIN_ROOT set "HERE=%CLAUDE_PLUGIN_ROOT%\launcher\"
set "MODE=%~1"
if not defined MODE set "MODE=mcp"
if /i not "%MODE%"=="mcp" goto :badmode

set "NODEV="
set "NODE_NUM="
for /f "usebackq delims=" %%v in (`node --version 2^>nul`) do if not defined NODEV set "NODEV=%%v"
if not defined NODEV set "WHY=Node.js is not installed" & goto :fallback
set "NV=%NODEV:~1%"
for /f "tokens=1,2 delims=." %%a in ("%NV%") do set /a "NODE_NUM=%%a*1000+%%b" 2>nul
if not defined NODE_NUM set "WHY=could not read the Node.js version (%NODEV%)" & goto :fallback
for /f "tokens=1,2 delims=." %%a in ("%MIN_NODE%") do set /a "MIN_NUM=%%a*1000+%%b"
if %NODE_NUM% LSS %MIN_NUM% set "WHY=Node.js %NODEV% is older than the %MIN_NODE% that MM3 needs" & goto :fallback

call node "%HERE%..\bin\mm3.mjs" --version >nul 2>&1
if errorlevel 1 set "WHY=MM3 would not start on Node.js %NODEV%" & goto :fallback
call node "%HERE%..\bin\mm3.mjs" mcp
exit /b %ERRORLEVEL%

:fallback
set "PSEXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%PSEXE%" goto :runps
set "PSEXE="
for /f "delims=" %%p in ('where powershell 2^>nul') do if not defined PSEXE set "PSEXE=%%p"
for /f "delims=" %%p in ('where pwsh 2^>nul') do if not defined PSEXE set "PSEXE=%%p"
if not defined PSEXE goto :nops
:runps
"%PSEXE%" -NoProfile -ExecutionPolicy Bypass -File "%HERE%mm3-launch.ps1" mcp "%WHY%"
exit /b %ERRORLEVEL%

:nops
>&2 echo mm3: x %WHY%, and Windows PowerShell was not found. Install Node.js %MIN_NODE% or newer from https://nodejs.org, then restart Claude Code.
exit /b 1

:badmode
>&2 echo mm3: x unknown mode "%MODE%": this Windows entry starts the MCP server only (the hooks run through Git Bash).
exit /b 1
