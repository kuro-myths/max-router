#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$Version = "3.8.53"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "MAX ROUTER - OMNIROUTE AGENTBRIDGE INSTALLER" -ForegroundColor Cyan
Write-Host "This installs the upstream OmniRoute CLI; it does not enable MITM automatically."
Write-Host ""

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$npmCommand = Get-Command npm -ErrorAction SilentlyContinue
if (-not $nodeCommand -or -not $npmCommand) {
    throw "Node.js and npm are required. Install a supported Node.js release (22.22.2+ on Node 22, or Node 24-26), then reopen PowerShell."
}

$nodeText = (& node --version).Trim().TrimStart("v")
try {
    $nodeVersion = [version]$nodeText
} catch {
    throw "Could not parse Node.js version: $nodeText"
}

$nodeMajorSupported = (
    ($nodeVersion.Major -eq 22 -and $nodeVersion -ge [version]"22.22.2") -or
    ($nodeVersion.Major -ge 24 -and $nodeVersion.Major -le 26)
)
if (-not $nodeMajorSupported) {
    throw "Unsupported Node.js version $nodeText. Use Node 22.22.2+ (22.x) or Node 24-26."
}

Write-Host "Node.js: v$nodeText" -ForegroundColor Green
Write-Host "Installing omniroute@$Version ..."
& npm install --global "omniroute@$Version"
if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with exit code $LASTEXITCODE"
}

$omniCommand = Get-Command omniroute -ErrorAction SilentlyContinue
if (-not $omniCommand) {
    throw "Installation completed but 'omniroute' is not on PATH. Reopen PowerShell and check npm global prefix."
}

Write-Host ""
Write-Host "OmniRoute installed successfully." -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "  1. Run: omniroute"
Write-Host "  2. Open: http://localhost:20128"
Write-Host "  3. Open Tools > AgentBridge and follow its setup wizard."
Write-Host ""
Write-Host "No CA certificate or hosts/DNS changes were made by this installer."
