param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("sql", "warframe", "lightrag", "default")]
    [string]$Workspace
)

$RootDir = "D:\LightRAG-main"
$Ports = @{
    "lightrag" = 9623
    "default"  = 9621
}
$WorkDirs = @{
    "lightrag" = "$RootDir\rag_storage_lightrag"
    "default"  = "$RootDir\rag_storage"
}

$port = $Ports[$Workspace]
$workDir = $WorkDirs[$Workspace]

# 创建工作目录
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  启动工作区: $Workspace" -ForegroundColor Green
Write-Host "  端口: $port" -ForegroundColor Yellow
Write-Host "  数据目录: $workDir" -ForegroundColor Yellow
Write-Host "  访问地址: http://localhost:$port" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 切换到项目目录并启动
Set-Location $RootDir
$env:WORKING_DIR = $workDir
.venv\Scripts\Activate.ps1
python -m lightrag.api.lightrag_server
