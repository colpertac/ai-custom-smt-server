#Requires -Version 5.1
<#
.SYNOPSIS
  SMT all-in-one bootstrap (Docker Desktop already installed).

.EXAMPLE
  .\install.ps1 -Ip 203.0.113.10
  .\install.ps1 -Ip 203.0.113.10 -Domain play.example.com
  .\install.ps1 -Ip 127.0.0.1 -Prefix C:\smt -NonInteractive
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string] $Ip = "",

  [Parameter(Mandatory = $false)]
  [string] $Domain = "",

  [Parameter(Mandatory = $false)]
  [string] $Prefix = "",

  [Parameter(Mandatory = $false)]
  [string] $Dir = "",

  [Parameter(Mandatory = $false)]
  [int] $WebsitePort = 3000,

  [switch] $NonInteractive
)

$ErrorActionPreference = "Stop"
$DockerInstallUrl = "https://docs.docker.com/desktop/setup/install/windows-install/"
$DefaultPrefix = "C:\smt"
$ScriptRoot = $PSScriptRoot
$SourceOpsDir = Join-Path (Split-Path $ScriptRoot -Parent) "ops"

function Die([string] $Message) {
  Write-Error "error: $Message"
  exit 1
}

function Die-Writable([string] $Prefix) {
  Write-Host "error: cannot write to $Prefix" -ForegroundColor Red
  Write-Host ""
  Write-Host "On Windows, either:"
  Write-Host "  * Run PowerShell as Administrator, then re-run this script"
  Write-Host "  * Or install under your profile (no admin):"
  Write-Host "      .\install.ps1 -Ip ... -Prefix `"$env:USERPROFILE\smt`""
  exit 1
}

function Test-WritablePrefix([string] $Prefix) {
  if (Test-Path $Prefix -PathType Leaf) {
    Die "$Prefix exists but is not a directory"
  }
  $probe = Join-Path $Prefix ".smt-install-write-test"
  try {
    if (-not (Test-Path $Prefix)) {
      $parent = Split-Path $Prefix -Parent
      if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
      }
    }
    New-Item -ItemType Directory -Force -Path $probe | Out-Null
    Remove-Item -Force -Recurse $probe
  } catch {
    Die-Writable $Prefix
  }
}

function Copy-InstallTree([string] $DestPrefix) {
  $destDeploy = Join-Path $DestPrefix "deploy"
  $destOps = Join-Path $DestPrefix "ops"
  Write-Host "Installing to $DestPrefix ..."
  New-Item -ItemType Directory -Force -Path $DestPrefix | Out-Null

  $excludeDeploy = @(
    (Join-Path $ScriptRoot "data"),
    (Join-Path $ScriptRoot "updater"),
    (Join-Path $ScriptRoot "website-data"),
    (Join-Path $ScriptRoot "backups"),
    (Join-Path $ScriptRoot "ops-tools")
  )
  robocopy $ScriptRoot $destDeploy /E /NFL /NDL /NJH /NJS /nc /ns /np `
    /XD $excludeDeploy /XF .env 2>$null | Out-Null
  if ($LASTEXITCODE -ge 8) {
    Die "Failed to copy deploy/ to $destDeploy (robocopy exit $LASTEXITCODE)"
  }

  robocopy $SourceOpsDir $destOps /E /NFL /NDL /NJH /NJS /nc /ns /np `
    /XF audit.log 2>$null | Out-Null
  if ($LASTEXITCODE -ge 8) {
    Die "Failed to copy ops/ to $destOps (robocopy exit $LASTEXITCODE)"
  }
  Write-Host "Copied deploy/ and ops/ -> $DestPrefix"
}

# Docker bind-mounts these into Linux. Git for Windows (core.autocrlf) often
# checks out *.sh as CRLF, which breaks shebangs (env: 'bash\r').
function Convert-UnixShellScripts([string] $Root) {
  if (-not (Test-Path $Root)) { return }
  $utf8 = New-Object System.Text.UTF8Encoding $false
  $converted = 0
  Get-ChildItem -Path $Root -Filter *.sh -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
    $raw = [System.IO.File]::ReadAllText($_.FullName)
    $unix = $raw -replace "`r`n", "`n" -replace "`r", "`n"
    if ($unix -ne $raw) {
      [System.IO.File]::WriteAllText($_.FullName, $unix, $utf8)
      $converted++
    }
  }
  if ($converted -gt 0) {
    Write-Host "Normalized Unix line endings on $converted .sh file(s) under $Root"
  }
}

function Resolve-InstallPaths {
  if (-not (Test-Path (Join-Path $ScriptRoot "docker-compose.yml"))) {
    Die "docker-compose.yml not found in $ScriptRoot"
  }
  if (-not (Test-Path $SourceOpsDir)) {
    Die "ops/ not found at $SourceOpsDir - copy deploy/ and ops/ together"
  }

  if ($Dir) {
    return (Resolve-Path $Dir).Path
  }

  $installPrefix = $Prefix
  if (-not $installPrefix -and -not $NonInteractive) {
    $installPrefix = Read-Host "Install to [$DefaultPrefix]"
    if (-not $installPrefix) { $installPrefix = $DefaultPrefix }
  } elseif (-not $installPrefix) {
    $installPrefix = $DefaultPrefix
  }

  $installPrefix = [System.IO.Path]::GetFullPath($installPrefix)
  $deployDir = Join-Path $installPrefix "deploy"

  $scriptNorm = [System.IO.Path]::GetFullPath($ScriptRoot).TrimEnd('\')
  $deployNorm = [System.IO.Path]::GetFullPath($deployDir).TrimEnd('\')
  if ($scriptNorm -eq $deployNorm) {
    Write-Host "Using existing install at $deployDir"
    return $deployDir
  }

  Test-WritablePrefix $installPrefix
  Copy-InstallTree $installPrefix
  return $deployDir
}

if (-not $Ip) {
  if ($NonInteractive) {
    Die "-Ip is required in -NonInteractive mode"
  }
  $Ip = Read-Host "External IP or hostname for clients"
}
if (-not $Ip) {
  Die "-Ip is required (client-facing address)"
}

$DeployDir = Resolve-InstallPaths
Convert-UnixShellScripts $DeployDir

function Test-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Die "'docker' not found. Install Docker Desktop: $DockerInstallUrl"
  }
  try {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker info failed" }
  } catch {
    Die "Docker daemon not running. Start Docker Desktop, then retry. $DockerInstallUrl"
  }
  docker compose version 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Die "'docker compose' missing. Install/update Docker Desktop: $DockerInstallUrl"
  }
}

Test-Docker

$composeFile = Join-Path $DeployDir "docker-compose.yml"
$envExample = Join-Path $DeployDir ".env.example"
$opsDir = Join-Path (Split-Path $DeployDir -Parent) "ops"

if (-not (Test-Path $composeFile)) { Die "docker-compose.yml not found in $DeployDir" }
if (-not (Test-Path $envExample)) { Die ".env.example not found in $DeployDir" }
if (-not (Test-Path $opsDir)) { Die "ops/ not found next to deploy/ (needed to build smt-ops)" }

function New-SecretBase64 {
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [Convert]::ToBase64String($bytes)
}

function New-SecretHex {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
}

$UpdaterRoot = Join-Path $DeployDir "updater"
$DataDir = Join-Path $DeployDir "data"
$OpsTools = Join-Path $DeployDir "ops-tools"
$WebsiteData = Join-Path $DeployDir "website-data"
$EnvFile = Join-Path $DeployDir ".env"

New-Item -ItemType Directory -Force -Path (Join-Path $UpdaterRoot "overlay") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $UpdaterRoot "base") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $UpdaterRoot "site") | Out-Null

function Seed-UpdaterIfNeeded {
  $seed = Join-Path $DeployDir "seed\updater"
  $ver = Join-Path $UpdaterRoot "overlay\hashlist.ver"
  if (-not (Test-Path $seed)) { return }
  if (-not (Test-Path $ver)) {
    Copy-Item -Path (Join-Path $seed "*") -Destination $UpdaterRoot -Recurse -Force
    Write-Host "Seeded updater from deploy/seed/updater (empty overlay - hashlist.ver ready)"
  }
}

Seed-UpdaterIfNeeded
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path $OpsTools | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DeployDir "backups") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DataDir "config") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DataDir "webroot") | Out-Null

function Seed-RuntimeConfigIfNeeded {
  $dest = Join-Path $DataDir "config"
  $seed = Join-Path $DeployDir "seed\config"
  if (-not (Test-Path $seed)) {
    $seed = Join-Path $DeployDir "config\sqlite"
  }
  if (-not (Test-Path $seed)) { return }
  $lobby = Join-Path $dest "lobby.xml"
  if (-not (Test-Path $lobby)) {
    Copy-Item -Path (Join-Path $seed "*") -Destination $dest -Recurse -Force
    Write-Host "Seeded data/config from $seed"
  } else {
    foreach ($f in @("channel.xml", "lobby.xml", "world.xml", "constants.xml", "setup.xml", "newcharacter.xml")) {
      $src = Join-Path $seed $f
      $dst = Join-Path $dest $f
      if ((Test-Path $src) -and -not (Test-Path $dst)) {
        Copy-Item -Path $src -Destination $dst -Force
        Write-Host "Restored missing data/config/$f"
      }
    }
  }
}

function Seed-WebrootIfNeeded {
  $seed = Join-Path $DeployDir "seed\webroot"
  $dest = Join-Path $DataDir "webroot"
  if (-not (Test-Path $seed)) { return }
  $marker = Join-Path $dest "casino\slot\index.html"
  if (-not (Test-Path $marker)) {
    Copy-Item -Path (Join-Path $seed "*") -Destination $dest -Recurse -Force
    Write-Host "Seeded data/webroot from deploy/seed/webroot (casino HTML wrappers)"
  }
}

Seed-RuntimeConfigIfNeeded
Seed-WebrootIfNeeded
New-Item -ItemType Directory -Force -Path (Join-Path $WebsiteData "server-content\config") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $WebsiteData "server-content\shops") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $WebsiteData "server-content\payouts") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $WebsiteData "server-content\report-rewards") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $WebsiteData "server-content\report-rewards\dungeons") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $WebsiteData "armory\portraits") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $WebsiteData "portrait-captures") | Out-Null

function Seed-ServerContentSubdir([string] $Subdir) {
  $dest = Join-Path $WebsiteData "server-content\$Subdir"
  $seed = Join-Path $DeployDir "seed\server-content\$Subdir"
  if (-not (Test-Path $seed)) { return }
  $hasFiles = Get-ChildItem -Path $dest -Force -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $hasFiles) {
    Copy-Item -Path (Join-Path $seed "*") -Destination $dest -Recurse -Force
    Write-Host "Seeded server-content/$Subdir from deploy/seed/server-content/$Subdir"
  }
}

Seed-ServerContentSubdir "shops"
Seed-ServerContentSubdir "payouts"
Seed-ServerContentSubdir "report-rewards"

$hostLabel = if ($Domain) { $Domain } else { $Ip }
$SiteUrl = "http://${hostLabel}:${WebsitePort}"
$PublicUpdaterUrl = "http://${hostLabel}:8765"

# Docker on Windows prefers forward slashes in compose env paths
function To-ComposePath([string] $Path) {
  ($Path -replace '\\', '/')
}

$SessionSecret = New-SecretBase64
$OpsToken = New-SecretHex
$CompResetSecret = New-SecretHex
$CompAnnounceUser = "admin"
$CompAnnouncePassword = "admin123"
$ResendApiKey = ""
$ResendFromEmail = ""
$ResendFromName = ""
$ResendSupportEmail = ""
if (Test-Path $EnvFile) {
  Write-Host "Existing .env found - regenerating with new EXTERNAL_IP/URLs; rotating secrets only if placeholders."
  $existing = Get-Content $EnvFile -Raw
  if ($existing -match '(?m)^SESSION_SECRET=(.+)$') {
    $prev = $Matches[1].Trim()
    if ($prev -and $prev -notmatch 'replace-with') { $SessionSecret = $prev }
  }
  if ($existing -match '(?m)^OPS_TOKEN=(.+)$') {
    $prev = $Matches[1].Trim()
    if ($prev -and $prev -notmatch 'replace-with') { $OpsToken = $prev }
  }
  if ($existing -match '(?m)^COMP_RESET_SECRET=(.+)$') {
    $prev = $Matches[1].Trim()
    if ($prev) { $CompResetSecret = $prev }
  }
  if ($existing -match '(?m)^COMP_ANNOUNCE_USER=(.+)$') {
    $prev = $Matches[1].Trim()
    if ($prev) { $CompAnnounceUser = $prev }
  }
  if ($existing -match '(?m)^COMP_ANNOUNCE_PASSWORD=(.+)$') {
    $prev = $Matches[1].Trim()
    if ($prev) { $CompAnnouncePassword = $prev }
  }
  if ($existing -match '(?m)^RESEND_API_KEY=(.+)$') {
    $prev = $Matches[1].Trim()
    if ($prev) { $ResendApiKey = $prev }
  }
  if ($existing -match '(?m)^RESEND_FROM_EMAIL=(.+)$') {
    $prev = $Matches[1].Trim()
    if ($prev) { $ResendFromEmail = $prev }
  }
  if ($existing -match '(?m)^RESEND_FROM_NAME=(.+)$') {
    $prev = $Matches[1].Trim()
    if ($prev) { $ResendFromName = $prev }
  }
  if ($existing -match '(?m)^RESEND_SUPPORT_EMAIL=(.+)$') {
    $prev = $Matches[1].Trim()
    if ($prev) { $ResendSupportEmail = $prev }
  }
}

$envBody = @"
# Generated by install.ps1 - $([DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mmZ"))
EXTERNAL_IP=$Ip
SESSION_SECRET=$SessionSecret
OPS_TOKEN=$OpsToken
COMP_RESET_SECRET=$CompResetSecret
UPDATER_ROOT=$(To-ComposePath $UpdaterRoot)
COMP_RUNTIME=$(To-ComposePath $DataDir)
COMP_ENTRYPOINT=$(To-ComposePath (Join-Path $DeployDir "entrypoint.sh"))
WEBSITE_DATA=$(To-ComposePath $WebsiteData)
SMT_BACKUPS=$(To-ComposePath (Join-Path $DeployDir "backups"))
OPS_HOST_DEPLOY_DIR=$(To-ComposePath $DeployDir)
WEBSITE_PORT=$WebsitePort
SITE_URL=$SiteUrl
PUBLIC_UPDATER_URL=$PublicUpdaterUrl
COOKIE_SECURE=false
OPS_URL=http://ops:14710
COMP_IMAGE=colpertac/smt-comp:latest
WEBSITE_IMAGE=colpertac/smt-website:latest
OPS_IMAGE=colpertac/smt-ops:latest
COMP_ANNOUNCE_USER=$CompAnnounceUser
COMP_ANNOUNCE_PASSWORD=$CompAnnouncePassword
"@
if ($ResendApiKey) { $envBody += "`nRESEND_API_KEY=$ResendApiKey" }
if ($ResendFromEmail) { $envBody += "`nRESEND_FROM_EMAIL=$ResendFromEmail" }
if ($ResendFromName) { $envBody += "`nRESEND_FROM_NAME=$ResendFromName" }
if ($ResendSupportEmail) { $envBody += "`nRESEND_SUPPORT_EMAIL=$ResendSupportEmail" }

Set-Content -Path $EnvFile -Value $envBody -Encoding utf8
Write-Host "Wrote $EnvFile"
Write-Host "  EXTERNAL_IP=$Ip"
Write-Host "  SITE_URL=$SiteUrl"
Write-Host "  PUBLIC_UPDATER_URL=$PublicUpdaterUrl"
Write-Host "  (SESSION_SECRET, OPS_TOKEN, COMP_RESET_SECRET stored in .env - keep private)"

Push-Location $DeployDir
try {
  $stageScript = Join-Path $DeployDir "scripts\stage-ops-tools.sh"
  $opsDir = Join-Path (Split-Path $DeployDir -Parent) "ops"
  $opsBuildLocal = $false
  if ((Test-Path $stageScript) -and (Test-Path (Join-Path $opsDir "Dockerfile"))) {
    # Prefer Git Bash; skip the Windows WSL stub (system32\bash.exe) which
    # fails when no real Linux distro is installed.
    $bash = Get-Command bash -All -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Source -and
        $_.Source -notmatch '\\(System32|Sysnative|SysWOW64|WindowsApps)\\bash\.exe$'
      } |
      Select-Object -First 1
    if ($bash) {
      & $bash.Source $stageScript
      if ($LASTEXITCODE -eq 0) {
        $opsBuildLocal = $true
        Write-Host "Ops tools staged - will build smt-ops:local from ../ops."
        (Get-Content $EnvFile) -replace '^OPS_IMAGE=.*', 'OPS_IMAGE=colpertac/smt-ops:local' | Set-Content $EnvFile
      } else {
        Write-Host "No local comp_hack build - pulling colpertac/smt-ops:latest (tools baked in)."
      }
    }
  } else {
    Write-Host "Will pull colpertac/smt-ops:latest (tools baked in)."
  }
  Write-Host "Pulling Hub images and starting stack..."
  if ($opsBuildLocal) {
    docker compose --progress=plain pull lobby world channel website updater
    docker compose build ops
    docker compose up -d
  } else {
    docker compose --progress=plain pull lobby world channel website updater ops
    docker compose up -d
  }
  if ($LASTEXITCODE -ne 0) { Die "docker compose up failed (exit $LASTEXITCODE)" }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "=== SMT stack starting ==="
Write-Host "Website:  $SiteUrl"
Write-Host "Updater:  $PublicUpdaterUrl"
Write-Host "Lobby:    ${Ip}:10666"
Write-Host "Channel:  ${Ip}:14666"
Write-Host ""
Write-Host "Next:"
Write-Host "  1. Open $SiteUrl - register / sign in (admin needs userLevel >= 1000)."
Write-Host "  2. Admin -> Overview - confirm ops is healthy."
Write-Host "  3. If first boot: Admin -> Game files - upload content zips, then Start."
Write-Host "  4. Admin -> Download - Client prep zip, ship client, paste MediaFire/Drive URL."
Write-Host "  5. Allow ports 10666, 14666, 8765, $WebsitePort in Windows Firewall / router if public."
Write-Host "  6. Optional: Admin -> Email - paste Resend API key + from address for forgot-password mail."
Write-Host "     Restart lobby once after saving (Overview -> restart services if needed)."
Write-Host ""
Write-Host "Docs: docs/youtube-1.0-setup.md"
