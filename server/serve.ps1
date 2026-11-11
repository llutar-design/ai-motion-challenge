# AI 모션 챌린지 로컬 정적 파일 서버
# - 127.0.0.1(루프백)에만 바인딩: 학교의 다른 PC 에서는 접속할 수 없음
# - Windows 기본 PowerShell 5.1 만 사용(Node.js/Python 설치 불필요, 관리자 권한 불필요)
# - 외부 네트워크로 아무것도 보내지 않음. 정적 파일(GET/HEAD)만 제공
param(
  [int]$Port = 8770,
  [switch]$NoBrowser,
  [switch]$Kiosk,
  [string]$Root
)

$ErrorActionPreference = 'Stop'
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
$Root = (Resolve-Path $Root).Path.TrimEnd('\')
$Url = "http://127.0.0.1:$Port/"

function Find-Browser {
  $candidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}

function Open-Browser {
  if ($NoBrowser) { return }
  $exe = Find-Browser
  $profileDir = Join-Path $Root '.browser-profile'
  if ($exe) {
    $bargs = @("--user-data-dir=`"$profileDir`"", '--no-first-run', '--no-default-browser-check',
              '--autoplay-policy=no-user-gesture-required', '--disable-features=Translate')
    if ($Kiosk) {
      $bargs += @('--kiosk', $Url)
      if ($exe -like '*msedge*') { $bargs += '--edge-kiosk-type=fullscreen' }
    } else {
      $bargs += @("--app=$Url", '--start-fullscreen')
    }
    Start-Process -FilePath $exe -ArgumentList $bargs | Out-Null
  } else {
    Start-Process $Url | Out-Null
  }
}

# 이미 실행 중이면 브라우저만 연다
try {
  $probe = Invoke-WebRequest -Uri "${Url}index.html" -UseBasicParsing -TimeoutSec 2
  if ($probe.StatusCode -eq 200) {
    Write-Host "이미 실행 중인 서버가 있습니다: $Url"
    Open-Browser
    exit 0
  }
} catch { }

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
try {
  $listener.Start()
} catch {
  Write-Host "[오류] 포트 $Port 를 사용할 수 없습니다. 다른 프로그램이 사용 중일 수 있습니다." -ForegroundColor Red
  Write-Host "       다른 포트로 실행: powershell -ExecutionPolicy Bypass -File server\serve.ps1 -Port 8771"
  exit 1
}

$handler = {
  param($client, $Root, $shared)
  $mime = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.wasm' = 'application/wasm'
    '.task' = 'application/octet-stream'; '.wav' = 'audio/wav'; '.mp3' = 'audio/mpeg'; '.ogg' = 'audio/ogg'
    '.m4a' = 'audio/mp4'; '.webm' = 'audio/webm'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'
    '.md' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'; '.ico' = 'image/x-icon'
  }
  $csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'"
  try {
    $client.ReceiveTimeout = 5000
    $client.SendTimeout = 15000
    $stream = $client.GetStream()
    $buf = New-Object byte[] 16384
    $req = ''
    while ($req.IndexOf("`r`n`r`n") -lt 0) {
      $n = $stream.Read($buf, 0, $buf.Length)
      if ($n -le 0) { return }
      $req += [System.Text.Encoding]::ASCII.GetString($buf, 0, $n)
      if ($req.Length -gt 65536) { return }
    }
    $lines = $req -split "`r`n"
    $parts = $lines[0] -split ' '
    $method = $parts[0]
    $rawPath = ($parts[1] -split '\?')[0]
    $range = $null
    foreach ($l in $lines) { if ($l -match '^Range:\s*bytes=(\d*)-(\d*)\s*$') { $range = $Matches } }

    $send = {
      param([int]$code, [string]$status, [hashtable]$headers, [byte[]]$body)
      $sb = New-Object System.Text.StringBuilder
      [void]$sb.Append("HTTP/1.1 $code $status`r`n")
      foreach ($k in $headers.Keys) { [void]$sb.Append("${k}: $($headers[$k])`r`n") }
      [void]$sb.Append("Connection: close`r`n`r`n")
      $hb = [System.Text.Encoding]::ASCII.GetBytes($sb.ToString())
      $stream.Write($hb, 0, $hb.Length)
      if ($body) { $stream.Write($body, 0, $body.Length) }
    }

    # 게임 화면의 [프로그램 종료] 버튼: 전용 헤더가 있는 POST 만 허용(다른 사이트는 CORS 사전 요청에서 거부됨)
    if ($method -eq 'POST' -and $rawPath -eq '/__shutdown') {
      if ($lines -match '^X-Motion-Challenge:\s*shutdown\s*$') {
        & $send 204 'No Content' @{ 'Content-Length' = 0 } $null
        $shared.stop = $true
      } else {
        & $send 403 'Forbidden' @{ 'Content-Length' = 0 } $null
      }
      return
    }
    if ($method -ne 'GET' -and $method -ne 'HEAD') {
      & $send 405 'Method Not Allowed' @{ 'Content-Length' = 0; 'Allow' = 'GET, HEAD' } $null; return
    }
    $path = [System.Uri]::UnescapeDataString($rawPath)
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
    # 경로 탈출과 숨김 폴더(.browser-profile 등) 차단
    if ($path.Contains('..') -or $path.Contains('\') -or $path -match '/\.') {
      & $send 403 'Forbidden' @{ 'Content-Length' = 0 } $null; return
    }
    $full = [System.IO.Path]::GetFullPath((Join-Path $Root ($path.TrimStart('/') -replace '/', '\')))
    if (-not $full.StartsWith($Root + '\', [System.StringComparison]::OrdinalIgnoreCase) -or -not [System.IO.File]::Exists($full)) {
      $msg = [System.Text.Encoding]::UTF8.GetBytes("Not found: $path")
      & $send 404 'Not Found' @{ 'Content-Type' = 'text/plain; charset=utf-8'; 'Content-Length' = $msg.Length } $msg; return
    }
    $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
    $type = $mime[$ext]; if (-not $type) { $type = 'application/octet-stream' }
    $fs = [System.IO.File]::OpenRead($full)
    try {
      $len = $fs.Length
      $start = 0; $end = $len - 1; $code = 200; $status = 'OK'
      $headers = @{
        'Content-Type' = $type; 'Cache-Control' = 'no-cache'; 'Accept-Ranges' = 'bytes'
        'X-Content-Type-Options' = 'nosniff'; 'Content-Security-Policy' = $csp; 'Referrer-Policy' = 'no-referrer'
      }
      if ($range -and $len -gt 0) {
        if ($range[1] -ne '') { $start = [int64]$range[1]; if ($range[2] -ne '') { $end = [Math]::Min([int64]$range[2], $len - 1) } }
        elseif ($range[2] -ne '') { $start = [Math]::Max(0, $len - [int64]$range[2]) }
        if ($start -gt $end -or $start -ge $len) {
          & $send 416 'Range Not Satisfiable' @{ 'Content-Range' = "bytes */$len"; 'Content-Length' = 0 } $null; return
        }
        $code = 206; $status = 'Partial Content'
        $headers['Content-Range'] = "bytes $start-$end/$len"
      }
      $count = $end - $start + 1
      $headers['Content-Length'] = $count
      & $send $code $status $headers $null
      if ($method -eq 'GET' -and $count -gt 0) {
        [void]$fs.Seek($start, 'Begin')
        $chunk = New-Object byte[] 262144
        $left = $count
        while ($left -gt 0) {
          $r = $fs.Read($chunk, 0, [int][Math]::Min($chunk.Length, $left))
          if ($r -le 0) { break }
          $stream.Write($chunk, 0, $r)
          $left -= $r
        }
      }
    } finally { $fs.Dispose() }
  } catch {
    # 브라우저가 연결을 먼저 끊는 경우 등은 무시
  } finally {
    $client.Close()
  }
}

$shared = [hashtable]::Synchronized(@{ stop = $false })
$pool = [RunspaceFactory]::CreateRunspacePool(1, 8)
$pool.Open()
$jobs = New-Object System.Collections.ArrayList

Write-Host ''
Write-Host '  AI 모션 챌린지 로컬 서버 실행 중' -ForegroundColor Yellow
Write-Host "  주소: $Url  (이 PC 에서만 접속 가능)"
Write-Host "  폴더: $Root"
Write-Host '  이 창을 닫으면 게임이 종료됩니다. 종료: Ctrl+C 또는 창 닫기' -ForegroundColor DarkGray
Write-Host ''

Open-Browser

try {
  while (-not $shared.stop) {
    if ($listener.Pending()) {
      $client = $listener.AcceptTcpClient()
      $ps = [PowerShell]::Create()
      $ps.RunspacePool = $pool
      [void]$ps.AddScript($handler).AddArgument($client).AddArgument($Root).AddArgument($shared)
      [void]$jobs.Add(@{ ps = $ps; h = $ps.BeginInvoke() })
    } else {
      Start-Sleep -Milliseconds 5
    }
    for ($i = $jobs.Count - 1; $i -ge 0; $i--) {
      $j = $jobs[$i]
      if ($j.h.IsCompleted) { try { [void]$j.ps.EndInvoke($j.h) } catch { }; $j.ps.Dispose(); $jobs.RemoveAt($i) }
    }
  }
  Start-Sleep -Milliseconds 300
  Write-Host '  게임 화면에서 [프로그램 종료]를 눌러 서버를 종료했습니다.' -ForegroundColor Yellow
} finally {
  $listener.Stop()
  $pool.Close()
}
