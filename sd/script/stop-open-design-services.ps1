param(
  [string]$Node24Path = "",
  [string]$Namespace = "default"
)

$ErrorActionPreference = "Stop"

$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ToolsDevBin = Join-Path $WorkspaceRoot "tools\dev\bin\tools-dev.mjs"

function Resolve-Node24Path([string]$RequestedPath) {
  if ($RequestedPath -ne "") {
    if (-not (Test-Path -LiteralPath $RequestedPath)) {
      throw "Node 24 not found: $RequestedPath"
    }
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

if (-not (Test-Path -LiteralPath $ToolsDevBin)) {
  throw "tools-dev not found: $ToolsDevBin"
}

$Node24Path = Resolve-Node24Path $Node24Path
& $Node24Path $ToolsDevBin stop web --namespace $Namespace | Out-Host
