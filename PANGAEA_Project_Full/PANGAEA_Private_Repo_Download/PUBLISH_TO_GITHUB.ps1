param([string]$RepoName = "pangaea-autonomous-world")
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$owner = "SalvatoreP888"
$repo = "$owner/$RepoName"
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is not installed. Download Git for Windows: https://git-scm.com/download/win"
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI is not installed. Install it with: winget install --id GitHub.cli --exact"
}
Write-Host "Checking GitHub authentication..."
$oldPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try { gh auth status 2>$null | Out-Null; $authExit = $LASTEXITCODE }
finally { $ErrorActionPreference = $oldPref }
if ($authExit -ne 0) {
    Write-Host "GitHub authentication is required; follow the browser instructions."
    gh auth login --hostname github.com --git-protocol https --web
    if ($LASTEXITCODE -ne 0) { throw "GitHub authentication failed." }
}
$whoOutput = gh api user --jq .login
if ($LASTEXITCODE -ne 0) { throw "Could not determine the authenticated GitHub account." }
$who = ($whoOutput | Out-String).Trim()
if ($who -ne $owner) {
    throw "Wrong GitHub account: '$who'. Expected '$owner'. Run gh auth switch."
}
$oldPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try { gh repo view $repo --json name --jq .name 2>$null | Out-Null; $repoViewExit = $LASTEXITCODE }
finally { $ErrorActionPreference = $oldPref }
if ($repoViewExit -eq 0) { throw "$repo already exists. Refusing to overwrite." }
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.git')) {
    Write-Host "Existing local Git history found; checking it before publishing."
} else {
    Write-Host "Initializing local Git repository..."
    git init -b main
    if ($LASTEXITCODE -ne 0) { throw "git init failed." }
    git config user.name $owner
    git config user.email "130804547+SalvatoreP888@users.noreply.github.com"
    git add -A
    if ($LASTEXITCODE -ne 0) { throw "git add failed." }
    git commit -m "Initial import: PANGAEA depth 0.2 and autonomous-agent handoff"
    if ($LASTEXITCODE -ne 0) { throw "git commit failed." }
}
$branch = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') { throw "Expected local 'main' branch." }
$remotes = @(git remote)
if ($LASTEXITCODE -ne 0) { throw "Could not inspect remotes." }
if ($remotes -contains 'origin') { throw "An origin remote already exists. Refusing to overwrite it." }
$dirty = @(git status --porcelain)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) { throw "Uncommitted changes exist. Please inspect them first." }
Write-Host "Creating a NEW PRIVATE repository and pushing main..."
gh repo create $repo --private --source . --remote origin --push --description "PANGAEA: autonomous civilization simulation and development handoff"
if ($LASTEXITCODE -ne 0) { throw "Repository creation/push failed; inspect GitHub permissions." }
$privacyOutput = gh api "repos/$repo" --jq .private
if ($LASTEXITCODE -ne 0 -or ($privacyOutput | Out-String).Trim() -ne 'true') { throw "Could not verify private status; review repository settings." }
Write-Host "SUCCESS: private repository verified at https://github.com/$repo"
