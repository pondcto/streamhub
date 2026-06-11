# Loaded by the workspace terminal so plain `git` uses the external index wrapper.
$gitWrapper = Join-Path $PSScriptRoot "git.ps1"
if (Test-Path $gitWrapper) {
    function git {
        & $gitWrapper @args
    }
}
