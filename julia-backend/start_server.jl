#!/usr/bin/env julia

# 简单的服务器启动脚本

println("🚀 正在启动 Julia Canvas Backend...")

try
    # 导入主模块
    include("src/JuliaCanvasBackend.jl")
    using .JuliaCanvasBackend
    
    println("✅ 模块加载成功")
    
    # 启动服务器
    println("🌐 启动HTTP服务器...")
    start_server(8081, "127.0.0.1")
    
    println("✅ 服务器启动成功，访问: http://127.0.0.1:8081")
    println("按 Ctrl+C 停止服务器")
    
    # 保持运行
    try
        while true
            sleep(1)
        end
    catch InterruptException
        println("\n🛑 正在停止服务器...")
        stop_server()
        println("✅ 服务器已停止")
    end
    
catch e
    println("❌ 启动失败:")
    println(e)
    println()
    for (exc, bt) in Base.catch_stack()
        showerror(stdout, exc, bt)
        println()
    end
end 