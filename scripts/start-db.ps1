# Starts the project-local MariaDB instance used for development on this machine.
# Requires MariaDB (or MySQL) binaries under "C:\Program Files\MariaDB*".
# For a normal MySQL installation or Docker, use that instead — see README.md.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $root '.tools'
$data = Join-Path $tools 'mariadb-data'

function Test-Port([int]$Port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync('127.0.0.1', $Port)
    return ($task.Wait(400) -and $client.Connected)
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

if (Test-Port 3306) {
  Write-Host 'Something is already listening on port 3306 — nothing to do.'
  exit 0
}

$bin = $null
$installs = Get-ChildItem "$env:ProgramFiles\MariaDB*" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
foreach ($install in $installs) {
  $candidate = Join-Path $install.FullName 'bin'
  if (Test-Path (Join-Path $candidate 'mariadbd.exe')) {
    $bin = $candidate
    break
  }
}

if (-not $bin) {
  throw 'MariaDB was not found. Install MariaDB/MySQL or start your own database server on port 3306.'
}

New-Item -ItemType Directory -Force -Path $tools | Out-Null

if (-not (Test-Path (Join-Path $data 'mysql'))) {
  Write-Host 'Initialising a fresh data directory…'
  New-Item -ItemType Directory -Force -Path $data | Out-Null
  & (Join-Path $bin 'mariadb-install-db.exe') --datadir="$data" | Out-Host
}

$args = @("--datadir=$data", '--port=3306', '--bind-address=127.0.0.1')
$defaults = Join-Path $data 'my.ini'
if (Test-Path $defaults) {
  $args = @("--defaults-file=$defaults") + $args
}

Start-Process -FilePath (Join-Path $bin 'mariadbd.exe') `
  -ArgumentList ($args | ForEach-Object { if ($_ -match '\s') { "`"$_`"" } else { $_ } }) `
  -RedirectStandardOutput (Join-Path $tools 'mariadb.out.log') `
  -RedirectStandardError (Join-Path $tools 'mariadb.err.log') `
  -WindowStyle Hidden

for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Port 3306) {
    Write-Host 'MariaDB started on 127.0.0.1:3306'
    exit 0
  }
}

throw 'The database did not start. Check .tools\mariadb.err.log for details.'
