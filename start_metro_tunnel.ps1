<#
====================================================================================================
 METRO PUBLIC TUNNEL (connect the Debug APK from ANY network, not just the same Wi-Fi)
====================================================================================================

.SYNOPSIS
    Gives your running Metro bundler a public https link, so the Debug APK on your phone can load live
    updates from this PC even when the phone is on mobile data or a different Wi-Fi.

.DESCRIPTION
    - Downloads cloudflared once into .\tools (free Cloudflare "quick tunnel", no account needed).
    - Starts scripts\metro-tunnel-proxy.js (fixes the ":8081" Expo puts in the manifest) and cloudflared.
    - Prints the public link and how to use it on the phone.
    - Called automatically at the end of:  build_apk.ps1 -Mode debug
    - You can also run it alone any time the link stops working (a quick-tunnel link changes each time):
          powershell -ExecutionPolicy Bypass -File .\start_metro_tunnel.ps1

.NOTES
    - Metro must be running on this PC:   npm start -- --dev-client --host lan
    - The PC must stay on and online.
    - The link is public: anyone who has it can load your app bundle, so do not share it.
====================================================================================================
#>

[CmdletBinding()]
param (
    [int]$Port = 8090,        # local port of the proxy that the tunnel points to
    [int]$MetroPort = 8081
)

$ErrorActionPreference = "Stop"
$root     = $PSScriptRoot
$toolsDir = Join-Path $root "tools"
$exe      = Join-Path $toolsDir "cloudflared.exe"
$proxyJs  = Join-Path $root "scripts\metro-tunnel-proxy.js"
$stateDir = Join-Path $env:TEMP "priyochat-tunnel-$Port"
$errLog   = Join-Path $stateDir "cloudflared.err.log"
$outLog   = Join-Path $stateDir "cloudflared.out.log"

function Say($msg, $color = "Cyan") { Write-Host $msg -ForegroundColor $color }

try {
    if (-not (Test-Path $proxyJs)) { throw "Missing $proxyJs" }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js was not found in PATH." }

    # 1) cloudflared (downloaded once)
    if (-not (Test-Path $exe)) {
        Say "[TUNNEL] Downloading cloudflared (one time, ~55 MB)..."
        New-Item -ItemType Directory -Force $toolsDir | Out-Null
        Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $exe -UseBasicParsing
    }

    # 2) stop an older tunnel/proxy of ours on this port, so we never leave stale ones running
    Get-CimInstance Win32_Process | Where-Object {
        ($_.Name -eq "cloudflared.exe" -and $_.CommandLine -match "localhost:$Port(\s|$)") -or
        ($_.Name -eq "node.exe" -and $_.CommandLine -match "metro-tunnel-proxy\.js.*\b$Port\b") -or
        ($Port -eq 8090 -and $_.Name -eq "node.exe" -and $_.CommandLine -match "fixproxy\.js")
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 600

    New-Item -ItemType Directory -Force $stateDir | Out-Null
    Remove-Item $errLog, $outLog -ErrorAction SilentlyContinue

    # 3) proxy, then the tunnel (both hidden, they keep running after this script ends)
    Start-Process -FilePath "node" -ArgumentList "`"$proxyJs`" $Port $MetroPort" -WindowStyle Hidden
    Start-Sleep -Seconds 1
    Start-Process -FilePath $exe -ArgumentList "tunnel --url http://localhost:$Port --no-autoupdate" `
        -RedirectStandardError $errLog -RedirectStandardOutput $outLog -WindowStyle Hidden

    # 4) wait for the public link
    $url = $null
    for ($i = 0; $i -lt 45 -and -not $url; $i++) {
        Start-Sleep -Milliseconds 700
        if (Test-Path $errLog) {
            $hit = Select-String -Path $errLog -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($hit) { $url = $hit.Matches[0].Value }
        }
    }
    if (-not $url) { throw "The tunnel did not give a link in time. Check your internet connection and run start_metro_tunnel.ps1 again." }

    # 5) is Metro actually reachable through it? A brand-new link needs a few seconds before its name
    #    resolves everywhere, so retry for up to ~40 s instead of reporting a false failure.
    # (curl.exe ships with Windows 10/11 and resolves brand-new names more reliably than .NET's web client)
    Say "[TUNNEL] Link created: $url" "Green"
    Say "[TUNNEL] A brand-new link needs up to ~1 minute before it works. Checking it now..." "Cyan"
    $metroState = "not-reachable"
    for ($i = 0; $i -lt 28; $i++) {
        $code = (& curl.exe -s -m 8 -o NUL -w "%{http_code}" "$url/status" 2>$null)
        if ($code -eq "200") {
            $body = (& curl.exe -s -m 8 "$url/status" 2>$null)
            if ($body -match "packager-status:running") { $metroState = "running" } else { $metroState = "not-ready" }
            break
        }
        if ($code -match "^5dd$") { $metroState = "metro-down"; break }   # the link works, Metro itself is off
        Start-Sleep -Seconds 4   # name not resolvable yet, keep waiting (new links take ~60 s on some PCs)
    }

    Write-Host ""
    Say "==========================================================" "Magenta"
    Say "   OTHER-NETWORK LINK (mobile data / any Wi-Fi)" "Magenta"
    Say "==========================================================" "Magenta"
    Say "   $url" "Green"
    Write-Host ""
    Say "On the phone: open the Debug app -> 'Enter URL manually' -> paste the link above" "Cyan"
    Say "(use the whole link starting with https://, no port number), then Connect." "Cyan"
    if ($metroState -eq "running") {
        Say "Metro check : OK, the bundler is reachable through this link." "Green"
    } elseif ($metroState -eq "not-reachable") {
        Say "Metro check : the link is still going live. Wait a little more, then use it." "Yellow"
    } else {
        Say "Metro check : Metro is not answering yet. Start it with:  npm start -- --dev-client --host lan" "Yellow"
        Say "              (the link above stays valid; it works as soon as Metro is up)" "Yellow"
    }
    Say "Notes: the link changes each time this runs. PC must stay on. Do not share the link (it is public)." "DarkYellow"
    Say "==========================================================" "Magenta"

    return $url
} catch {
    Write-Host "[TUNNEL] Could not start the other-network link: $_" -ForegroundColor Yellow
    Write-Host "         (The same-Wi-Fi link above still works. You can retry with: .\start_metro_tunnel.ps1)" -ForegroundColor Yellow
    return $null
}
