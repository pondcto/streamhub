# One-time bootstrap for the external Git index (safe to re-run).
$ErrorActionPreference = "Stop"

. "$PSScriptRoot\git-index.ps1"

$repoRoot = Get-StreamHubRepoRoot -StartPath (Join-Path $PSScriptRoot "..")
if (-not $repoRoot) {
    Write-Error "Run this script from inside the StreamHub repository."
}

$indexFile = Initialize-StreamHubGitIndex -RepoRoot $repoRoot
Write-Host "Git index: $indexFile"
Write-Host "Restart the terminal or Cursor so git.path / GIT_INDEX_FILE settings apply."
