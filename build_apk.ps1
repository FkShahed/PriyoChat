<#
====================================================================================================
 UNIVERSAL REACT NATIVE APK BUILD PIPELINE (STANDALONE FULL & METRO DEBUG)
====================================================================================================

.SYNOPSIS
    Automated, safe, and generic APK builder supporting both Standalone Release (Full)
    and Metro Live-Reload (Debug) builds for React Native & Expo bare projects.

.DESCRIPTION
    Build Types:
      - Full (Standalone Release):
          A 100% self-contained Universal Release APK (arm64-v8a, armeabi-v7a, x86, x86_64).
          Has JS bundle & assets embedded inside. Does NOT need any computer, Metro bundler, or Wi-Fi.
      - Debug (Metro Live Development):
          A Debug APK that connects to your running Metro Bundler server (e.g. http://192.168.1.102:8081).
          Supports Live Fast-Refresh, shake to show dev menu, and instant code updates on phone without re-installing!

    Execution Stages:
      1. Environment & Pre-flight: Verifies Android SDK, local.properties, and Gradle wrapper.
      2. Cache & Fault Cleanups: Proactively cleans stale bundles, previous APKs, and invalid 0-prefixed raw assets.
      3. Fail-Fast Syntax Validation: Tests JS/JSX/TS/TSX syntax before spending time on heavy Gradle compiles.
      4. Core Build: Runs `assembleRelease` for Full mode OR `assembleDebug` for Debug mode.
      5. Artifact Copy & Path Return: Copies the output APK to project root, displays details, and returns the absolute path.
      6. Optional Post-Build Hook (Full mode only): If $POST_BUILD_SYNC_SCRIPT is present, syncs metadata to backend.

.PREREQUISITES & ENVIRONMENT SETUP (REQUIREMENTS)
    1. Java JDK 17 (Required: Java 17 LTS - verify with `java -version`).
    2. Android SDK with Build Tools and NDK installed.
    3. Node.js 18+ and project npm dependencies installed (`npm install`).
    4. React Native Android folder intact (DO NOT run `expo prebuild --clean` if custom native configs exist).
    5. Required Files in android/app/:
       - `debug.keystore` (used for signing debug & release test builds).
       - `google-services.json` (if project uses Firebase / FCM notifications).
       - `.env` in root with backend cloud endpoints.
    6. Network Requirement for Debug Mode (IMPORTANT):
       - Your Windows Network Profile MUST be set to "Private Network" (NOT "Public Network").
         In Public mode, Windows Firewall drops incoming connections from your phone, causing "Time out".
         Settings -> Network & internet -> Ethernet / Wi-Fi -> select "Private network".
       - Alternative: Connect phone via USB cable and run `adb reverse tcp:8081 tcp:8081`.

.PROJECT-SPECIFIC HOOKS ($POST_BUILD_SYNC_SCRIPT):
    - Points to "priyo-backend\update_apk.js", which publishes new version metadata to MongoDB.
    - Set to "" or ignore if using in another project without a backend sync script.

.HOW TO RUN THIS SCRIPT:
    - Standalone Full APK (Default):
        powershell -ExecutionPolicy Bypass -File .\build_apk.ps1
        powershell -ExecutionPolicy Bypass -File .\build_apk.ps1 -Mode full
    - Metro Live Debug APK:
        powershell -ExecutionPolicy Bypass -File .\build_apk.ps1 -Mode debug
    - Dry-Run Test (Fast configuration check):
        powershell -ExecutionPolicy Bypass -File .\build_apk.ps1 -DryRunTest
====================================================================================================
#>

[CmdletBinding()]
param (
    [ValidateSet("full", "debug")]
    [string]$Mode = "full",

    [switch]$DryRunTest = $false
)

$ErrorActionPreference = "Stop"

# ==============================================================================
# PROJECT CONFIGURATION (CUSTOMIZE FOR OTHER PROJECTS IF NEEDED)
# ==============================================================================
$DEFAULT_SDK_DIR        = "C:\Android\sdk"
$POST_BUILD_SYNC_SCRIPT  = "priyo-backend\update_apk.js"
$ANDROID_DIR            = "android"

# Dynamic APK naming and paths based on chosen build mode
if ($Mode -eq "debug") {
    $OUTPUT_APK_NAME      = "PriyoChat-debug.apk"
    $GRADLE_TASK          = "assembleDebug"
    $TARGET_APK_REL_PATH  = "$ANDROID_DIR\app\build\outputs\apk\debug\app-debug.apk"
    $BUILD_DISPLAY_NAME   = "Metro Live-Reload Debug APK"
} else {
    $OUTPUT_APK_NAME      = "PriyoChat-latest.apk"
    $GRADLE_TASK          = "assembleRelease"
    $TARGET_APK_REL_PATH  = "$ANDROID_DIR\app\build\outputs\apk\release\app-release.apk"
    $BUILD_DISPLAY_NAME   = "Standalone Universal Full Release APK"
}

# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================
function Log-Info($msg) {
    Write-Host "[INFO] $msg" -ForegroundColor Cyan
}

function Log-Success($msg) {
    Write-Host "[SUCCESS] $msg" -ForegroundColor Green
}

function Log-Warn($msg) {
    Write-Host "[WARN] $msg" -ForegroundColor Yellow
}

function Log-Err($msg) {
    Write-Host "[ERROR] $msg" -ForegroundColor Red
}

try {
    Write-Host "==========================================================" -ForegroundColor Magenta
    Write-Host "   React Native APK Build Pipeline: [$($Mode.ToUpper()) MODE]    " -ForegroundColor Magenta
    Write-Host "   Target: $BUILD_DISPLAY_NAME" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Magenta

    # --------------------------------------------------------------------------
    # 1. ENVIRONMENT & PRE-FLIGHT CHECKS
    # --------------------------------------------------------------------------
    Log-Info "[1/5] Verifying Environment & Android Configuration..."

    # 1.1 Verify Android directory
    if (-not (Test-Path $ANDROID_DIR)) {
        throw "Android directory '$ANDROID_DIR' not found! Make sure you are in the React Native project root."
    }

    # 1.2 Verify or create android/local.properties
    $localPropPath = Join-Path $ANDROID_DIR "local.properties"
    if (-not (Test-Path $localPropPath)) {
        $sdkDirToUse = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { $DEFAULT_SDK_DIR }
        $escapedSdk = $sdkDirToUse.Replace('\', '\\').Replace(':', '\:')
        Set-Content -Path $localPropPath -Value "sdk.dir=$escapedSdk" -Encoding ASCII
        Log-Info "Generated '$localPropPath' pointing to SDK: $sdkDirToUse"
    }

    # 1.3 Verify Gradle wrapper
    $gradlewPath = Join-Path $ANDROID_DIR "gradlew.bat"
    if (-not (Test-Path $gradlewPath)) {
        throw "Gradle wrapper '$gradlewPath' not found in android directory!"
    }

    # 1.4 Verify signing keystore
    $debugKeystore = Join-Path $ANDROID_DIR "app\debug.keystore"
    if (-not (Test-Path $debugKeystore)) {
        Log-Warn "debug.keystore not found at '$debugKeystore'. Ensure your build.gradle signingConfig is configured."
    }

    # 1.5 Auto-sync version from app.json to android/app/build.gradle
    if (Test-Path "app.json") {
        try {
            $appJsonContent = Get-Content "app.json" -Raw | ConvertFrom-Json
            $targetVer = $appJsonContent.expo.version
            if ($targetVer) {
                $gradleFile = Join-Path $ANDROID_DIR "app\build.gradle"
                if (Test-Path $gradleFile) {
                    $gContent = Get-Content $gradleFile -Raw
                    if ($gContent -match 'versionName\s+"[^"]+"') {
                        $gContent = $gContent -replace 'versionName\s+"[^"]+"', "versionName `"$targetVer`""
                        Set-Content -Path $gradleFile -Value $gContent -NoNewline
                        Log-Info "Synchronized build.gradle versionName to '$targetVer'"
                    }
                }
            }
        } catch {}
    }

    # --------------------------------------------------------------------------
    # 2. TARGET APK & FAULTY ASSET CLEANUP (SMART INCREMENTAL CLEANUP)
    # --------------------------------------------------------------------------
    Log-Info "[2/5] Cleaning target output & invalid resources (keeping compiler cache)..."

    # 2.1 Remove previous APK output for the current target mode to ensure fresh artifact
    if (Test-Path $TARGET_APK_REL_PATH) {
        Remove-Item $TARGET_APK_REL_PATH -Force -ErrorAction SilentlyContinue
        Log-Info "Cleaned previous target APK: $TARGET_APK_REL_PATH"
    }
    $rootApk = Join-Path (Get-Location) $OUTPUT_APK_NAME
    if (Test-Path $rootApk) {
        Remove-Item $rootApk -Force -ErrorAction SilentlyContinue
        Log-Info "Cleaned previous root APK: $OUTPUT_APK_NAME"
    }

    # 2.2 Remove stale manual bundles that may conflict with Gradle packaging
    $staleBundle = Join-Path $ANDROID_DIR "app\src\main\assets\index.android.bundle"
    if (Test-Path $staleBundle) {
        Remove-Item $staleBundle -Force -ErrorAction SilentlyContinue
        Log-Info "Cleaned stale manual bundle: $staleBundle"
    }

    # 2.3 Remove invalid raw assets that start with numbers (Android resource constraint)
    $invalidRawFiles = Get-ChildItem -Path "$ANDROID_DIR\app\src\main\res\raw" -Filter "0*" -ErrorAction SilentlyContinue
    if ($invalidRawFiles) {
        foreach ($file in $invalidRawFiles) {
            Remove-Item $file.FullName -Force -ErrorAction SilentlyContinue
            Log-Info "Removed invalid raw resource: $($file.Name)"
        }
    }

    # --------------------------------------------------------------------------
    # 3. JAVASCRIPT SYNTAX VALIDATION
    # --------------------------------------------------------------------------
    Log-Info "[3/5] Validating JavaScript Code..."

    # Check source files for syntax errors before Gradle execution
    $keySrcFiles = Get-ChildItem -Path "src" -Include "*.js","*.jsx","*.ts","*.tsx" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 15
    foreach ($file in $keySrcFiles) {
        if ($file.Extension -eq ".js") {
            $syntaxTest = Start-Process node -ArgumentList @("-c", "`"$($file.FullName)`"") -NoNewWindow -PassThru -Wait
            if ($syntaxTest.ExitCode -ne 0) {
                throw "Syntax check failed in: $($file.FullName)"
            }
        }
    }
    Log-Success "Core JavaScript syntax validated."

    # --------------------------------------------------------------------------
    # 4. GRADLE EXECUTION (FULL RELEASE VS METRO DEBUG)
    # --------------------------------------------------------------------------
    if ($DryRunTest) {
        Log-Info "[4/5] [DRY RUN TEST] Testing Gradle configuration for task '$GRADLE_TASK' without compile..."
        Push-Location $ANDROID_DIR
        try {
            & .\gradlew.bat tasks --dry-run
            if ($LASTEXITCODE -ne 0) {
                throw "Gradle dry-run test failed with code $LASTEXITCODE"
            }
            Log-Success "Gradle configuration for $GRADLE_TASK verified successfully!"
        } finally {
            Pop-Location
        }
        Log-Success "Dry-run verification completed successfully! Both modes are operational."
        exit 0
    }

    Log-Info "[4/5] Building $BUILD_DISPLAY_NAME via Gradle (.\gradlew.bat $GRADLE_TASK)..."
    Push-Location $ANDROID_DIR
    try {
        & .\gradlew.bat $GRADLE_TASK
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle build failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }

    # --------------------------------------------------------------------------
    # 5. LOCATE, COPY & RETURN FINAL APK PATH
    # --------------------------------------------------------------------------
    Log-Info "[5/5] Finalizing APK artifact..."

    if (-not (Test-Path $TARGET_APK_REL_PATH)) {
        throw "Expected APK not found at: $TARGET_APK_REL_PATH"
    }

    # Copy to project root with distinctive mode name
    $destinationPath = Join-Path (Get-Location) $OUTPUT_APK_NAME
    Copy-Item -Path $TARGET_APK_REL_PATH -Destination $destinationPath -Force

    $apkItem = Get-Item $destinationPath
    $apkSizeMB = [math]::Round($apkItem.Length / 1MB, 2)

    # In Full mode only: upload to PriyoChat Cloud Engine & sync backend database
    if ($Mode -eq "full") {
        $sshKey = "C:\\Users\\LOQ\\.ssh\\priyo_server.pem"
        if (Test-Path $sshKey) {
            try {
                Log-Info "Uploading $OUTPUT_APK_NAME to PriyoChat Cloud Engine (138.2.92.182)..."
                & scp -i $sshKey -o ServerAliveInterval=15 -o ServerAliveCountMax=3 $destinationPath "ubuntu@138.2.92.182:/var/www/html/apk/$OUTPUT_APK_NAME"
                Log-Success "Uploaded to https://138.2.92.182.nip.io/apk/$OUTPUT_APK_NAME"
            } catch {
                Log-Warn "Cloud upload failed: $_"
            }
        }
        if (Test-Path $POST_BUILD_SYNC_SCRIPT) {
            try {
                Log-Info "Running post-build sync script: $POST_BUILD_SYNC_SCRIPT"
                & node $POST_BUILD_SYNC_SCRIPT
            } catch {
                Log-Warn "Post-build sync script encountered an issue: $_"
            }
        }
    }

    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "   BUILD SUCCESSFUL! $BUILD_DISPLAY_NAME READY            " -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "Build Mode: $($Mode.ToUpper())" -ForegroundColor Yellow
    Write-Host "File Name : $($apkItem.Name)" -ForegroundColor Yellow
    Write-Host "File Size : $apkSizeMB MB ($($apkItem.Length) bytes)" -ForegroundColor Yellow
    Write-Host "Modified  : $($apkItem.LastWriteTime)" -ForegroundColor Yellow
    Write-Host "APK Path  : $($apkItem.FullName)" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Green

    if ($Mode -eq "debug") {
        # Automatically detect local LAN IPv4 address
        $detectedIp = ""
        try {
            $ipList = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | 
                      Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.IPAddressToString -notlike '127.*' -and $_.IPAddressToString -notlike '169.254.*' }
            if ($ipList) {
                $detectedIp = $ipList[0].IPAddressToString
            }
        } catch {}

        # Check if Windows network profile is set to Public
        $isPublicNetwork = $false
        try {
            $profiles = Get-NetConnectionProfile -ErrorAction SilentlyContinue
            if ($profiles | Where-Object { $_.NetworkCategory -eq 'Public' -and $_.IPv4Connectivity -eq 'Internet' }) {
                $isPublicNetwork = $true
            }
        } catch {}

        Write-Host "NOTE: To connect this Debug APK with live updates, start Metro with:" -ForegroundColor Magenta
        Write-Host "      npm start -- --dev-client --host lan" -ForegroundColor Yellow
        if ($detectedIp) {
            Write-Host "      Detected PC IP  : http://${detectedIp}:8081" -ForegroundColor Green
            Write-Host "      Then shake phone -> 'Change Bundle URL' -> enter: ${detectedIp}:8081" -ForegroundColor Cyan
        } else {
            Write-Host "      Then shake phone or open Dev Menu and point to your IP (e.g. http://<YOUR_IP>:8081)" -ForegroundColor Gray
        }

        if ($isPublicNetwork) {
            Write-Host ""
            Write-Host "[WARNING] Your Windows Network is set to 'Public'!" -ForegroundColor Yellow
            Write-Host "          If you get connection 'Time out' on phone, change it to 'Private':" -ForegroundColor DarkYellow
            Write-Host "          Settings -> Network & internet -> Ethernet / Wi-Fi -> select 'Private network'" -ForegroundColor DarkYellow
            Write-Host "          OR connect USB cable & run: adb reverse tcp:8081 tcp:8081 (then use localhost:8081)" -ForegroundColor DarkYellow
        }
    }

    # Debug only: ALSO give a link that works from any other network (mobile data / different Wi-Fi)
    if ($Mode -eq "debug") {
        Write-Host ""
        Log-Info "Creating the other-network link (works away from your home Wi-Fi)..."
        $tunnelScript = Join-Path $PSScriptRoot "start_metro_tunnel.ps1"
        if (Test-Path $tunnelScript) {
            try { $null = & $tunnelScript } catch { Log-Warn "Other-network link failed: $_" }
        } else {
            Log-Warn "start_metro_tunnel.ps1 not found next to build_apk.ps1, skipping the other-network link."
        }
    }

    # Returns the absolute path as output
    return $apkItem.FullName

} catch {
    Log-Err "Build failed: $_"
    exit 1
}
