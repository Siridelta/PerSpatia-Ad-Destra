# 简化版 Julia Canvas 启动脚本
# 快速启动前后端服务

Write-Host "🎯 Julia Canvas 快速启动" -ForegroundColor Magenta

# 启动后端
Write-Host "🚀 启动后端服务..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-Command", "cd julia-backend; julia --project=. start_server.jl" -WindowStyle Minimized

# 等待2秒
Start-Sleep -Seconds 2

# 启动前端
Write-Host "🌐 启动前端服务..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-Command", "cd example-react-flow; pnpm dev" -WindowStyle Minimized

Write-Host ""
Write-Host "✅ 服务启动中..." -ForegroundColor Green
Write-Host "📡 后端API: http://127.0.0.1:8081" -ForegroundColor Cyan
Write-Host "🌐 前端界面: http://127.0.0.1:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "提示: 使用完整版脚本获得更多功能:" -ForegroundColor Yellow
Write-Host "  .\start-services.ps1 -Help" -ForegroundColor Gray 