# Shared Git index path outside .git/index (avoids Cursor/IDE file locks on Windows).

function Get-StreamHubRepoRoot {
    param([string]$StartPath = (Get-Location).Path)

    $gitExe = Get-StreamHubRealGit
    $root = & $gitExe -C $StartPath rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -eq 0 -and $root) {
        return $root.Trim()
    }
    return $null
}

function Get-StreamHubRealGit {
    if ($env:STREAMHUB_REAL_GIT -and (Test-Path $env:STREAMHUB_REAL_GIT)) {
        return $env:STREAMHUB_REAL_GIT
    }

    foreach ($candidate in @(
            "${env:ProgramFiles}\Git\cmd\git.exe",
            "${env:ProgramFiles(x86)}\Git\cmd\git.exe"
        )) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    $command = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($command -and $command.Source -notmatch '[\\/]StreamHub[\\/]scripts[\\/]git\.(cmd|ps1)$') {
        return $command.Source
    }

    throw "Git executable not found. Install Git for Windows or set STREAMHUB_REAL_GIT."
}

function Get-StreamHubGitIndexFile {
    param([string]$RepoRoot = (Get-StreamHubRepoRoot))

    if (-not $RepoRoot) {
        throw "Not inside a Git repository."
    }

    $safeName = ($RepoRoot -replace '[\\/:*?"<>|]', '_').ToLowerInvariant()
    $dir = Join-Path $env:LOCALAPPDATA "StreamHub\git-index"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    return Join-Path $dir "$safeName.index"
}

function Initialize-StreamHubGitIndex {
    param(
        [string]$RepoRoot = (Get-StreamHubRepoRoot),
        [string]$IndexFile = (Get-StreamHubGitIndexFile -RepoRoot $RepoRoot)
    )

    if (-not $RepoRoot) {
        return $IndexFile
    }

    if (Test-Path $IndexFile) {
        return $IndexFile
    }

    $gitExe = Get-StreamHubRealGit
    $legacyIndex = Join-Path $RepoRoot ".git\index"
    if (Test-Path $legacyIndex) {
        Copy-Item $legacyIndex $IndexFile -Force
        return $IndexFile
    }

    $previousIndex = $env:GIT_INDEX_FILE
    $env:GIT_INDEX_FILE = $IndexFile
    try {
        & $gitExe -C $RepoRoot read-tree HEAD | Out-Null
    } finally {
        if ($null -ne $previousIndex) {
            $env:GIT_INDEX_FILE = $previousIndex
        } else {
            Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
        }
    }

    return $IndexFile
}

function Use-StreamHubGitIndex {
    param([string]$RepoRoot = (Get-StreamHubRepoRoot))

    $indexFile = Initialize-StreamHubGitIndex -RepoRoot $RepoRoot
    $env:GIT_INDEX_FILE = $indexFile
    return $indexFile
}
