@echo off
echo 🎯 Julia Canvas 启动器
echo.

echo 🚀 启动Julia后端服务...
start "Julia Backend" cmd /k "cd julia-backend && julia --project=. start_server.jl"

timeout /t 2

echo 🌐 启动React前端服务...
start "React Frontend" cmd /k "cd example-react-flow && pnpm dev"

echo.
echo ✅ 服务启动完成！
echo 📡 后端: http://127.0.0.1:8081
echo 🌐 前端: http://127.0.0.1:5173
echo.
echo 关闭命令行窗口来停止对应的服务
pause 