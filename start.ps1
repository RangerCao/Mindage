param([string]$Command="menu",[int]$Port=9621)
$RootDir=Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvActivate="$RootDir\.venv\Scripts\Activate.ps1"
$WorkingDir="$RootDir\rag_storage"
function Show-Menu {
    Clear-Host
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "     LightRAG Startup Script" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  1. Start API Server (localhost:$Port)" -ForegroundColor Green
    Write-Host "  2. Start Debug Mode (hot reload)" -ForegroundColor Yellow
    Write-Host "  3. Manage Workspaces" -ForegroundColor Magenta
    Write-Host "  4. Clear Data" -ForegroundColor Red
    Write-Host "  5. Build Frontend" -ForegroundColor Blue
    Write-Host "  6. Stop Server" -ForegroundColor DarkRed
    Write-Host "  q. Quit" -ForegroundColor Gray
    Write-Host "========================================" -ForegroundColor Cyan
}
function Start-Server {
    param([switch]$Reload)
    Write-Host "Starting LightRAG Server on port $Port ..."
    & $VenvActivate
    if ($Reload) {
        python -m uvicorn lightrag.api.lightrag_server:app --host 0.0.0.0 --port $Port --reload
    } else {
        python -m lightrag.api.lightrag_server --host 0.0.0.0 --port $Port
    }
    Read-Host "Press Enter to return"
}
function Manage-Workspace {
    Clear-Host
    Write-Host "=== Workspace Manager ===" -ForegroundColor Magenta
    $workspaces = Get-ChildItem -Path $WorkingDir -Directory -ErrorAction SilentlyContinue `
        | Where-Object { -not $_.Name.StartsWith('.') } `
        | Select-Object -ExpandProperty Name
    if ($workspaces) {
        Write-Host "Existing workspaces:"
        $i=1; foreach($ws in $workspaces) { Write-Host "  $i. $ws"; $i++ }
    } else { Write-Host "(no workspaces)" }
    Write-Host "  n - New workspace"
    Write-Host "  d - Delete workspace"
    Write-Host "  b - Back to menu"
    $choice = Read-Host "Choice"
    switch ($choice) {
        "n" {
            $name = Read-Host "Workspace name (a-z,0-9,_)"
            if ($name -match '^[a-zA-Z0-9_]+$') {
                New-Item -ItemType Directory -Force -Path "$WorkingDir\$name" | Out-Null
                Write-Host "Created [$name]" -ForegroundColor Green
            } else { Write-Host "Invalid name" -ForegroundColor Red }
            Start-Sleep 2; Manage-Workspace
        }
        "d" {
            if ($workspaces) {
                $idx = Read-Host "Number to delete"
                if ($idx -match '^\d+$' -and [int]$idx -ge 1 -and [int]$idx -le $workspaces.Count) {
                    $name = $workspaces[[int]$idx-1]
                    $confirm = Read-Host "Delete [$name]? (y/n)"
                    if ($confirm -eq 'y') {
                        Remove-Item -Recurse -Force "$WorkingDir\$name" -ErrorAction SilentlyContinue
                        Write-Host "Deleted [$name]" -ForegroundColor Green
                    }
                }
            }
            Start-Sleep 2; Manage-Workspace
        }
        "b" { return }
        default { Write-Host "Invalid option" -ForegroundColor Red; Start-Sleep 1; Manage-Workspace }
    }
}
function Clear-Data {
    $confirm = Read-Host "Clear ALL data? (y/n)"
    if ($confirm -eq 'y') {
        Remove-Item -Recurse -Force "$WorkingDir\*" -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force "$RootDir\inputs\*" -ErrorAction SilentlyContinue
        Write-Host "Data cleared" -ForegroundColor Green
    }
    Start-Sleep 2
}
function Build-Frontend {
    Write-Host "Building frontend..." -ForegroundColor Blue
    Push-Location "$RootDir\lightrag_webui"
    bun install --frozen-lockfile 2>&1 | Out-Null
    bun run build 2>&1 | Out-Null
    Pop-Location
    Write-Host "Frontend built" -ForegroundColor Green
    Start-Sleep 2
}
function Stop-Server {
    $procs = Get-Process -Name python -ErrorAction SilentlyContinue `
        | Where-Object { $_.CommandLine -match "lightrag_server" }
    if ($procs) { $procs | Stop-Process -Force; Write-Host "Server stopped" -ForegroundColor Green }
    else { Write-Host "No server running" -ForegroundColor Gray }
    Start-Sleep 2
}
switch ($Command) {
    "server" { Start-Server; return }
    "debug" { Start-Server -Reload; return }
}
while ($true) {
    Show-Menu
    $choice = Read-Host "Enter option"
    switch ($choice) {
        "1" { Start-Server }
        "2" { Start-Server -Reload }
        "3" { Manage-Workspace }
        "4" { Clear-Data }
        "5" { Build-Frontend }
        "6" { Stop-Server }
        "q" { Write-Host "Bye!"; exit }
        default { Write-Host "Invalid" -ForegroundColor Red; Start-Sleep 1 }
    }
}
