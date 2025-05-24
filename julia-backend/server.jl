#!/usr/bin/env julia

# Julia Canvas Backend 启动脚本

using Pkg

# 激活当前环境并安装依赖
Pkg.activate(@__DIR__)
Pkg.instantiate()

# 导入主模块
include("src/JuliaCanvasBackend.jl")
using .JuliaCanvasBackend

function main()
    println("🚀 启动 Julia Canvas Backend...")
    
    # 启动服务器
    try
        start_server(8080, "127.0.0.1")
        
        println("✅ 服务器运行在 http://127.0.0.1:8080")
        println("📋 可用的API端点:")
        println("   GET  /api/health   - 健康检查")
        println("   POST /api/evaluate - 执行代码")
        println("   POST /api/parse    - 解析代码")
        println()
        println("按 Ctrl+C 停止服务器")
        
        # 保持服务器运行
        while true
            sleep(1)
        end
        
    catch InterruptException
        println("\n🛑 正在停止服务器...")
        stop_server()
        println("✅ 服务器已停止")
    catch e
        println("❌ 启动失败: $e")
        rethrow(e)
    end
end

# 如果直接运行此脚本，启动服务器
if abspath(PROGRAM_FILE) == @__FILE__
    main()
end 