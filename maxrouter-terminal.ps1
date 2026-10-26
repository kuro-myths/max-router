#!/usr/bin/env pwsh
<#
Max Router Terminal Agent
Klien terminal untuk akses Max Router sebagai agent
#>

param(
    [string]$Url = ""
)

Write-Host "`nMAX ROUTER TERMINAL AGENT" -ForegroundColor Cyan
Write-Host "Klien terminal untuk akses Max Router sebagai agent`n"

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "Node.js: $nodeVersion"
} catch {
    Write-Host "GAGAL: Node.js tidak ditemukan." -ForegroundColor Red
    Write-Host "Pasang Node.js 20+ dari https://nodejs.org/"
    Read-Host -Prompt "Tekan Enter untuk keluar"
    exit 1
}

# Download terminal client
$terminalFile = "$env:TEMP\maxrouter-terminal.js"
$githubUrl = "https://raw.githubusercontent.com/rizki-habibi/max-router/master/maxrouter-terminal.js"

try {
    Write-Host "Mengunduh klien terminal..."
    if ($Url) {
        Invoke-WebRequest -Uri $githubUrl -OutFile $terminalFile
    } else {
        Invoke-WebRequest -Uri $githubUrl -OutFile $terminalFile
    }
    
    if (-not (Test-Path $terminalFile)) {
        throw "File tidak dibuat"
    }
    
    Write-Host "Menjalankan Max Router Terminal Agent...`n"
    
    # Build arguments
    $args = @()
    if ($Url) {
        $args += $Url
    }
    
    node $terminalFile $args
    
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        Write-Host "`nTerminal berhenti dengan kode $exitCode" -ForegroundColor Yellow
        Read-Host -Prompt "Tekan Enter untuk keluar"
    }
    
} catch {
    Write-Host "GAGAL: $_" -ForegroundColor Red
    Read-Host -Prompt "Tekan Enter untuk keluar"
    exit 1
}
