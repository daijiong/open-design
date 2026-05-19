param(
  [string]$Node24Path = "",
  [int]$DaemonPort = 17456,
  [int]$WebPort = 17573,
  [string]$BindHost = "0.0.0.0",
  [string]$AllowedOrigins = "",
  [string]$Namespace = "default"
)

$ErrorActionPreference = "Stop"

$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ToolsDevBin = Join-Path $WorkspaceRoot "tools\dev\bin\tools-dev.mjs"
$TsxCli = Join-Path $WorkspaceRoot "node_modules\.pnpm\tsx@4.21.0\node_modules\tsx\dist\cli.mjs"
$RuntimeBase = Join-Path $WorkspaceRoot ".tmp\tools-dev"
$NamespaceRoot = Join-Path $RuntimeBase $Namespace
$WebRuntime = Join-Path $NamespaceRoot "web"
$NextDist = Join-Path $WebRuntime "next"
$NextTsconfig = Join-Path $WebRuntime "tsconfig.json"
$RuntimeNodeModules = Join-Path $WebRuntime "node_modules"
$WebNodeModules = Join-Path $WorkspaceRoot "apps\web\node_modules"

function Assert-FileExists([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label not found: $Path"
  }
}

function Resolve-Node24Path([string]$RequestedPath) {
  if ($RequestedPath -ne "") {
    Assert-FileExists $RequestedPath "Node 24"
    return (Resolve-Path -LiteralPath $RequestedPath).Path
  }

  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($null -eq $nodeCommand) {
    throw "Node 24 not found on PATH. Install Node 24 or pass -Node24Path `"C:\path\to\node.exe`"."
  }

  $candidatePath = $nodeCommand.Source
  $version = & $candidatePath -v
  if ($LASTEXITCODE -ne 0 -or $version -notmatch "^v24\.") {
    throw "Node 24 required, but PATH resolves node to $version at $candidatePath. Pass -Node24Path `"C:\path\to\node.exe`"."
  }

  return $candidatePath
}

function Quote-Arg([string]$Value) {
  return '"' + ($Value -replace '\\(?=")', '\\' -replace '"', '\"') + '"'
}

function Start-HiddenNode([string[]]$ArgList, [hashtable]$EnvMap) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Node24Path
  $psi.WorkingDirectory = $WorkspaceRoot
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $psi.Arguments = ($ArgList | ForEach-Object { Quote-Arg $_ }) -join " "

  foreach ($key in $EnvMap.Keys) {
    $psi.EnvironmentVariables[$key] = [string]$EnvMap[$key]
  }

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  $null = $process.Start()
  return $process.Id
}

function Wait-HttpOk([string]$Url, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        return
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for $Url"
}

function Get-ToolsDevStatus {
  $json = & $Node24Path $ToolsDevBin status --namespace $Namespace --json
  return ($json | Out-String | ConvertFrom-Json)
}

function Resolve-AllowedOrigins([string]$ConfiguredOrigins, [string]$HostName, [int]$Port) {
  if ($ConfiguredOrigins -ne "") {
    return $ConfiguredOrigins
  }

  if ($HostName -eq "127.0.0.1" -or $HostName -eq "localhost" -or $HostName -eq "::1" -or $HostName -eq "[::1]") {
    return ""
  }

  $hosts = New-Object System.Collections.Generic.List[string]
  if ($HostName -ne "0.0.0.0" -and $HostName -ne "::") {
    $hosts.Add($HostName)
  } else {
    $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.PrefixOrigin -ne "WellKnown"
      } |
      Select-Object -ExpandProperty IPAddress -Unique

    foreach ($address in $addresses) {
      $hosts.Add($address)
    }
  }

  $origins = $hosts |
    Select-Object -Unique |
    ForEach-Object { "http://${_}:$Port" }

  return ($origins -join ",")
}

$Node24Path = Resolve-Node24Path $Node24Path
$Node24Dir = Split-Path -Parent $Node24Path
Assert-FileExists $ToolsDevBin "tools-dev"
Assert-FileExists $TsxCli "tsx CLI"
$AllowedOrigins = Resolve-AllowedOrigins $AllowedOrigins $BindHost $WebPort

$status = Get-ToolsDevStatus
if ($status.apps.daemon.state -eq "running" -and $status.apps.web.state -eq "running") {
  Write-Host "Open Design services are already running."
  Write-Host "Web:    $($status.apps.web.url)"
  Write-Host "Daemon: $($status.apps.daemon.url)"
  exit 0
}

if ($status.apps.daemon.state -eq "running" -or $status.apps.web.state -eq "running") {
  & $Node24Path $ToolsDevBin stop web --namespace $Namespace | Out-Host
  Start-Sleep -Seconds 2
}

New-Item -ItemType Directory -Force -Path $WebRuntime | Out-Null
if (Test-Path -LiteralPath $RuntimeNodeModules) {
  $item = Get-Item -LiteralPath $RuntimeNodeModules -Force
  $isLink = (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
  if (-not $isLink) {
    Remove-Item -LiteralPath $RuntimeNodeModules -Recurse -Force
    New-Item -ItemType Junction -Path $RuntimeNodeModules -Target $WebNodeModules | Out-Null
  }
} else {
  New-Item -ItemType Junction -Path $RuntimeNodeModules -Target $WebNodeModules | Out-Null
}

$nextTsconfigJson = @{
  extends = "../../../../apps/web/tsconfig.json"
  compilerOptions = @{ plugins = @(@{ name = "next" }) }
} | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($NextTsconfig, "$nextTsconfigJson`n", (New-Object System.Text.UTF8Encoding($false)))

$commonEnv = @{
  PATH = "$Node24Dir;$env:PATH"
  OD_SIDECAR_BASE = $RuntimeBase
  OD_SIDECAR_NAMESPACE = $Namespace
  OD_SIDECAR_SOURCE = "tools-dev"
}
if ($AllowedOrigins -ne "") {
  $commonEnv["OD_ALLOWED_ORIGINS"] = $AllowedOrigins
}

$daemonIpc = "\\.\pipe\open-design-$Namespace-daemon"
$daemonEnv = $commonEnv.Clone()
$daemonEnv["OD_SIDECAR_IPC_PATH"] = $daemonIpc
$daemonEnv["OD_PORT"] = [string]$DaemonPort
$daemonEnv["OD_WEB_PORT"] = [string]$WebPort
$daemonArgs = @(
  $TsxCli,
  (Join-Path $WorkspaceRoot "apps\daemon\src\sidecar\index.ts"),
  "--od-stamp-app=daemon",
  "--od-stamp-mode=dev",
  "--od-stamp-namespace=$Namespace",
  "--od-stamp-ipc=$daemonIpc",
  "--od-stamp-source=tools-dev"
)

$daemonRootPid = Start-HiddenNode $daemonArgs $daemonEnv
Wait-HttpOk "http://127.0.0.1:$DaemonPort/api/health" 30

$webIpc = "\\.\pipe\open-design-$Namespace-web"
$webEnv = $commonEnv.Clone()
$webEnv["OD_SIDECAR_IPC_PATH"] = $webIpc
$webEnv["OD_PORT"] = [string]$DaemonPort
$webEnv["OD_WEB_PORT"] = [string]$WebPort
$webEnv["OD_HOST"] = $BindHost
$webEnv["PORT"] = [string]$WebPort
$webEnv["OD_WEB_DIST_DIR"] = $NextDist
$webEnv["OD_WEB_TSCONFIG_PATH"] = $NextTsconfig
$webEnv["NODE_PATH"] = (Join-Path $WorkspaceRoot "apps\web\node_modules") + ";" + (Join-Path $WorkspaceRoot "node_modules")
$webArgs = @(
  $TsxCli,
  (Join-Path $WorkspaceRoot "apps\web\sidecar\index.ts"),
  "--od-stamp-app=web",
  "--od-stamp-mode=dev",
  "--od-stamp-namespace=$Namespace",
  "--od-stamp-ipc=$webIpc",
  "--od-stamp-source=tools-dev"
)

$webRootPid = Start-HiddenNode $webArgs $webEnv
Wait-HttpOk "http://127.0.0.1:$WebPort/" 60

$finalStatus = Get-ToolsDevStatus
Write-Host "Open Design services started."
Write-Host "Daemon root PID: $daemonRootPid"
Write-Host "Web root PID:    $webRootPid"
Write-Host "Web:             $($finalStatus.apps.web.url)"
Write-Host "Daemon:          $($finalStatus.apps.daemon.url)"
if ($AllowedOrigins -ne "") {
  Write-Host "Allowed origins: $AllowedOrigins"
}
