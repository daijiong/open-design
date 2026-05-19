param(
  [string]$Node24Path = "",
  [int]$DaemonPort = 17456,
  [int]$WebPort = 17573,
  [string]$BindHost = "0.0.0.0",
  [string]$AllowedOrigins = "",
  [string]$Namespace = "default"
)

$ErrorActionPreference = "Stop"

$StopScript = Join-Path $PSScriptRoot "stop-open-design-services.ps1"
$StartScript = Join-Path $PSScriptRoot "start-open-design-services.ps1"

& $StopScript -Node24Path $Node24Path -Namespace $Namespace
Start-Sleep -Seconds 2
& $StartScript -Node24Path $Node24Path -DaemonPort $DaemonPort -WebPort $WebPort -BindHost $BindHost -AllowedOrigins $AllowedOrigins -Namespace $Namespace
