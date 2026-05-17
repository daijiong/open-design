param(
  [string]$Node24Path = "C:\Users\Administrator\AppData\Local\nvm\v24.15.0\node.exe",
  [int]$DaemonPort = 17456,
  [int]$WebPort = 17573,
  [string]$Namespace = "default"
)

$ErrorActionPreference = "Stop"

$StopScript = Join-Path $PSScriptRoot "stop-open-design-services.ps1"
$StartScript = Join-Path $PSScriptRoot "start-open-design-services.ps1"

& $StopScript -Node24Path $Node24Path -Namespace $Namespace
Start-Sleep -Seconds 2
& $StartScript -Node24Path $Node24Path -DaemonPort $DaemonPort -WebPort $WebPort -Namespace $Namespace
