# Stops the project-local MariaDB instance started by scripts/start-db.ps1.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$admin = $null

$installs = Get-ChildItem "$env:ProgramFiles\MariaDB*" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
foreach ($install in $installs) {
  $candidate = Join-Path $install.FullName 'bin\mariadb-admin.exe'
  if (Test-Path $candidate) {
    $admin = $candidate
    break
  }
}

if ($admin) {
  & $admin -u root -h 127.0.0.1 shutdown 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host 'MariaDB stopped.'
    exit 0
  }
}

$process = Get-Process mariadbd -ErrorAction SilentlyContinue
if ($process) {
  $process | Stop-Process
  Write-Host 'MariaDB process stopped.'
} else {
  Write-Host 'MariaDB is not running.'
}
