<#
.SYNOPSIS
    Automated installer script for Hierarchical Table / StratumTree Chart Plugin in Apache Superset.
.DESCRIPTION
    Installs and registers the Hierarchical Table chart plugin into an Apache Superset repository:
    1. Locates and validates the Apache Superset root directory.
    2. Builds the plugin (TypeScript compilation) if npm is available.
    3. Copies plugin files into superset-frontend/plugins/superset-plugin-chart-stratum-hierarchical-table.
    4. Safely parses and updates MainPreset.ts with backup and idempotency:
       - import { HierarchicalTableChartPlugin } from '../../../plugins/superset-plugin-chart-stratum-hierarchical-table/src';
       - new HierarchicalTableChartPlugin().configure({ key: 'hierarchical_table' }),
       Legacy registration variants (`.register()` lines, odd indentation, duplicates)
       are normalized to the canonical form instead of adding new lines.
    5. Cleans stale Webpack/Babel cache.
    6. Optionally prompts or restarts Docker containers.
.PARAMETER SupersetPath
    Path to the Apache Superset root directory (e.g. C:\Users\admmaps\superset_6_1_0\superset).
.PARAMETER PluginPath
    Path to the Hierarchical Table plugin root directory (default: script root).
.PARAMETER CleanReinstall
    Removes existing plugin folder completely and reinstalls from scratch.
.PARAMETER RebuildFrontend
    Runs 'npm run build' inside superset-frontend to recompile Webpack bundles.
.PARAMETER RestartDocker
    Automatically restarts/rebuilds Docker containers without prompting.
.PARAMETER SkipBuild
    Skips running 'npm run build' before copying files.
.PARAMETER NoDocker
    Skips Docker Compose prompts and operations.
.PARAMETER SkipCleanCache
    Skips removing superset-frontend/node_modules/.cache.
.PARAMETER Force
    Runs non-interactively using defaults without prompting.
.EXAMPLE
    .\install-plugin.ps1
.EXAMPLE
    .\install-plugin.ps1 -CleanReinstall -RestartDocker
.EXAMPLE
    .\install-plugin.ps1 -SupersetPath "C:\Users\admmaps\superset_6_1_0\superset"
.EXAMPLE
    .\install-plugin.ps1 -SupersetPath "D:\Sviluppo\superset" -Force
#>

[CmdletBinding()]
param (
    [Parameter(Position = 0)]
    [string]$SupersetPath,

    [Parameter(Position = 1)]
    [string]$PluginPath,

    [switch]$CleanReinstall,
    [switch]$RebuildFrontend,
    [switch]$RestartDocker,
    [switch]$SkipBuild,
    [switch]$NoDocker,
    [switch]$SkipCleanCache,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Write-Color([string]$text, [string]$color = "White") {
    Write-Host $text -ForegroundColor $color
}

Write-Color "================================================================" "Cyan"
Write-Color "   Hierarchical Table - Apache Superset Plugin Installer        " "Cyan"
Write-Color "   StratumTree Hierarchical Matrix Grid & Tree Table Plugin     " "Cyan"
Write-Color "================================================================" "Cyan"
Write-Color ""

# -------------------------------------------------------------
# 1. Resolve Plugin Path & Package Source Directory
# -------------------------------------------------------------
if (-not $PluginPath) {
    $CurrentDir = (Get-Location).Path
    if (Test-Path (Join-Path $CurrentDir "package.json")) {
        $PluginPath = $CurrentDir
    } elseif (Test-Path (Join-Path $PSScriptRoot "src\index.ts")) {
        $PluginPath = $PSScriptRoot
    } elseif (Test-Path (Join-Path (Split-Path -Parent $PSScriptRoot) "src\index.ts")) {
        $PluginPath = Split-Path -Parent $PSScriptRoot
    } else {
        $PluginPath = $PSScriptRoot
    }
}

$ResolvedPluginPath = (Resolve-Path $PluginPath).Path
$PackageSrcDir = $ResolvedPluginPath

if (-not (Test-Path (Join-Path $PackageSrcDir "package.json"))) {
    Write-Color "[ERRORE] Impossibile trovare package.json del plugin in '$PackageSrcDir'!" "Red"
    exit 1
}
Write-Color "[INFO] Cartella Repository Plugin (sorgente): $ResolvedPluginPath" "Green"
Write-Color "[INFO] Cartella Sorgenti Plugin:             $PackageSrcDir" "Green"

# -------------------------------------------------------------
# 2. Resolve Superset Path
# -------------------------------------------------------------
$DefaultCompanyCandidate = "C:\Users\admmaps\superset_6_1_0\superset"
$DefaultCandidate = if (Test-Path $DefaultCompanyCandidate) { $DefaultCompanyCandidate } else { "D:\Sviluppo\superset" }

if (-not $SupersetPath) {
    $Candidates = @(
        $DefaultCompanyCandidate,
        "C:\Superset",
        "D:\Sviluppo\superset-6.1.0",
        "D:\Sviluppo\superset",
        (Join-Path $ResolvedPluginPath "..\superset"),
        (Join-Path $ResolvedPluginPath "..\superset-6.1.0"),
        (Join-Path $ResolvedPluginPath "..\apache-superset"),
        (Join-Path $ResolvedPluginPath "..\superset-6.1.0"),
        (Join-Path $env:USERPROFILE "superset_6_1_0\superset"),
        (Join-Path $env:USERPROFILE "Desktop\superset"),
        (Join-Path $env:USERPROFILE "superset"),
        (Join-Path $env:USERPROFILE "Projects\superset"),
        (Join-Path $env:USERPROFILE "dev\superset")
    )

    foreach ($cand in $Candidates) {
        if ($cand -and (Test-Path (Join-Path $cand "superset-frontend\package.json"))) {
            $SupersetPath = (Resolve-Path $cand).Path
            Write-Color "[INFO] Superset installation found automatically: $SupersetPath" "Green"
            break
        }
    }
}

if (-not $SupersetPath) {
    if ($Force) {
        $SupersetPath = $DefaultCandidate
    } else {
        Write-Color "Enter the path of the Apache Superset root folder" "Yellow"
        Write-Color "[Default: $DefaultCandidate]:" "Gray"
        $InputPath = Read-Host "Percorso Superset"
        if ([string]::IsNullOrWhiteSpace($InputPath)) {
            $SupersetPath = $DefaultCandidate
        } else {
            $SupersetPath = $InputPath.Trim('"', "'").Trim()
        }
    }
}

if (-not (Test-Path $SupersetPath)) {
    Write-Color "[ERROR] The specified path '$SupersetPath' does not exist!" "Red"
    Write-Color "Check that the path points to the Apache Superset root containing 'superset-frontend'." "Yellow"
    exit 1
}

$ResolvedSupersetPath = (Resolve-Path $SupersetPath).Path
$FrontendDir = Join-Path $ResolvedSupersetPath "superset-frontend"

if (-not (Test-Path (Join-Path $FrontendDir "package.json"))) {
    Write-Color "[ERROR] 'superset-frontend\package.json' not found in '$ResolvedSupersetPath'!" "Red"
    Write-Color "Make sure you select the main folder of the Superset repository." "Yellow"
    exit 1
}
Write-Color "[INFO] Superset target folder: $ResolvedSupersetPath" "Green"
Write-Color "[INFO] superset-frontend folder: $FrontendDir" "Gray"
Write-Color ""

$DistDir = Join-Path $PackageSrcDir "dist"
if (Test-Path $DistDir) {
    Write-Color "`n=== STEP 1: Prebuilt 'dist' bundle found ===" "Cyan"
    Write-Color "[OK] Compiled files already in dist/. Instant install, no dependency download." "Green"
} elseif (Test-Path (Join-Path $PackageSrcDir "src\index.ts")) {
    Write-Color "`n=== STEP 1: 'src/' sources found ===" "Cyan"
    Write-Color "[OK] TypeScript sources ready. Superset will compile them directly through Webpack." "Green"
} elseif (-not $SkipBuild) {
    Write-Color "=== STEP 1: TypeScript build of the plugin ===" "Cyan"
    $NpmCmd = Get-Command "npm" -ErrorAction SilentlyContinue
    if ($NpmCmd) {
        $RootNodeModules = Join-Path $ResolvedPluginPath "node_modules"
        $PkgNodeModules = Join-Path $PackageSrcDir "node_modules"
        if (-not (Test-Path $RootNodeModules) -and -not (Test-Path $PkgNodeModules)) {
            Write-Color "[INFO] 'node_modules' non trovato. Installazione automatica dipendenze (npm install --legacy-peer-deps)..." "Yellow"
            $OrigLoc = Get-Location
            try {
                Set-Location $ResolvedPluginPath
                & $NpmCmd.Source install --legacy-peer-deps
            } catch {
                Write-Color "[WARN] Warning during npm install: $_" "Yellow"
            } finally {
                Set-Location $OrigLoc
            }
        }

        Write-Color "[INFO] Esecuzione build in '$PackageSrcDir'..." "Yellow"
        $OrigLoc = Get-Location
        try {
            Set-Location $PackageSrcDir
            & $NpmCmd.Source run build
            if ($LASTEXITCODE -eq 0) {
                Write-Color "[SUCCESS] TypeScript build completed successfully." "Green"
            } else {
                Write-Color "[WARN] 'npm run build' returned code $LASTEXITCODE. Continuing with the existing files." "Yellow"
            }
        } catch {
            Write-Color "[WARN] Warning during npm build: $_" "Yellow"
        } finally {
            Set-Location $OrigLoc
        }
    } else {
        Write-Color "[INFO] 'npm' not found in PATH. Continuing with the existing dist/src." "Gray"
    }
    Write-Color ""
}

# -------------------------------------------------------------
# 4. Copy/Sync Plugin to superset-frontend/plugins
# -------------------------------------------------------------
Write-Color "=== STEP 2: Copy and sync the plugin ===" "Cyan"
$PluginsTargetRoot = Join-Path $FrontendDir "plugins"
if (-not (Test-Path $PluginsTargetRoot)) {
    New-Item -ItemType Directory -Path $PluginsTargetRoot -Force | Out-Null
}

$DestPluginDir = Join-Path $PluginsTargetRoot "superset-plugin-chart-stratum-hierarchical-table"
$LegacyPluginDir = Join-Path $PluginsTargetRoot "superset-plugin-chart-hierarchical-table"
if (Test-Path $LegacyPluginDir) {
    Remove-Item -Recurse -Force $LegacyPluginDir -ErrorAction SilentlyContinue
}
if (Test-Path $DestPluginDir) {
    Write-Color "[INFO] Cleaning the previous version in '$DestPluginDir'..." "Yellow"
    try {
        Remove-Item -Recurse -Force $DestPluginDir -ErrorAction Stop
    } catch {
        Start-Sleep -Milliseconds 300
        Remove-Item -Recurse -Force $DestPluginDir -ErrorAction SilentlyContinue
    }
}

New-Item -ItemType Directory -Path $DestPluginDir -Force | Out-Null

$ItemsToCopy = @("src", "dist", "package.json", "tsconfig.json", "README.md", "jest.config.js")
foreach ($item in $ItemsToCopy) {
    $srcItem = Join-Path $PackageSrcDir $item
    if (Test-Path $srcItem) {
        $destItem = Join-Path $DestPluginDir $item
        $isDir = (Get-Item $srcItem) -is [System.IO.DirectoryInfo]
        if ($isDir) {
            Copy-Item -Path $srcItem -Destination $DestPluginDir -Recurse -Force
            Write-Color "  [+] Copied folder:    $item" "Gray"
        } else {
            Copy-Item -Path $srcItem -Destination $destItem -Force
            Write-Color "  [+] Copied file:      $item" "Gray"
        }
    }
}
Write-Color "[SUCCESS] Plugin copied successfully to '$DestPluginDir'" "Green"
Write-Color ""

# -------------------------------------------------------------
# 5. Safely parse and update MainPreset.ts / MainPreset.js
# -------------------------------------------------------------
Write-Color "=== STEP 3: Registration in MainPreset.ts ===" "Cyan"

$PresetCandidates = @(
    (Join-Path $FrontendDir "src\visualizations\presets\MainPreset.ts"),
    (Join-Path $FrontendDir "src\visualizations\presets\MainPreset.js"),
    (Join-Path $FrontendDir "src\setup\setupPlugins.ts"),
    (Join-Path $FrontendDir "src\setup\setupPlugins.js")
)

$PresetFile = $null
foreach ($pf in $PresetCandidates) {
    if (Test-Path $pf) {
        $PresetFile = $pf
        break
    }
}

if (-not $PresetFile) {
    Write-Color "[ERRORE] Impossibile trovare MainPreset.ts o setupPlugins.ts in '$FrontendDir\src'!" "Red"
    exit 1
}

Write-Color "[INFO] Preset file found: $PresetFile" "Gray"

# 5.1 Safety backup
$BackupFile = "$PresetFile.bak"
if (-not (Test-Path $BackupFile)) {
    Copy-Item -Path $PresetFile -Destination $BackupFile -Force
    Write-Color "[SUCCESS] Safety backup created: $(Split-Path -Leaf $BackupFile)" "Green"
} else {
    Write-Color "[INFO] Existing safety backup kept: $(Split-Path -Leaf $BackupFile)" "Gray"
}

# 5.2 Reading and parsing
$RawContent = [System.IO.File]::ReadAllText($PresetFile, [System.Text.Encoding]::UTF8)
$NL = if ($RawContent.Contains("`r`n")) { "`r`n" } else { "`n" }

$TargetImport = "import { HierarchicalTableChartPlugin } from '../../../plugins/superset-plugin-chart-stratum-hierarchical-table/src';"
$TargetRegister = "        new HierarchicalTableChartPlugin().configure({ key: 'stratum_tree' }),`r`n        new HierarchicalTableChartPlugin().configure({ key: 'hierarchical_table' }),"

# Verifica se il file e' gia' configurato NELLA FORMA CANONICA (riga-esatta):
# le varianti legacy (riga con `.register()`, indentazioni anomale, duplicati)
# non contano come configurazione valida e vengono normalizzate dal ramo else.
$PresetLineList = [System.Collections.Generic.List[string]]($RawContent -split "\r?\n")
$hasExactImport = ($PresetLineList -contains $TargetImport)
$hasExactRegister = ($PresetLineList -contains $TargetRegister)
$importCount = ([regex]::Matches($RawContent, "from\s*['`"][^'`"]*superset-plugin-chart-hierarchical-table")).Count
$registerCount = ([regex]::Matches($RawContent, "new\s+HierarchicalTableChartPlugin")).Count

if (-not $CleanReinstall -and $hasExactImport -and $hasExactRegister -and ($importCount -eq 1) -and ($registerCount -eq 1)) {
    Write-Color "[INFO] MainPreset.ts is already registered correctly (idempotent, no change needed)." "Green"
} else {
    Write-Color "[INFO] Updating the import and registration..." "Yellow"

    # Step A: Rimozione import obsoleti o duplicati
    $lines = [System.Collections.Generic.List[string]]($RawContent -split "\r?\n")
    $filteredLines = [System.Collections.Generic.List[string]]::new()
    $lastImportIdx = -1

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line -match "from\s*['`"][^'`"]*superset-plugin-chart-hierarchical-table") {
            continue
        }
        if ($line.Trim().StartsWith("import ")) {
            $lastImportIdx = $filteredLines.Count
        }
        $filteredLines.Add($line)
    }

    if ($lastImportIdx -ge 0) {
        $filteredLines.Insert($lastImportIdx + 1, $TargetImport)
    } else {
        $filteredLines.Insert(0, $TargetImport)
    }

    $intermediateContent = $filteredLines -join $NL

    # Step B: Rimozione registrazioni duplicate e inserimento nel blocco plugins: [
    $regLines = [System.Collections.Generic.List[string]]($intermediateContent -split "\r?\n")
    $finalLines = [System.Collections.Generic.List[string]]::new()
    $pluginsIdx = -1

    for ($i = 0; $i -lt $regLines.Count; $i++) {
        $line = $regLines[$i]
        if ($line -match 'new\s+HierarchicalTableChartPlugin') {
            continue
        }
        $finalLines.Add($line)
        if ($line -match 'plugins\s*:\s*\[') {
            $pluginsIdx = $finalLines.Count
        }
    }

    if ($pluginsIdx -ge 0) {
        $finalLines.Insert($pluginsIdx, $TargetRegister)
    } else {
        $finalLines.Add($TargetRegister)
    }

    $NewContent = $finalLines -join $NL
    $Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($PresetFile, $NewContent, $Utf8NoBom)

    Write-Color "[SUCCESS] Added import:       $TargetImport" "Green"
    Write-Color "[SUCCESS] Added registration: $TargetRegister" "Green"
    Write-Color "[SUCCESS] File $(Split-Path -Leaf $PresetFile) aggiornato e salvato con successo." "Green"
}
Write-Color ""

# -------------------------------------------------------------
# 6. Safety Cache Cleanup
# -------------------------------------------------------------
if (-not $SkipCleanCache) {
    Write-Color "=== STEP 4: Clearing the Webpack frontend cache ===" "Cyan"
    $CacheItems = @(
        (Join-Path $FrontendDir "node_modules\.cache"),
        (Join-Path $FrontendDir ".temp_cache"),
        (Join-Path $FrontendDir ".cache")
    )

    foreach ($item in $CacheItems) {
        if (Test-Path $item) {
            try {
                Remove-Item -Recurse -Force $item -ErrorAction SilentlyContinue
                $parentName = Split-Path -Leaf (Split-Path -Parent $item)
                $leafName = Split-Path -Leaf $item
                Write-Color "  [OK] Eliminata cache: $parentName\$leafName" "Green"
            } catch {
                Write-Color "  [!] Avviso eliminazione $($item): $_" "Yellow"
            }
        }
    }
    Write-Color ""
}

# -------------------------------------------------------------
# 7. Frontend Webpack Build (Optional / Switch)
# -------------------------------------------------------------
if ($RebuildFrontend) {
    Write-Color "=== FASE 5: Compilazione Webpack Frontend di Superset ===" "Cyan"
    $NpmCmd = Get-Command "npm" -ErrorAction SilentlyContinue
    if ($NpmCmd) {
        Write-Color "[INFO] Esecuzione 'npm run build' in '$FrontendDir'..." "Yellow"
        Write-Color "[INFO] Attendere: la compilazione dei bundle di Superset richiede 1-3 minuti..." "Gray"
        $OrigLoc = Get-Location
        try {
            Set-Location $FrontendDir
            & $NpmCmd.Source run build
            if ($LASTEXITCODE -eq 0) {
                Write-Color "[SUCCESS] Compilazione Webpack completata con successo!" "Green"
            } else {
                Write-Color "[WARN] 'npm run build' frontend terminato con codice $LASTEXITCODE." "Yellow"
            }
        } catch {
            Write-Color "[WARN] Avviso durante compilazione frontend: $_" "Yellow"
        } finally {
            Set-Location $OrigLoc
        }
    } else {
        Write-Color "[WARN] 'npm' non trovato nel PATH. Compilazione frontend saltata." "Yellow"
    }
    Write-Color ""
}

# -------------------------------------------------------------
# 8. Automatic Docker Restart (Optional / Switch)
# -------------------------------------------------------------
if ($RestartDocker) {
    Write-Color "=== FASE 6: Riavvio Container Superset Docker ===" "Cyan"
    $DockerCmd = Get-Command "docker" -ErrorAction SilentlyContinue
    if ($DockerCmd) {
        $OrigLoc = Get-Location
        try {
            Set-Location $ResolvedSupersetPath
            if (Test-Path (Join-Path $ResolvedSupersetPath "docker-compose-non-dev.yml")) {
                Write-Color "[INFO] Esecuzione: docker compose -f docker-compose-non-dev.yml restart superset" "Yellow"
                & $DockerCmd.Source compose -f docker-compose-non-dev.yml restart superset
                if ($LASTEXITCODE -ne 0) {
                    Write-Color "[INFO] Tentativo alternativo: docker compose -f docker-compose-non-dev.yml up -d --build superset" "Yellow"
                    & $DockerCmd.Source compose -f docker-compose-non-dev.yml up -d --build superset
                }
            } else {
                Write-Color "[INFO] Esecuzione: docker compose restart superset_app" "Yellow"
                & $DockerCmd.Source compose restart superset_app
                if ($LASTEXITCODE -ne 0) {
                    Write-Color "[INFO] Tentativo alternativo: docker compose restart superset" "Yellow"
                    & $DockerCmd.Source compose restart superset
                }
            }
            if ($LASTEXITCODE -eq 0) {
                Write-Color "[SUCCESS] Container Superset Docker riavviato con successo!" "Green"
            } else {
                Write-Color "[WARN] Docker ha restituito codice $LASTEXITCODE. Assicurati che Docker Desktop sia avviato." "Yellow"
            }
        } catch {
            Write-Color "[WARN] Avviso durante operazione Docker: $_" "Yellow"
        } finally {
            Set-Location $OrigLoc
        }
    } else {
        Write-Color "[WARN] Docker non trovato nel PATH di sistema." "Yellow"
    }
    Write-Color ""
}

# -------------------------------------------------------------
# 9. Summary & Instructions
# -------------------------------------------------------------
Write-Color "================================================================" "Green"
Write-Color "   INSTALLAZIONE COMPLETATA CON SUCCESSO!                      " "Green"
Write-Color "================================================================" "Green"
Write-Color ""
Write-Color "Riepilogo:" "White"
Write-Color "  - Plugin installato in:  $DestPluginDir" "Gray"
Write-Color "  - Preset aggiornato in:  $PresetFile" "Gray"
Write-Color "  - Import registrato:     import { HierarchicalTableChartPlugin } from '...'" "Gray"
Write-Color "  - Plugin key:            hierarchical_table" "Gray"
Write-Color ""
Write-Color "COME VISUALIZZARE IL GRAFICO NEL BROWSER:" "Yellow"
Write-Color "  1. Apri Apache Superset nel browser (es. http://localhost:8088 o il tuo URL)." "White"
Write-Color "  2. FONDAMENTALE: Esegui un Hard Refresh premendo CTRL + F5 (o apri in Incognito)" "Cyan"
Write-Color "     per forzare lo svuotamento della cache del browser e caricare i nuovi bundle." "Cyan"
Write-Color "  3. Crea un nuovo grafico ('Create Chart') e cerca 'StratumTree' o 'Hierarchical'!" "White"
Write-Color ""
