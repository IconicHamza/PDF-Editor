$projectPath = "C:\Users\htari\.gemini\antigravity\scratch\pdf-suite"
Set-Location -Path $projectPath

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "GitHub CLI (gh) is not installed or not in PATH." -ForegroundColor Red
    exit 1
}

gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "You are not logged into GitHub CLI!" -ForegroundColor Yellow
    Write-Host "Please run this command first in your terminal:" -ForegroundColor White
    Write-Host "  gh auth login" -ForegroundColor Cyan
    Write-Host "And follow the prompts. Then run this script again." -ForegroundColor White
    exit 1
}

$username = gh api user -q .login
if (-not $username) {
    Write-Host "Failed to get GitHub username." -ForegroundColor Red
    exit 1
}

# Fix Git identity
git config --global user.name $username
git config --global user.email "$username@users.noreply.github.com"

$repoUrl = "https://github.com/$username/PDF-Editor.git"

if (-not (Test-Path .git)) {
    Write-Host "Initializing local git repository and linking to $repoUrl..." -ForegroundColor Cyan
    git init
    git remote add origin $repoUrl
    
    Write-Host "Syncing with the files you manually uploaded earlier..." -ForegroundColor Cyan
    git fetch origin
    git reset --mixed origin/main
}

Write-Host "Deploying updates to GitHub..." -ForegroundColor Cyan
git add .
git commit -m "Automated update from AI"

# Ensure we are using the 'main' branch, as some older Git versions default to 'master'
git branch -M main

git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully pushed to GitHub! The Action is building your site now." -ForegroundColor Green
} else {
    Write-Host "Failed to push to GitHub. Please check the errors above." -ForegroundColor Red
}
