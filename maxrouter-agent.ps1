#!/usr/bin/env pwsh
<#
Max Router Agent
Mode: Agent Otomatis untuk CLI dan browser automation
#>

param(
    [string]$Url = "",
    [string[]]$Prompt = @()
)

Write-Host "`nMAX ROUTER AGENT" -ForegroundColor Cyan

# Check Node.js
try {
    $nodeVersion = node --version 2>$null
    if (-not $nodeVersion) {
        throw "Node.js tidak ditemukan"
    }
    Write-Host "Node.js: $nodeVersion"
} catch {
    Write-Host "GAGAL: $_" -ForegroundColor Red
    Write-Host "Pasang Node.js 20+ dari https://nodejs.org/"
    Read-Host -Prompt "Tekan Enter"
    exit 1
}

# Download agent
$agentFile = "$env:TEMP\maxrouter-agent.js"
$githubUrl = "https://raw.githubusercontent.com/rizki-habibi/max-router/master/maxrouter-agent.js"

try {
    Write-Host "Mengunduh agent..."
    Invoke-WebRequest -Uri $githubUrl -OutFile $agentFile -ErrorAction Stop
    
    if (-not (Test-Path $agentFile)) {
        throw "File tidak dibuat"
    }
    
    Write-Host "Menjalankan...`n"
    
    # Build arguments
    $args = @()
    if ($Url) {
        $args += $Url
    }
    $args += $Prompt
    
    node $agentFile $args
    
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        Write-Host "`nAgent berhenti dengan kode $exitCode" -ForegroundColor Yellow
        Read-Host -Prompt "Tekan Enter"
    }
    
} catch {
    Write-Host "GAGAL: $_" -ForegroundColor Red
    Read-Host -Prompt "Tekan Enter"
    exit 1
}
