param(
  [string]$Node24Path = "C:\Users\Administrator\AppData\Local\nvm\v24.15.0\node.exe",
  [string]$Namespace = "default"
)

$ErrorActionPreference = "Stop"

$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ToolsDevBin = Join-Path $WorkspaceRoot "tools\dev\bin\tools-dev.mjs"

if (-not (Test-Path -LiteralPath $Node24Path)) {
  throw "Node 24 not found: $Node24Path"
}

if (-not (Test-Path -LiteralPath $ToolsDevBin)) {
  throw "tools-dev not found: $ToolsDevBin"
}

& $Node24Path $ToolsDevBin stop web --namespace $Namespace | Out-Host
