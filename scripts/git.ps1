param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\git-index.ps1"

$repoRoot = Get-StreamHubRepoRoot -StartPath (Get-Location).Path
if ($repoRoot) {
    Use-StreamHubGitIndex -RepoRoot $repoRoot | Out-Null
}

$gitExe = Get-StreamHubRealGit
& $gitExe @Args
exit $LASTEXITCODE
