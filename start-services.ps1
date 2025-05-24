# Julia Canvas 开发环境启动脚本
# 自动启动前端开发服务器和Julia后端服务

param(
    [switch]$JuliaOnly,
    [switch]$FrontendOnly,
    [switch]$Help
)

if ($Help) {
    Write-Host "Julia Canvas 开发环境启动脚本" -ForegroundColor Green
    Write-Host ""
    Write-Host "用法："
    Write-Host "  .\start-services.ps1           # 启动所有服务"
    Write-Host "  .\start-services.ps1 -JuliaOnly    # 仅启动Julia后端"
    Write-Host "  .\start-services.ps1 -FrontendOnly # 仅启动前端服务器"
    Write-Host "  .\start-services.ps1 -Help         # 显示帮助"
    Write-Host ""
    Write-Host "注意：请确保已安装Julia、Node.js和pnpm"
    exit 0
}

# 检查依赖
function Test-Dependency {
    param($Command, $Name)
    
    if (!(Get-Command $Command -ErrorAction SilentlyContinue)) {
        Write-Host "❌ 缺少依赖: $Name" -ForegroundColor Red
        Write-Host "请先安装 $Name" -ForegroundColor Yellow
        return $false
    }
    return $true
}

Write-Host "🚀 Julia Canvas 开发环境启动中..." -ForegroundColor Green

# 检查必要的依赖
$dependencies_ok = $true

if (!$FrontendOnly) {
    if (!(Test-Dependency "julia" "Julia")) {
        $dependencies_ok = $false
    }
}

if (!$JuliaOnly) {
    if (!(Test-Dependency "node" "Node.js")) {
        $dependencies_ok = $false
    }
    if (!(Test-Dependency "pnpm" "pnpm")) {
        $dependencies_ok = $false
    }
}

if (!$dependencies_ok) {
    Write-Host "❌ 依赖检查失败，请安装缺少的依赖后重试" -ForegroundColor Red
    exit 1
}

# 启动Julia后端
if (!$FrontendOnly) {
    Write-Host "🔧 启动Julia后端..." -ForegroundColor Cyan
    
    # 检查Julia后端目录
    if (!(Test-Path "julia-backend")) {
        Write-Host "❌ 找不到 julia-backend 目录" -ForegroundColor Red
        exit 1
    }
    
    # 安装Julia依赖
    Write-Host "📦 安装Julia依赖..." -ForegroundColor Yellow
    Set-Location "julia-backend"
    
    # 激活Julia环境并安装依赖
    julia --project=. -e "using Pkg; Pkg.instantiate()" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Julia依赖安装失败" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    
    Write-Host "✅ Julia依赖安装完成" -ForegroundColor Green
    
    # 回到根目录
    Set-Location ..
    
    Write-Host "🎯 Julia后端已准备就绪" -ForegroundColor Green
    Write-Host "📌 请手动启动Julia后端服务器：" -ForegroundColor Yellow
    Write-Host "   cd julia-backend" -ForegroundColor Cyan
    Write-Host "   julia server.jl" -ForegroundColor Cyan
    Write-Host ""
}

# 启动前端开发服务器
if (!$JuliaOnly) {
    Write-Host "🌐 启动前端开发服务器..." -ForegroundColor Cyan
    
    # 检查前端目录
    if (!(Test-Path "example-react-flow")) {
        Write-Host "❌ 找不到 example-react-flow 目录" -ForegroundColor Red
        exit 1
    }
    
    Set-Location "example-react-flow"
    
    # 安装前端依赖
    Write-Host "📦 安装前端依赖..." -ForegroundColor Yellow
    pnpm install 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 前端依赖安装失败" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    
    Write-Host "✅ 前端依赖安装完成" -ForegroundColor Green
    
    # 回到根目录
    Set-Location ..
    
    Write-Host "🎯 前端开发环境已准备就绪" -ForegroundColor Green
    Write-Host "📌 请手动启动前端开发服务器：" -ForegroundColor Yellow
    Write-Host "   cd example-react-flow" -ForegroundColor Cyan
    Write-Host "   pnpm dev" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "🎉 所有服务已准备完毕！" -ForegroundColor Green
Write-Host ""
Write-Host "💡 启动顺序建议：" -ForegroundColor Yellow
Write-Host "   1. 先启动Julia后端 (端口8081)" -ForegroundColor Cyan  
Write-Host "   2. 再启动前端服务器 (端口5173)" -ForegroundColor Cyan
Write-Host ""
Write-Host "🌐 访问地址："
Write-Host "   前端: http://localhost:5173" -ForegroundColor Cyan
Write-Host "   后端: http://localhost:8081/api/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") 