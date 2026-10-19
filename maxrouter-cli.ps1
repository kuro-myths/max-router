# Max Router Online CLI - Windows PowerShell client
$ErrorActionPreference = 'Stop'
$BaseUrl = 'https://max-router-production.up.railway.app'
$ApiKey = ''
$Model = ''
function Write-Title {
  Clear-Host
  Write-Host ''
  Write-Host '  MAX ROUTER ONLINE CLI' -ForegroundColor Cyan
  Write-Host '  Terhubung ke layanan Railway (tanpa server lokal)' -ForegroundColor DarkGray
  Write-Host ('  URL: ' + $BaseUrl) -ForegroundColor DarkGray
  Write-Host ''
}
function Read-ApiKey {
  if (-not $script:ApiKey) {
    $secure = Read-Host 'Masukkan API key Max Router (input tidak ditampilkan)' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $script:ApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  }
  if (-not $script:ApiKey) { throw 'API key tidak boleh kosong.' }
}
function Invoke-Api([string]$Path, [string]$Method = 'GET', $Body = $null) {
  $headers = @{}
  if ($script:ApiKey) { $headers.Authorization = 'Bearer ' + $script:ApiKey }
  $params = @{ Uri = ($script:BaseUrl.TrimEnd('/') + $Path); Method = $Method; Headers = $headers; TimeoutSec = 45 }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 20 -Compress)
  }
  Invoke-RestMethod @params
}
function Get-Models {
  Read-ApiKey
  $data = Invoke-Api '/v1/models'
  if ($data.data) { return @($data.data) }
  if ($data.models) { return @($data.models) }
  return @()
}
while ($true) {
  Write-Title
  Write-Host '  [1] Cek status layanan online'
  Write-Host '  [2] Lihat daftar model/API yang tersedia'
  Write-Host '  [3] Mulai chat AI dari terminal'
  Write-Host '  [4] Atur URL layanan'
  Write-Host '  [5] Ganti API key'
  Write-Host '  [6] Buka dashboard web'
  Write-Host '  [0] Keluar'
  Write-Host ''
  $choice = Read-Host 'Pilih menu'
  try {
    switch ($choice) {
      '1' {
        Write-Host ''
        try {
          $r = Invoke-WebRequest -Uri $BaseUrl -Method Get -TimeoutSec 20
          Write-Host ('Status HTTP: ' + [int]$r.StatusCode) -ForegroundColor Green
          Write-Host 'Dashboard Railway dapat dijangkau.'
          try {
            Read-ApiKey
            $m = Get-Models
            Write-Host ('Jumlah model/API terdaftar: ' + $m.Count) -ForegroundColor Green
          } catch { Write-Host ('API model belum dapat dibaca: ' + $_.Exception.Message) -ForegroundColor Yellow }
        } catch { Write-Host ('Layanan tidak terjangkau: ' + $_.Exception.Message) -ForegroundColor Red }
        Read-Host 'Tekan Enter untuk kembali' | Out-Null
      }
      '2' {
        $models = Get-Models
        Write-Host ''
        if ($models.Count -eq 0) { Write-Host 'Endpoint merespons, tetapi tidak ada model dalam format yang dikenal.' -ForegroundColor Yellow }
        else {
          Write-Host ('Ditemukan ' + $models.Count + ' model/API:') -ForegroundColor Green
          $i = 1
          foreach ($item in $models) {
            $id = if ($item.id) { $item.id } elseif ($item.name) { $item.name } else { ($item | ConvertTo-Json -Compress -Depth 5) }
            Write-Host ('  ' + $i + '. ' + $id)
            $i++
          }
          $script:Model = Read-Host 'Ketik ID model untuk dipakai chat (Enter = pilih nanti)'
          if ($script:Model -and -not ($models | Where-Object { $_.id -eq $script:Model -or $_.name -eq $script:Model })) {
            Write-Host 'Catatan: ID tidak cocok dengan daftar yang dikembalikan server; akan tetap dicoba.' -ForegroundColor Yellow
          }
        }
        Read-Host 'Tekan Enter untuk kembali' | Out-Null
      }
      '3' {
        Read-ApiKey
        if (-not $script:Model) { $script:Model = Read-Host 'ID model (lihat menu 2 untuk daftar)' }
        if (-not $script:Model) { throw 'ID model wajib diisi.' }
        Write-Host 'Chat aktif. Ketik /keluar untuk kembali ke menu.' -ForegroundColor Cyan
        $messages = @()
        while ($true) {
          $prompt = Read-Host 'Anda'
          if ($prompt -eq '/keluar') { break }
          if ([string]::IsNullOrWhiteSpace($prompt)) { continue }
          $messages += @{ role = 'user'; content = $prompt }
          try {
            $payload = @{ model = $script:Model; messages = $messages; stream = $false }
            $answer = Invoke-Api '/v1/chat/completions' 'POST' $payload
            $content = $answer.choices[0].message.content
            if ($content -is [array]) { $content = ($content | ForEach-Object { if ($_.text) { $_.text } else { $_ | ConvertTo-Json -Compress } }) -join '' }
            Write-Host ''
            Write-Host ('AI: ' + [string]$content) -ForegroundColor Green
            Write-Host ''
            $messages += @{ role = 'assistant'; content = [string]$content }
          } catch {
            Write-Host ('Permintaan gagal: ' + $_.Exception.Message) -ForegroundColor Red
            if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message -ForegroundColor DarkRed }
            if ($messages.Count -gt 0) { $messages = @($messages | Select-Object -Last 0) }
          }
        }
      }
      '4' {
        $newUrl = Read-Host 'URL dasar (Enter untuk tetap memakai URL Railway)'
        if ($newUrl) {
          if ($newUrl -notmatch '^https?://') { Write-Host 'URL harus diawali http:// atau https://' -ForegroundColor Yellow; Start-Sleep -Seconds 2 }
          else { $script:BaseUrl = $newUrl.TrimEnd('/'); $script:Model = '' }
        }
      }
      '5' { $script:ApiKey = ''; Read-ApiKey; Write-Host 'API key hanya disimpan selama sesi terminal ini.' -ForegroundColor Green; Start-Sleep -Seconds 2 }
      '6' { Start-Process $BaseUrl }
      '0' { break }
      default { Write-Host 'Pilihan tidak dikenal.' -ForegroundColor Yellow; Start-Sleep -Seconds 1 }
    }
  } catch {
    Write-Host ''
    Write-Host ('Gagal: ' + $_.Exception.Message) -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message -ForegroundColor DarkRed }
    Read-Host 'Tekan Enter untuk kembali' | Out-Null
  }
  if ($choice -eq '0') { break }
}
