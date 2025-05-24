# Julia Canvas 启动脚本
Write-Host "🎯 Julia Canvas 启动器" -ForegroundColor Magenta

# 启动后端
Write-Host "🚀 启动Julia后端..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-Command", "cd julia-backend; julia --project=. start_server.jl; Read-Host 'Press Enter to exit'"

# 等待
Start-Sleep -Seconds 2

# 启动前端  
Write-Host "🌐 启动React前端..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-Command", "cd example-react-flow; pnpm dev"

Write-Host ""
Write-Host "✅ 服务启动完成！" -ForegroundColor Green
Write-Host "📡 后端: http://127.0.0.1:8081" -ForegroundColor Cyan
Write-Host "🌐 前端: http://127.0.0.1:5173" -ForegroundColor Cyan 